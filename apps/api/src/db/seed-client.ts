// 첫 앱 클라이언트 등록 (PRD §7.1, §13 #7)
// 사용법: DATABASE_PATH=... pnpm --filter @321-auth/api seed -- <clientId> <name> <secret> <origins(csv)> <defaultRedirect> [autoProvision]
import { createHash } from 'node:crypto';
import { ENV } from '../config/env';
import { openDatabase } from './db';

function main() {
  const [clientId, name, secret, originsCsv, defaultRedirect, autoProvision = 'true'] =
    process.argv.slice(2);
  if (!clientId || !name || !secret || !originsCsv || !defaultRedirect) {
    console.error(
      'usage: DATABASE_PATH=... pnpm --filter @321-auth/api seed -- <clientId> <name> <secret> <origins(csv)> <defaultRedirect> [autoProvision]',
    );
    process.exit(1);
  }

  const db = openDatabase(ENV.databasePath);
  const secretHash = createHash('sha256').update(secret).digest('hex');
  const origins = originsCsv.split(',').map((s) => s.trim()).filter(Boolean);

  db.prepare(
    `INSERT INTO clients (client_id, name, allowed_origins, default_redirect, auto_provision, secret_hash)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (client_id) DO UPDATE SET
       name = excluded.name,
       allowed_origins = excluded.allowed_origins,
       default_redirect = excluded.default_redirect,
       auto_provision = excluded.auto_provision,
       secret_hash = excluded.secret_hash`,
  ).run(clientId, name, JSON.stringify(origins), defaultRedirect, autoProvision === 'true' ? 1 : 0, secretHash);
  console.log(`seeded client '${clientId}' (${origins.length} origins)`);
  db.close();
}

try {
  main();
} catch (err) {
  console.error('[seed] failed:', err);
  process.exit(1);
}
