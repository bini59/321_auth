// 실행 중에도 안전한 SQLite 온라인 백업 (sqlite3 CLI 의 .backup 과 같은 동작).
// 사용법: docker compose exec auth-app node apps/api/dist/db/backup.js /var/lib/321-auth/data/backups/auth-YYYYMMDD.db
import { backup } from 'node:sqlite';
import { ENV } from '../config/env';
import { openDatabase } from './db';

async function main() {
  const target = process.argv[2];
  if (!target) throw new Error('usage: node backup.js <target.db>');
  const db = openDatabase(ENV.databasePath);
  const pages = await backup(db, target);
  db.close();
  console.log(`[backup] ${ENV.databasePath} -> ${target} (${pages} pages)`);
}

main().catch((err) => {
  console.error('[backup] failed:', err);
  process.exit(1);
});
