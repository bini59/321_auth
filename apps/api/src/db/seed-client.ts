// 첫 앱 클라이언트 등록 (PRD §7.1, §13 #7)
// 사용법: DATABASE_URL=... pnpm --filter @321-auth/api seed -- <clientId> <name> <secret> <origins(csv)> <defaultRedirect> [autoProvision]
import { createHash } from 'node:crypto';
import { Client } from 'pg';

async function main() {
  const [clientId, name, secret, originsCsv, defaultRedirect, autoProvision = 'true'] =
    process.argv.slice(2);
  if (!clientId || !name || !secret || !originsCsv || !defaultRedirect) {
    console.error(
      'usage: DATABASE_URL=... pnpm --filter @321-auth/api seed -- <clientId> <name> <secret> <origins(csv)> <defaultRedirect> [autoProvision]',
    );
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');

  const client = new Client({ connectionString: url });
  await client.connect();
  const secretHash = createHash('sha256').update(secret).digest('hex');
  const origins = originsCsv.split(',').map((s) => s.trim()).filter(Boolean);

  await client.query(
    `INSERT INTO clients (client_id, name, allowed_origins, default_redirect, auto_provision, secret_hash)
     VALUES ($1,$2,$3::text[],$4,$5,$6)
     ON CONFLICT (client_id) DO UPDATE SET
       name = EXCLUDED.name,
       allowed_origins = EXCLUDED.allowed_origins,
       default_redirect = EXCLUDED.default_redirect,
       auto_provision = EXCLUDED.auto_provision,
       secret_hash = EXCLUDED.secret_hash`,
    [clientId, name, origins, defaultRedirect, autoProvision === 'true', secretHash],
  );
  console.log(`seeded client '${clientId}' (${origins.length} origins)`);
  await client.end();
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
