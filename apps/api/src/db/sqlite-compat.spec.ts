// Postgres 시절 SQL 에서 grep 으로 찾은 전용 문법마다, SQLite 로 옮긴 뒤에도 같은 동작인지
// 실제 서비스 코드를 인메모리 SQLite 에 붙여 확인한다.
//   ::int / ::text / ::timestamptz 캐스트, ILIKE, text[], jsonb, RETURNING, ON CONFLICT,
//   FOR UPDATE, now(), gen_random_uuid(), NULLS LAST, 부분 유니크 인덱스(lower(email)),
//   BOOLEAN, CHECK, BIGSERIAL, ON DELETE CASCADE / SET NULL
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { migratedDb } from '../../test/sqlite';
import { ClientsService } from '../clients/clients.service';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../memberships/memberships.service';
import { AdminManagementService } from '../admin/admin-management.service';
import { AdminAuditService } from '../admin/admin-audit.service';
import { AdminSessionService } from '../admin/admin-session.service';
import { AdminDashboardService } from '../admin/admin-dashboard.service';
import { SessionService } from '../sessions/session.service';
import { OidcService, type NormalizedIdentity } from '../oidc/oidc.service';
import type { SqliteDb } from './db';

const ISO_MS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

let db: SqliteDb;
let clients: ClientsService;
let users: UsersService;
let memberships: MembershipsService;
let sessions: SessionService;
let management: AdminManagementService;

const identity = (sub: string, extra: Partial<NormalizedIdentity> = {}): NormalizedIdentity => ({
  provider: 'google',
  providerUserId: sub,
  email: `${sub}@example.test`,
  emailVerified: true,
  name: sub,
  avatarUrl: null,
  ...extra,
});

async function seedClient(clientId: string, extra: Partial<Parameters<ClientsService['create']>[0]> = {}) {
  await clients.create({
    client_id: clientId,
    name: clientId.toUpperCase(),
    allowed_origins: [`https://${clientId}.bini59.dev`, 'http://localhost:3000'],
    default_redirect: `https://${clientId}.bini59.dev/`,
    auto_provision: true,
    secret_hash: 'a'.repeat(64),
    ...extra,
  });
}

beforeEach(() => {
  db = migratedDb();
  clients = new ClientsService(db);
  users = new UsersService(db);
  memberships = new MembershipsService(db);
  sessions = new SessionService(db);
  management = new AdminManagementService(db, sessions);
});

describe('clients: text[] → JSON text, BOOLEAN → 0/1, RETURNING, ON CONFLICT DO NOTHING', () => {
  it('round-trips allowed_origins as an array and flags as booleans', async () => {
    await seedClient('gbl', { auto_provision: false });
    const row = await clients.find('gbl');
    expect(row).toMatchObject({
      client_id: 'gbl',
      allowed_origins: ['https://gbl.bini59.dev', 'http://localhost:3000'],
      auto_provision: false,
      is_active: true,
    });
    expect((row as unknown as { created_at: string }).created_at).toMatch(ISO_MS);
  });

  it('ignores a duplicate create like ON CONFLICT DO NOTHING', async () => {
    await seedClient('n2c');
    const second = await clients.create({ client_id: 'n2c', name: 'other', allowed_origins: [], default_redirect: '/', auto_provision: false, secret_hash: 'b' });
    expect(second.rowCount).toBe(0);
    expect((await clients.find('n2c'))!.name).toBe('N2C');
  });

  it('returns the updated row from UPDATE ... RETURNING and null when nothing matched', async () => {
    await seedClient('archive');
    const updated = await clients.update('archive', { name: 'Archive', allowed_origins: ['https://a.example'], default_redirect: '/x', auto_provision: false, onboarding_path: '/onboard' });
    expect(updated).toMatchObject({ client_id: 'archive', allowed_origins: ['https://a.example'], auto_provision: false, is_active: true, onboarding_path: '/onboard' });
    expect(await clients.setActive('archive', false)).toEqual({ client_id: 'archive', is_active: false });
    expect(await clients.rotateSecret('archive', 'c'.repeat(64))).toEqual({ client_id: 'archive' });
    expect(await clients.rotateSecret('missing', 'c')).toBeNull();
    expect(await clients.update('missing', { name: 'x', allowed_origins: [], default_redirect: '/', auto_provision: true, onboarding_path: null })).toBeNull();
  });

  it('counts memberships per client as integers (COUNT(...)::int)', async () => {
    await seedClient('invest');
    await seedClient('seoko-maps');
    const a = await users.upsertFromProvider(identity('a'));
    const b = await users.upsertFromProvider(identity('b'));
    await memberships.ensure(a, 'invest');
    await memberships.ensure(b, 'invest');
    const list = await clients.list();
    expect(list.map((c) => [c.client_id, c.membership_count])).toEqual([['invest', 2], ['seoko-maps', 0]]);
    expect(list[0]).not.toHaveProperty('secret_hash');
    expect(list[0].allowed_origins).toEqual(['https://invest.bini59.dev', 'http://localhost:3000']);
  });

  it('rejects a non-array allowed_origins value (schema CHECK)', async () => {
    await expect(db.query("INSERT INTO clients (client_id, name, allowed_origins, default_redirect, secret_hash) VALUES ('x', 'x', 'nope', '/', 'h')")).rejects.toThrow();
  });
});

describe('users: gen_random_uuid(), now(), RETURNING, lower(email) partial unique index, FOR UPDATE', () => {
  it('generates UUID v4 ids the profile storage accepts', async () => {
    const id = await users.upsertFromProvider(identity('uuid'));
    expect(id).toMatch(UUID_V4);
    const user = await users.findById(id);
    expect(user).toMatchObject({ id, email: 'uuid@example.test', email_verified: true });
    expect(user!.created_at).toMatch(ISO_MS);
  });

  it('treats emails case-insensitively and allows many NULL emails', async () => {
    const first = await users.upsertFromProvider(identity('one', { email: 'Same@Example.test' }));
    const second = await users.upsertFromProvider(identity('two', { email: 'same@example.TEST' }));
    expect(await users.findById(first)).toMatchObject({ email: 'Same@Example.test', email_verified: true });
    expect(await users.findById(second)).toMatchObject({ email: null, email_verified: false });
    await expect(db.query("INSERT INTO users (email) VALUES ('SAME@EXAMPLE.TEST')")).rejects.toThrow(/UNIQUE/);
    await db.query('INSERT INTO users (email) VALUES (NULL)');
    await db.query('INSERT INTO users (email) VALUES (NULL)');
  });

  it('keeps provider updates and custom names apart (CASE WHEN with boolean params)', async () => {
    const id = await users.upsertFromProvider(identity('p', { emailVerified: false, email: 'p@example.test' }));
    expect(await users.findById(id)).toMatchObject({ email: null, email_verified: false });
    const saved = await users.updateProfile(id, '내 이름');
    expect(saved).toMatchObject({ id, name: '내 이름', email_verified: false });
    expect(saved!.profile_completed_at).toMatch(ISO_MS);
    await users.upsertFromProvider(identity('p', { name: 'provider name', emailVerified: true, email: 'p@example.test' }));
    expect(await users.findById(id)).toMatchObject({ name: '내 이름', email: 'p@example.test', email_verified: true });
    expect(await users.updateProfile('00000000-0000-4000-8000-000000000000', 'x')).toBeNull();
  });

  it('serializes concurrent first logins into one user (replaces SELECT ... FOR UPDATE)', async () => {
    const ids = await Promise.all([1, 2, 3, 4].map(() => users.upsertFromProvider(identity('race'))));
    expect(new Set(ids).size).toBe(1);
    expect((await db.query('SELECT count(*) AS n FROM users')).rows[0].n).toBe(1);
  });

  it('rolls back a failed link transaction and frees the connection', async () => {
    const owner = await users.upsertFromProvider(identity('owner'));
    const other = await users.upsertFromProvider(identity('other'));
    await expect(users.linkIdentity(other, identity('owner'))).rejects.toThrow(/병합 금지/);
    await users.linkIdentity(owner, identity('owner', { provider: 'kakao', providerUserId: 'k-1' }));
    expect((await users.identities(owner)).map((i) => i.provider)).toEqual(['google', 'kakao']);
  });

  it('rolls back a transaction released without COMMIT and keeps serving queries', async () => {
    const client = await db.connect();
    await client.query('BEGIN');
    await client.query("INSERT INTO deletion_queue (user_id) VALUES ('left-open')");
    const waiting = db.query('SELECT count(*) AS n FROM deletion_queue');
    client.release();
    expect((await waiting).rows[0].n).toBe(0);
    await expect(client.query('SELECT 1')).rejects.toThrow(/released/);
  });

  it('enforces the avatar_source / name_source CHECK constraints', async () => {
    const id = await users.upsertFromProvider(identity('chk'));
    await expect(db.query("UPDATE users SET avatar_source = 'other' WHERE id = $1", [id])).rejects.toThrow(/CHECK/);
    await expect(db.query("UPDATE users SET name_source = 'other' WHERE id = $1", [id])).rejects.toThrow(/CHECK/);
  });
});

describe('deletions: ON CONFLICT DO UPDATE, ON DELETE CASCADE, ::timestamptz comparison, per-client ack', () => {
  it('queues deletion, cascades user data, and filters by since and ack', async () => {
    await seedClient('n2c');
    await seedClient('archive');
    const id = await users.upsertFromProvider(identity('bye'));
    await memberships.ensure(id, 'n2c');
    await users.requestDeletion(id);

    expect(await users.findById(id)).toBeNull();
    expect((await db.query('SELECT count(*) AS n FROM identities')).rows[0].n).toBe(0);
    expect((await db.query('SELECT count(*) AS n FROM memberships')).rows[0].n).toBe(0);

    const [entry] = await users.listDeletions('n2c');
    expect(entry).toEqual({ userId: id, requestedAt: expect.stringMatching(ISO_MS) });
    // JSON 계약: Postgres 가 Date 로 돌려주던 값과 같은 문자열
    expect(new Date(entry.requestedAt).toISOString()).toBe(entry.requestedAt);

    const before = new Date(Date.parse(entry.requestedAt) - 1000);
    expect(await users.listDeletions('n2c', before.toISOString())).toHaveLength(1);
    expect(await users.listDeletions('n2c', before.toUTCString())).toHaveLength(1);
    expect(await users.listDeletions('n2c', '2026-10-21T09:00:00+09:00'.replace('2026', '1999'))).toHaveLength(1);
    expect(await users.listDeletions('n2c', entry.requestedAt)).toEqual([]);
    expect(await users.listDeletions('n2c', 'not-a-date')).toHaveLength(1);

    await users.ackDeletion(id, 'n2c');
    await users.ackDeletion(id, 'n2c');
    await users.ackDeletion('00000000-0000-4000-8000-000000000000', 'n2c');
    expect(await users.listDeletions('n2c')).toEqual([]);
    expect(await users.listDeletions('archive')).toHaveLength(1);
  });

  it('re-requesting a deletion refreshes requested_at (ON CONFLICT DO UPDATE)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await db.query("INSERT INTO deletion_queue (user_id, requested_at) VALUES ('u', '2026-01-01T00:00:00.000Z')");
      await users.requestDeletion('u');
      const row = (await db.query("SELECT requested_at FROM deletion_queue WHERE user_id = 'u'")).rows[0];
      expect(row.requested_at > '2026-01-01T00:00:00.000Z').toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('memberships: ON CONFLICT DO NOTHING, NULLS LAST, boolean WHERE, now()', () => {
  it('orders recently seen apps first, never-seen last, and hides inactive clients', async () => {
    await seedClient('a-app');
    await seedClient('b-app');
    await seedClient('c-app');
    await seedClient('hidden');
    const id = await users.upsertFromProvider(identity('m'));
    for (const c of ['a-app', 'b-app', 'c-app', 'hidden']) {
      await memberships.ensure(id, c);
      await memberships.ensure(id, c);
    }
    await db.query("UPDATE memberships SET last_seen_at = '2026-01-01T00:00:00.000Z' WHERE client_id = 'b-app'");
    await memberships.touch(id, 'c-app');
    await clients.setActive('hidden', false);

    const list = await memberships.listForUser(id);
    expect(list.map((m) => m.clientId)).toEqual(['c-app', 'b-app', 'a-app']);
    expect(list[0].lastSeenAt).toMatch(ISO_MS);
    expect(list[2].lastSeenAt).toBeNull();
    expect(await memberships.find(id, 'a-app')).toMatchObject({ role: 'member', status: 'active', joinedAt: expect.stringMatching(ISO_MS) });
  });

  it('rejects memberships for unknown users or clients (foreign keys are on)', async () => {
    await seedClient('gbl');
    await expect(memberships.ensure('00000000-0000-4000-8000-000000000000', 'gbl')).rejects.toThrow(/FOREIGN KEY/);
  });

  it('finds admins only through active admin memberships', async () => {
    await seedClient('gbl');
    const id = await users.upsertFromProvider(identity('adm'));
    await memberships.ensure(id, 'gbl');
    expect(await memberships.isAdmin(id)).toBe(false);
    await management.updateMembership(id, 'gbl', { role: 'admin' });
    expect(await memberships.isAdmin(id)).toBe(true);
    await management.updateMembership(id, 'gbl', { status: 'suspended' });
    expect(await memberships.isAdmin(id)).toBe(false);
  });
});

describe('admin: ILIKE, id::text, COUNT(DISTINCT)::int, RETURNING', () => {
  it('searches email and name case-insensitively and by exact id', async () => {
    await seedClient('gbl');
    const kim = await users.upsertFromProvider(identity('kim', { email: 'Kim.Dev@Example.test', name: 'Kevin Kim' }));
    await users.linkIdentity(kim, identity('kim-kakao', { provider: 'kakao', emailVerified: false, name: null }));
    await memberships.ensure(kim, 'gbl');
    const lee = await users.upsertFromProvider(identity('lee', { email: 'lee@example.test', name: '이영희' }));

    expect((await management.listUsers('KIM.DEV', 50, 0)).map((u) => u.userId)).toEqual([kim]);
    expect((await management.listUsers('kevin', 50, 0)).map((u) => u.userId)).toEqual([kim]);
    expect((await management.listUsers('영희', 50, 0)).map((u) => u.userId)).toEqual([lee]);
    expect((await management.listUsers(lee, 50, 0)).map((u) => u.userId)).toEqual([lee]);
    expect(await management.listUsers('nobody', 50, 0)).toEqual([]);

    const [summary] = await management.listUsers('kim', 50, 0);
    expect(summary).toMatchObject({ emailVerified: true, providerCount: 2, membershipCount: 1, createdAt: expect.stringMatching(ISO_MS) });
    expect((await management.listUsers(undefined, 1, 1))).toHaveLength(1);
  });

  it('returns membership updates via RETURNING and 404s on misses', async () => {
    await seedClient('gbl');
    const id = await users.upsertFromProvider(identity('r'));
    await memberships.ensure(id, 'gbl');
    await expect(management.updateMembership(id, 'gbl', { status: 'suspended' })).resolves.toMatchObject({ clientId: 'gbl', role: 'member', status: 'suspended', lastSeenAt: null });
    await expect(management.updateMembership(id, 'nope', { status: 'active' })).rejects.toThrow(/not found/);
    const detail = await management.getUser(id);
    expect(detail.memberships).toEqual([expect.objectContaining({ clientId: 'gbl', clientName: 'GBL', status: 'suspended' })]);
    expect(detail.identities).toEqual([expect.objectContaining({ provider: 'google', linkedAt: expect.stringMatching(ISO_MS) })]);
  });

  it('stores audit details as JSON and keeps BIGSERIAL ids as strings; SET NULL on user delete', async () => {
    await seedClient('gbl');
    const id = await users.upsertFromProvider(identity('aud'));
    const audit = new AdminAuditService(db);
    await audit.record({ action: 'membership.update', userId: id, clientId: 'gbl', details: { role: 'admin', nested: { ok: true } } });
    await audit.record({ action: 'client.rotate' });
    await users.requestDeletion(id);
    const recent = await audit.recent(10);
    // 같은 밀리초에 쓰인 행은 id 로 순서를 고정한다
    expect(recent.map((r) => r.id)).toEqual(['2', '1']);
    expect(recent.find((r) => r.action === 'membership.update')).toMatchObject({ userId: null, clientId: 'gbl', details: { role: 'admin', nested: { ok: true } } });
    expect(recent.find((r) => r.action === 'client.rotate')!.details).toEqual({});
  });

  it('counts dashboard numbers and active sessions from SQLite', async () => {
    await seedClient('gbl');
    const id = await users.upsertFromProvider(identity('d'));
    await memberships.ensure(id, 'gbl');
    await sessions.create(id, { ua: '', ip: '' });
    const overview = await new AdminDashboardService(db, sessions).overview();
    expect(overview).toEqual({
      counts: { users: 1, activeSessions: 1, clients: 1, memberships: 1, suspendedMemberships: 0, deletionRequests: 0 },
      services: { api: 'up', database: 'up' },
    });
  });
});

describe('Redis replacements: OAuth state and admin sessions', () => {
  it('consumes OAuth state once (GETDEL) and rejects expired state', async () => {
    const oidc = new OidcService(db);
    const url = new URL(await oidc.buildAuthUrl('google', 'gbl', 'https://gbl.bini59.dev/'));
    const state = url.searchParams.get('state')!;
    await expect(oidc.consumeState(state)).resolves.toMatchObject({ provider: 'google', clientId: 'gbl', returnTo: 'https://gbl.bini59.dev/' });
    await expect(oidc.consumeState(state)).resolves.toBeNull();

    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const expired = new URL(await oidc.buildAuthUrl('kakao', null, '/')).searchParams.get('state')!;
      vi.setSystemTime(Date.now() + 600_001);
      await expect(oidc.consumeState(expired)).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('expires admin sessions at a fixed time and revokes them', async () => {
    const admin = new AdminSessionService(db);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const sid = await admin.create({ ua: 'ua', ip: 'ip', userId: 'u-admin' });
      await expect(admin.exists(sid)).resolves.toBe(true);
      await expect(admin.userId(sid)).resolves.toBe('u-admin');
      const other = await admin.create({ ua: '', ip: '', userId: 'u2' });
      await admin.revoke(other);
      await expect(admin.exists(other)).resolves.toBe(false);
      vi.setSystemTime(Date.now() + 28_800_001);
      await expect(admin.exists(sid)).resolves.toBe(false);
      await expect(admin.userId('missing')).resolves.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
