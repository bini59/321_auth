// export-postgres.sql 결과(JSON)를 SQLite 로 옮긴다. 사람이 운영 서버에서 실행한다 (docs/database.md 참고).
// 사용법: DATABASE_PATH=... node apps/api/dist/db/import-postgres.js <auth-export.json>
// 대상 테이블이 비어 있을 때만 동작하고, 전부 한 트랜잭션이라 실패하면 아무것도 남지 않는다.
import { readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { ENV } from '../config/env';
import { applyMigrations, openDatabase } from './db';

type PgRow = Record<string, unknown>;
export type PgExport = Record<(typeof TABLES)[number], PgRow[]>;

// FK 순서대로 넣는다.
const TABLES = ['clients', 'users', 'identities', 'memberships', 'deletion_queue', 'deletion_acks', 'admin_audit_log'] as const;

// Postgres json 의 timestamptz("2026-09-07T03:04:45.123456+00:00")를 Date#toISOString() 형식으로 맞춘다.
// 마이크로초는 버린다 (Postgres 가 /deletions 응답에서 이미 밀리초로 잘라 보냈다).
export function toIso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/(\.\d{3})\d+/, '$1');
  const date = new Date(text);
  if (isNaN(date.getTime())) throw new Error(`invalid timestamp: ${String(value)}`);
  return date.toISOString();
}

const bool = (value: unknown) => (value === true || value === 't' ? 1 : 0);
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));

const COLUMNS: Record<(typeof TABLES)[number], Record<string, (row: PgRow) => string | number | null>> = {
  clients: {
    client_id: (r) => str(r.client_id),
    name: (r) => str(r.name),
    logo_url: (r) => str(r.logo_url),
    theme_color: (r) => str(r.theme_color),
    allowed_origins: (r) => JSON.stringify(r.allowed_origins ?? []),
    default_redirect: (r) => str(r.default_redirect),
    auto_provision: (r) => bool(r.auto_provision),
    onboarding_path: (r) => str(r.onboarding_path),
    secret_hash: (r) => str(r.secret_hash),
    created_at: (r) => toIso(r.created_at),
    is_active: (r) => bool(r.is_active ?? true),
  },
  users: {
    id: (r) => str(r.id),
    email: (r) => str(r.email),
    email_verified: (r) => bool(r.email_verified),
    name: (r) => str(r.name),
    avatar_url: (r) => str(r.avatar_url),
    created_at: (r) => toIso(r.created_at),
    profile_completed_at: (r) => toIso(r.profile_completed_at),
    avatar_source: (r) => str(r.avatar_source ?? 'provider'),
    name_source: (r) => str(r.name_source ?? 'provider'),
  },
  identities: {
    provider: (r) => str(r.provider),
    provider_user_id: (r) => str(r.provider_user_id),
    user_id: (r) => str(r.user_id),
    email_at_link: (r) => str(r.email_at_link),
    linked_at: (r) => toIso(r.linked_at),
  },
  memberships: {
    user_id: (r) => str(r.user_id),
    client_id: (r) => str(r.client_id),
    role: (r) => str(r.role),
    status: (r) => str(r.status),
    joined_at: (r) => toIso(r.joined_at),
    last_seen_at: (r) => toIso(r.last_seen_at),
  },
  deletion_queue: {
    user_id: (r) => str(r.user_id),
    requested_at: (r) => toIso(r.requested_at),
  },
  deletion_acks: {
    user_id: (r) => str(r.user_id),
    client_id: (r) => str(r.client_id),
    acked_at: (r) => toIso(r.acked_at),
  },
  admin_audit_log: {
    id: (r) => Number(r.id),
    action: (r) => str(r.action),
    target_user_id: (r) => str(r.target_user_id),
    target_client_id: (r) => str(r.target_client_id),
    details: (r) => JSON.stringify(r.details ?? {}),
    created_at: (r) => toIso(r.created_at),
  },
};

export function importPostgresExport(db: DatabaseSync, data: PgExport): Record<string, number> {
  for (const table of TABLES) {
    if (!Array.isArray(data[table])) throw new Error(`export is missing table "${table}"`);
    const { n } = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
    if (n > 0) throw new Error(`target table "${table}" is not empty (${n} rows); refusing to import`);
  }

  const counts: Record<string, number> = {};
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const table of TABLES) {
      const columns = Object.keys(COLUMNS[table]);
      const insert = db.prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      );
      for (const row of data[table]) insert.run(...columns.map((column) => COLUMNS[table][column](row)));
      const { n } = db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number };
      if (n !== data[table].length) throw new Error(`${table}: expected ${data[table].length} rows, got ${n}`);
      counts[table] = n;
    }
    const violations = db.prepare('PRAGMA foreign_key_check').all();
    if (violations.length > 0) throw new Error(`foreign key check failed: ${JSON.stringify(violations)}`);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return counts;
}

if (require.main === module) {
  try {
    const file = process.argv[2];
    if (!file) throw new Error('usage: node import-postgres.js <auth-export.json>');
    const db = openDatabase(ENV.databasePath);
    applyMigrations(db);
    const counts = importPostgresExport(db, JSON.parse(readFileSync(file, 'utf8')) as PgExport);
    console.log(`[import] ${ENV.databasePath}`);
    for (const [table, n] of Object.entries(counts)) console.log(`[import] ${table}: ${n}`);
    db.close();
  } catch (err) {
    console.error('[import] failed:', err);
    process.exit(1);
  }
}
