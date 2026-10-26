import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migratedDb } from '../../test/sqlite';
import type { SqliteDb } from '../db/db';
import { UsersService } from '../users/users.service';
import { MembershipsService } from './memberships.service';

let db: SqliteDb;
let service: MembershipsService;
beforeEach(async () => {
  db = migratedDb();
  service = new MembershipsService(db);
  await db.query(`INSERT INTO users (id) VALUES ('u'), ('other')`);
  await db.query(`INSERT INTO clients (client_id, name, allowed_origins, default_redirect, secret_hash)
    VALUES ('n2c', 'Calendar', '[]', 'https://calendar.test', 'hash'),
           ('other', 'Other', '[]', 'https://other.test', 'hash')`);
  await service.ensure('u', 'n2c');
  await service.ensure('u', 'other');
  await service.ensure('other', 'n2c');
});
afterEach(() => db.close());

describe('membership lifecycle with migrated SQLite', () => {
  it('preserves withdrawal across ensure, scopes changes, and keeps sessions/users intact', async () => {
    const withdrawn = await service.transition('u', 'n2c', 'withdraw', 0);
    expect(withdrawn).toMatchObject({ state: 'withdrawn', version: 1, cleanupPending: true });
    await service.ensure('u', 'n2c');
    expect(await service.find('u', 'n2c')).toMatchObject({ status: 'withdrawn' });
    expect(await service.find('u', 'other')).toMatchObject({ status: 'active' });
    expect(await service.find('other', 'n2c')).toMatchObject({ status: 'active' });
    expect((await db.query('SELECT * FROM users')).rows).toHaveLength(2);
    expect(await service.listForUser('u')).toContainEqual(expect.objectContaining({ clientId: 'n2c', status: 'withdrawn' }));
    await expect(service.transition('u', 'n2c', 'rejoin', 1)).rejects.toThrow('cleanup pending');
    await expect(service.transition('u', 'n2c', 'ack', 1, 'wrong')).rejects.toThrow('cleanup does not match');
    await service.transition('u', 'n2c', 'ack', 1, withdrawn.cleanupId!);
    await service.transition('u', 'n2c', 'ack', 1, withdrawn.cleanupId!);
    expect(await service.transition('u', 'n2c', 'rejoin', 1)).toMatchObject({ state: 'active', version: 2, cleanupPending: false, cleanupId: null });
    await expect(service.transition('u', 'n2c', 'withdraw', 0)).rejects.toThrow('stale');
    await expect(service.transition('u', 'n2c', 'ack', 1, withdrawn.cleanupId!)).rejects.toThrow('stale');
    await expect(service.transition('u', 'n2c', 'rejoin', 1)).rejects.toThrow('stale');
  });

  it('serializes simultaneous withdrawals and preserves the receipt on lost-response retries', async () => {
    const [a, b] = await Promise.all([
      service.transition('u', 'n2c', 'withdraw', 0), service.transition('u', 'n2c', 'withdraw', 0),
    ]);
    expect(a).toEqual(b);
    expect(await service.transition('u', 'n2c', 'withdraw', 1)).toEqual(a);
    expect(await service.lifecycle('u', 'n2c')).toEqual(a);
  });

  it('retains suspension through withdrawal and admin changes cannot clear withdrawal', async () => {
    await db.query(`UPDATE memberships SET status = 'suspended', role = 'admin' WHERE user_id = 'u' AND client_id = 'n2c'`);
    const receipt = await service.transition('u', 'n2c', 'withdraw', 0);
    await service.transition('u', 'n2c', 'ack', 1, receipt.cleanupId!);
    await expect(service.transition('u', 'n2c', 'rejoin', 1)).rejects.toThrow('restricted');
    expect(await service.isAdmin('u')).toBe(false);
    await db.query(`UPDATE memberships SET status = 'active' WHERE user_id = 'u' AND client_id = 'n2c'`);
    expect(await service.find('u', 'n2c')).toMatchObject({ status: 'withdrawn' });
    expect(await service.isAdmin('u')).toBe(false);
    expect(await service.transition('u', 'n2c', 'rejoin', 1)).toMatchObject({ state: 'active' });
  });

  it('does not provision for identity checks and tombstones withdrawal even without a prior membership', async () => {
    await db.query(`DELETE FROM memberships WHERE user_id = 'u' AND client_id = 'n2c'`);
    expect(await service.lifecycle('u', 'n2c')).toEqual({ state: 'absent', version: 0, cleanupId: null, cleanupPending: false });
    expect(await service.find('u', 'n2c')).toBeNull();
    await service.transition('u', 'n2c', 'withdraw', 0);
    await service.ensure('u', 'n2c');
    expect(await service.find('u', 'n2c')).toMatchObject({ status: 'withdrawn' });
  });

  it('preserves first provisioning and full-account deletion queue/ack after withdrawal', async () => {
    await db.query(`DELETE FROM memberships WHERE user_id = 'other' AND client_id = 'n2c'`);
    await service.ensure('other', 'n2c');
    expect(await service.find('other', 'n2c')).toMatchObject({ status: 'active' });
    await service.transition('u', 'n2c', 'withdraw', 0);
    const users = new UsersService(db);
    expect(await users.listDeletions('n2c')).toEqual([]);
    await users.requestDeletion('u');
    expect(await service.find('u', 'n2c')).toBeNull();
    expect(await service.find('u', 'other')).toBeNull();
    expect(await service.find('other', 'n2c')).toMatchObject({ status: 'active' });
    expect(await users.listDeletions('n2c')).toEqual([expect.objectContaining({ userId: 'u' })]);
    await users.ackDeletion('u', 'n2c');
    await users.ackDeletion('u', 'n2c');
    expect(await users.listDeletions('n2c')).toEqual([]);
    expect(await users.listDeletions('other')).toEqual([expect.objectContaining({ userId: 'u' })]);
  });

  it('allows exactly one concurrent rejoin and fences previous cleanup in the next withdrawal', async () => {
    const first = await service.transition('u', 'n2c', 'withdraw', 0);
    await service.transition('u', 'n2c', 'ack', 1, first.cleanupId!);
    const results = await Promise.allSettled([
      service.transition('u', 'n2c', 'rejoin', 1), service.transition('u', 'n2c', 'rejoin', 1),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const second = await service.transition('u', 'n2c', 'withdraw', 2);
    expect(second.cleanupId).not.toBe(first.cleanupId);
    await expect(service.transition('u', 'n2c', 'ack', 3, first.cleanupId!)).rejects.toThrow('cleanup does not match');
  });
});
