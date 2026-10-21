import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { ENV } from '../config/env';

// Postgres now() 대신 쓰는 현재 시각. Date#toISOString() 과 같은 형식(UTC, 밀리초, Z)이라
// 텍스트로 저장해도 JSON 응답이 Postgres 시절과 같고, 문자열 비교가 시간 순서와 일치한다.
export const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;
// pg 의 QueryResult 처럼 행 타입 기본값은 any (기존 서비스 코드가 그대로 동작하도록).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface QueryResult<R = any> {
  rows: R[];
  rowCount: number;
}
export interface DbClient {
  query<R = any>(sql: string, params?: readonly unknown[]): Promise<QueryResult<R>>;
  release(): void;
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  return db;
}

// 바인딩 규칙: boolean → 0/1, Date → ISO 텍스트, 배열/객체(text[]·jsonb 자리) → JSON 텍스트.
function toParam(value: unknown): SQLInputValue {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Uint8Array) return value;
  if (typeof value === 'object') return JSON.stringify(value);
  return value as SQLInputValue;
}

/**
 * pg Pool 과 같은 모양(query / connect·release)의 SQLite 래퍼.
 * 서비스 SQL 의 $1, $2 자리표시자는 SQLite 의 ?1, ?2 로 바꿔 그대로 쓴다.
 *
 * 연결이 하나뿐이라 connect() 로 잡은 클라이언트(트랜잭션)가 release 될 때까지
 * 다른 query 는 기다린다. 그래서 Postgres 의 FOR UPDATE 없이도 트랜잭션끼리 섞이지 않는다.
 * 트랜잭션 안에서는 반드시 client.query 를 써야 한다 (db.query 를 쓰면 스스로를 기다린다).
 */
export class SqliteDb {
  private handle: DatabaseSync | null = null;
  private readonly statements = new Map<string, StatementSync>();
  private tail: Promise<void> = Promise.resolve();

  constructor(private readonly open: () => DatabaseSync) {}

  get raw(): DatabaseSync {
    this.handle ??= this.open();
    return this.handle;
  }

  async query<R = any>(sql: string, params: readonly unknown[] = []): Promise<QueryResult<R>> {
    const unlock = await this.lock();
    try {
      return this.run<R>(sql, params);
    } finally {
      unlock();
    }
  }

  async connect(): Promise<DbClient> {
    const unlock = await this.lock();
    let held = true;
    return {
      query: async <R = any>(sql: string, params: readonly unknown[] = []) => {
        if (!held) throw new Error('db client already released');
        return this.run<R>(sql, params);
      },
      release: () => {
        if (!held) return;
        held = false;
        try {
          // COMMIT/ROLLBACK 없이 놓인 트랜잭션은 되돌린다. 실패해도 잠금은 반드시 푼다.
          if (this.raw.isTransaction) this.raw.exec('ROLLBACK');
        } finally {
          unlock();
        }
      },
    };
  }

  close(): void {
    this.statements.clear();
    this.handle?.close();
    this.handle = null;
  }

  private lock(): Promise<() => void> {
    let unlock!: () => void;
    const held = new Promise<void>((resolve) => (unlock = resolve));
    const ready = this.tail;
    this.tail = ready.then(() => held);
    return ready.then(() => unlock);
  }

  private run<R>(sql: string, params: readonly unknown[]): QueryResult<R> {
    const stmt = this.prepare(sql);
    const args = params.map(toParam);
    if (stmt.columns().length > 0) {
      const rows = stmt.all(...args).map((row) => ({ ...row }) as R);
      return { rows, rowCount: rows.length };
    }
    const { changes } = stmt.run(...args);
    return { rows: [], rowCount: Number(changes) };
  }

  private prepare(sql: string): StatementSync {
    let stmt = this.statements.get(sql);
    if (!stmt) {
      stmt = this.raw.prepare(sql.replace(/\$(\d+)/g, '?$1'));
      this.statements.set(sql, stmt);
    }
    return stmt;
  }
}

export type DbPool = SqliteDb;

// 첫 쿼리 때 파일을 연다. import 만으로 DATABASE_PATH 에 파일을 만들지 않는다.
export const pool = new SqliteDb(() => openDatabase(ENV.databasePath));

// src/db/migrations/*.sql 을 이름 순서로 한 번씩 적용한다 (멱등).
export function applyMigrations(
  db: DatabaseSync,
  dir = join(__dirname, 'migrations'),
  log: (message: string) => void = () => {},
): void {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (${NOW})
  ) STRICT`);
  const applied = new Set(
    db.prepare('SELECT name FROM schema_migrations').all().map((row) => String(row.name)),
  );
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (applied.has(file)) {
      log(`skip ${file}`);
      continue;
    }
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(join(dir, file), 'utf8'));
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(file);
      db.exec('COMMIT');
      log(`applied ${file}`);
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }
}
