import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { migratedDb } from '../../test/sqlite';
import { ENV } from '../config/env';
import { SessionService } from './session.service';

const meta = (ua: string, ip: string) => ({ ua, ip });

afterEach(() => {
  vi.useRealTimers();
});

describe('SessionService.listForUser', () => {
  it('marks the current session and sorts the rest by recency', async () => {
    vi.useFakeTimers();
    const sessions = new SessionService(migratedDb());
    vi.setSystemTime(1_000);
    const old = await sessions.create('u1', meta('A', '1.1.1.1'));
    vi.setSystemTime(2_000);
    const latest = await sessions.create('u1', meta('B', '2.2.2.2'));
    vi.setSystemTime(3_000);
    const here = await sessions.create('u1', meta('C', '3.3.3.3'));
    await sessions.create('u2', meta('D', '4.4.4.4'));
    vi.setSystemTime(4_000);
    await sessions.touch(latest, 'u1');

    const list = await sessions.listForUser('u1', here);

    expect(list.map((session) => session.id)).toEqual([here, latest, old]);
    expect(list[0]).toMatchObject({ current: true, ua: 'C', ip: '3.3.3.3', createdAt: 3_000, lastSeenAt: 3_000 });
    expect(list[1]).toMatchObject({ current: false, lastSeenAt: 4_000 });
  });

  it('drops sessions that have expired', async () => {
    vi.useFakeTimers();
    const sessions = new SessionService(migratedDb());
    vi.setSystemTime(0);
    await sessions.create('u1', meta('', ''));
    vi.setSystemTime(ENV.sessionTtlSeconds * 1000 - 1);
    const live = await sessions.create('u1', meta('', ''));
    vi.setSystemTime(ENV.sessionTtlSeconds * 1000 + 1);

    await expect(sessions.listForUser('u1')).resolves.toMatchObject([{ id: live }]);
  });

  it('returns nothing when the user has no sessions', async () => {
    await expect(new SessionService(migratedDb()).listForUser('u1')).resolves.toEqual([]);
  });
});

describe('SessionService lifecycle', () => {
  it('slides expiry on touch, like the Redis EXPIRE it replaces', async () => {
    vi.useFakeTimers();
    const sessions = new SessionService(migratedDb());
    const ttl = ENV.sessionTtlSeconds * 1000;
    vi.setSystemTime(0);
    const sid = await sessions.create('u1', meta('ua', 'ip'));
    vi.setSystemTime(ttl - 1);
    await sessions.touch(sid, 'u1');
    vi.setSystemTime(ttl + 10);
    await expect(sessions.get(sid)).resolves.toMatchObject({ userId: 'u1', lastSeenAt: ttl - 1 });
    vi.setSystemTime(2 * ttl);
    await expect(sessions.get(sid)).resolves.toBeNull();
    await sessions.touch(sid, 'u1');
    await expect(sessions.get(sid)).resolves.toBeNull();
  });

  it('revokes one session, then all sessions for a user', async () => {
    const sessions = new SessionService(migratedDb());
    const a = await sessions.create('u1', meta('', ''));
    const b = await sessions.create('u1', meta('', ''));
    const other = await sessions.create('u2', meta('', ''));

    await expect(sessions.revoke(a)).resolves.toBe('u1');
    await expect(sessions.revoke(a)).resolves.toBeNull();
    await expect(sessions.get(a)).resolves.toBeNull();
    await expect(sessions.countActive()).resolves.toBe(2);

    await sessions.revokeAll('u1');
    await expect(sessions.get(b)).resolves.toBeNull();
    await expect(sessions.get(other)).resolves.toMatchObject({ userId: 'u2' });
  });

  it('keeps login sessions across a process restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'auth-sessions-'));
    try {
      const path = join(dir, 'auth.db');
      const first = migratedDb(path);
      const sid = await new SessionService(first).create('u1', meta('ua', '127.0.0.1'));
      first.close();

      const second = migratedDb(path);
      await expect(new SessionService(second).get(sid)).resolves.toMatchObject({ userId: 'u1', ua: 'ua', ip: '127.0.0.1' });
      second.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
