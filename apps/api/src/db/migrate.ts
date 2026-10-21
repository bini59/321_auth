// 마이그레이션 러너 — src/db/migrations/*.sql 을 순서대로 적용한다 (멱등).
import { ENV } from '../config/env';
import { applyMigrations, openDatabase } from './db';

try {
  const db = openDatabase(ENV.databasePath);
  applyMigrations(db, undefined, (message) => console.log(`[migrate] ${message}`));
  db.close();
} catch (err) {
  console.error('[migrate] failed:', err);
  process.exit(1);
}
