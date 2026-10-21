import { join } from 'node:path';
import { applyMigrations, openDatabase, SqliteDb } from '../src/db/db';

export const MIGRATIONS_DIR = join(__dirname, '../src/db/migrations');

// 실제 마이그레이션을 적용한 SQLite. path 를 주면 파일 DB (재시작 테스트용).
export function migratedDb(path = ':memory:'): SqliteDb {
  return new SqliteDb(() => {
    const raw = openDatabase(path);
    applyMigrations(raw, MIGRATIONS_DIR);
    return raw;
  });
}
