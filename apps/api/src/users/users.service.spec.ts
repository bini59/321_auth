import { describe, expect, it, vi } from 'vitest';
import { UsersService } from './users.service';
import type { NormalizedIdentity } from '../oidc/oidc.service';

function fakeDb(rows: Record<string, unknown>[] = []) {
  const client = {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
    release: vi.fn(),
  };
  return { db: { query: client.query, connect: async () => client }, client };
}

const identity: NormalizedIdentity = {
  provider: 'google',
  providerUserId: 'google-1',
  email: 'a@example.test',
  emailVerified: true,
  name: '프로바이더 이름',
  avatarUrl: 'https://cdn.example.test/p.png',
};

function nameUpdateSql(client: { query: ReturnType<typeof vi.fn> }) {
  const call = client.query.mock.calls.find(
    ([sql]) => typeof sql === 'string' && sql.includes('UPDATE users SET'),
  );
  return call?.[0] as string | undefined;
}

describe('UsersService.updateProfile', () => {
  it('promotes name_source to custom when the user saves a name', async () => {
    const { db, client } = fakeDb([{ id: 'u1', name: '내 이름' }]);

    await new UsersService(db as never).updateProfile('u1', '내 이름');

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain("name_source = CASE WHEN $2 IS NULL THEN name_source ELSE 'custom' END");
    expect(params).toEqual(['u1', '내 이름', null]);
  });

  it('leaves name and name_source alone when only an avatar is saved', async () => {
    const { db, client } = fakeDb([{ id: 'u1', avatar_url: '/a.png' }]);

    await new UsersService(db as never).updateProfile('u1', undefined, '/a.png');

    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('name = COALESCE($2, name)');
    expect(params).toEqual(['u1', null, '/a.png']);
  });
});

describe('UsersService.upsertFromProvider', () => {
  it('does not overwrite a custom name on repeat provider login', async () => {
    const { db, client } = fakeDb([{ user_id: 'u1' }]);

    await new UsersService(db as never).upsertFromProvider(identity);

    expect(nameUpdateSql(client)).toContain(
      "name = CASE WHEN name_source = 'provider' THEN COALESCE($2, name) ELSE name END",
    );
  });

  it('creates new users with provider-owned name and avatar', async () => {
    const { db, client } = fakeDb([]);
    client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INSERT INTO users')) return { rows: [{ id: 'u-new' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    await expect(new UsersService(db as never).upsertFromProvider(identity)).resolves.toBe('u-new');

    const insert = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO users'));
    expect(insert?.[0]).toContain("VALUES ($1, $2, $3, $4, 'provider', 'provider')");
  });
});

describe('UsersService.linkIdentity', () => {
  it('does not overwrite a custom name when linking a provider', async () => {
    const { db, client } = fakeDb([]);

    await new UsersService(db as never).linkIdentity('u1', identity);

    expect(nameUpdateSql(client)).toContain(
      "name = CASE WHEN name_source = 'provider' THEN COALESCE($2, name) ELSE name END",
    );
  });
});
