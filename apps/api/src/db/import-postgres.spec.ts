import { describe, expect, it } from 'vitest';
import { migratedDb } from '../../test/sqlite';
import { ClientsService } from '../clients/clients.service';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../memberships/memberships.service';
import { AdminAuditService } from '../admin/admin-audit.service';
import { importPostgresExport, toIso, type PgExport } from './import-postgres';

const U1 = '0b6f5b0e-8c43-4d7a-9a51-2f5f4c3e9d01';
const U2 = '7f1c2d3e-4b5a-4c6d-8e7f-901234567890';
const GONE = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

// psql 의 json_agg 가 실제로 내는 모양 (timestamptz 는 마이크로초 + "+00:00", text[]/jsonb 는 JSON 값)
function pgExport(): PgExport {
  return {
    clients: [
      { client_id: 'gbl', name: 'Girls Band Live', logo_url: null, theme_color: '#ff0066', allowed_origins: ['https://band.bini59.dev'], default_redirect: 'https://band.bini59.dev/', auto_provision: false, onboarding_path: null, secret_hash: 'f'.repeat(64), created_at: '2026-08-01T01:02:03.123456+00:00', is_active: true },
      { client_id: 'alpha', name: 'Alpha', logo_url: null, theme_color: null, allowed_origins: ['http://localhost:3009'], default_redirect: 'http://localhost:3009/', auto_provision: true, onboarding_path: null, secret_hash: 'e'.repeat(64), created_at: '2026-08-02T00:00:00+00:00', is_active: false },
    ],
    users: [
      { id: U1, email: 'kevin@example.test', email_verified: true, name: 'Kevin', avatar_url: null, created_at: '2026-08-01T00:00:00.5+00:00', profile_completed_at: '2026-08-01T00:00:01.999999+00:00', avatar_source: 'provider', name_source: 'custom' },
      { id: U2, email: null, email_verified: false, name: null, avatar_url: 'https://static.bini59.dev/img/profile/x.png', created_at: '2026-08-03T10:00:00+00:00', profile_completed_at: null, avatar_source: 'custom', name_source: 'provider' },
    ],
    identities: [
      { provider: 'google', provider_user_id: 'g-1', user_id: U1, email_at_link: 'kevin@example.test', linked_at: '2026-08-01T00:00:00.5+00:00' },
      { provider: 'kakao', provider_user_id: 'k-1', user_id: U2, email_at_link: null, linked_at: '2026-08-03T10:00:00+00:00' },
    ],
    memberships: [
      { user_id: U1, client_id: 'gbl', role: 'admin', status: 'active', joined_at: '2026-08-01T00:00:02+00:00', last_seen_at: '2026-10-20T12:00:00.000001+00:00' },
      { user_id: U2, client_id: 'gbl', role: 'member', status: 'suspended', joined_at: '2026-08-04T00:00:00+00:00', last_seen_at: null },
    ],
    deletion_queue: [{ user_id: GONE, requested_at: '2026-09-01T00:00:00.654321+00:00' }],
    deletion_acks: [{ user_id: GONE, client_id: 'gbl', acked_at: '2026-09-01T00:10:00+00:00' }],
    admin_audit_log: [
      { id: 7, action: 'membership.update', target_user_id: U1, target_client_id: 'gbl', details: { role: 'admin' }, created_at: '2026-08-05T00:00:00+00:00' },
    ],
  };
}

describe('toIso', () => {
  it('normalizes Postgres timestamptz JSON to Date#toISOString()', () => {
    expect(toIso('2026-08-01T01:02:03.123456+00:00')).toBe('2026-08-01T01:02:03.123Z');
    expect(toIso('2026-08-01T10:02:03+09:00')).toBe('2026-08-01T01:02:03.000Z');
    expect(toIso('2026-08-01T00:00:00.5+00:00')).toBe('2026-08-01T00:00:00.500Z');
    expect(toIso(null)).toBeNull();
    expect(() => toIso('garbage')).toThrow(/invalid timestamp/);
  });
});

describe('importPostgresExport', () => {
  it('copies every table and the services read it back in the Postgres-era shape', async () => {
    const db = migratedDb();
    const counts = importPostgresExport(db.raw, pgExport());
    expect(counts).toEqual({ clients: 2, users: 2, identities: 2, memberships: 2, deletion_queue: 1, deletion_acks: 1, admin_audit_log: 1 });

    const clients = new ClientsService(db);
    expect(await clients.find('gbl')).toMatchObject({ allowed_origins: ['https://band.bini59.dev'], auto_provision: false, is_active: true, created_at: '2026-08-01T01:02:03.123Z' });
    expect(await clients.find('alpha')).toMatchObject({ is_active: false, auto_provision: true });

    const users = new UsersService(db);
    expect(await users.findById(U1)).toMatchObject({ email: 'kevin@example.test', email_verified: true, profile_completed_at: '2026-08-01T00:00:01.999Z' });
    expect(await users.findById(U2)).toMatchObject({ email: null, email_verified: false });
    // 이전된 사용자가 다시 로그인하면 기존 계정을 찾는다
    await expect(users.upsertFromProvider({ provider: 'google', providerUserId: 'g-1', email: 'kevin@example.test', emailVerified: true, name: 'New', avatarUrl: null })).resolves.toBe(U1);
    expect((await users.findById(U1))!.name).toBe('Kevin');

    const memberships = new MembershipsService(db);
    expect(await memberships.find(U2, 'gbl')).toEqual({ role: 'member', status: 'suspended', joinedAt: '2026-08-04T00:00:00.000Z' });
    expect(await memberships.isAdmin(U1)).toBe(true);

    // gbl 은 이미 ack 했으므로 다시 받지 않고, 다른 앱은 받는다
    expect(await users.listDeletions('gbl')).toEqual([]);
    expect(await users.listDeletions('alpha')).toEqual([{ userId: GONE, requestedAt: '2026-09-01T00:00:00.654Z' }]);

    const audit = await new AdminAuditService(db).recent(5);
    expect(audit).toEqual([{ id: '7', action: 'membership.update', userId: U1, clientId: 'gbl', details: { role: 'admin' }, createdAt: '2026-08-05T00:00:00.000Z' }]);
    await new AdminAuditService(db).record({ action: 'next' });
    expect((await new AdminAuditService(db).recent(1))[0].id).toBe('8');
  });

  it('refuses to import into a database that already has data', async () => {
    const db = migratedDb();
    importPostgresExport(db.raw, pgExport());
    expect(() => importPostgresExport(db.raw, pgExport())).toThrow(/not empty/);
  });

  it('rolls back everything when a row breaks a constraint', async () => {
    const db = migratedDb();
    const data = pgExport();
    data.memberships.push({ user_id: U1, client_id: 'missing-client', role: 'member', status: 'active', joined_at: '2026-08-01T00:00:00+00:00', last_seen_at: null });
    expect(() => importPostgresExport(db.raw, data)).toThrow();
    expect((await db.query('SELECT count(*) AS n FROM clients')).rows[0].n).toBe(0);
  });

  it('rejects an export that is missing a table', async () => {
    const db = migratedDb();
    const { admin_audit_log: _drop, ...partial } = pgExport();
    expect(() => importPostgresExport(db.raw, partial as PgExport)).toThrow(/missing table "admin_audit_log"/);
  });
});
