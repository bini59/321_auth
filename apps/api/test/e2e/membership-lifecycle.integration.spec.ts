import { test, expect } from '@playwright/test';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { join } from 'node:path';

// Use emitted Nest decorator metadata and real migrated SQLite, without external providers.
const { AuthController } = require('../../dist/auth/auth.controller.js');
const { ClientsService, hashAppSecret } = require('../../dist/clients/clients.service.js');
const { UsersService } = require('../../dist/users/users.service.js');
const { MembershipsService } = require('../../dist/memberships/memberships.service.js');
const { SessionService } = require('../../dist/sessions/session.service.js');
const { OidcService } = require('../../dist/oidc/oidc.service.js');
const { AdminSessionService } = require('../../dist/admin/admin-session.service.js');
const { AppSecretGuard } = require('../../dist/security/app-secret.guard.js');
const { CsrfGuard } = require('../../dist/security/csrf.guard.js');
const { SqliteDb, openDatabase, applyMigrations } = require('../../dist/db/db.js');
const { ENV } = require('../../dist/config/env.js');
const db = new SqliteDb(() => {
  const raw = openDatabase(':memory:');
  applyMigrations(raw, join(__dirname, '../../src/db/migrations'));
  return raw;
});
const memberships = new MembershipsService(db);
const users = new UsersService(db);
const clients = new ClientsService(db);
const sessions = new SessionService(db);
const userId = '00000000-0000-4000-8000-000000000076';
const oidc = {
  consumeState: async () => ({ provider: 'google', clientId: 'n2c', returnTo: 'https://calendar.test/' }),
  exchangeCode: async () => ({ id_token: 'test' }),
  verifyIdToken: async () => ({}),
  normalize: () => ({ provider: 'google', providerUserId: 'lifecycle-user', emailVerified: false }),
};
@Module({
  controllers: [AuthController],
  providers: [AppSecretGuard, CsrfGuard,
    { provide: ClientsService, useValue: clients }, { provide: UsersService, useValue: users },
    { provide: MembershipsService, useValue: memberships }, { provide: SessionService, useValue: sessions },
    { provide: OidcService, useValue: oidc }, { provide: AdminSessionService, useValue: {} }],
})
class LifecycleModule {}
let app: Awaited<ReturnType<typeof NestFactory.create>>;
let origin: string;
let sid: string;
test.beforeAll(async () => {
  await clients.create({ client_id: 'n2c', name: 'Calendar', allowed_origins: ['https://calendar.test'],
    default_redirect: 'https://calendar.test/', auto_provision: true, secret_hash: hashAppSecret('calendar-secret') });
  await clients.create({ client_id: 'other', name: 'Other', allowed_origins: ['https://other.test'],
    default_redirect: 'https://other.test/', auto_provision: true, secret_hash: hashAppSecret('other-secret') });
  await db.query('INSERT INTO users (id, profile_completed_at) VALUES ($1, $2)', [userId, '2026-10-26T00:00:00.000Z']);
  await db.query("INSERT INTO identities (provider, provider_user_id, user_id) VALUES ('google', 'lifecycle-user', $1)", [userId]);
  sid = await sessions.create(userId, {});
  await memberships.ensure(userId, 'n2c');
  await memberships.ensure(userId, 'other');
  app = await NestFactory.create(LifecycleModule, { logger: false });
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  origin = await app.getUrl();
  ENV.authOrigin = origin;
});
test.afterAll(async () => { await app?.close(); db.close(); });

test('HTTP lifecycle authenticates the subject, preserves withdrawal, and fences cleanup and rejoin', async ({ request }) => {
  const headers = { 'x-app-secret': 'calendar-secret', cookie: `sid=${sid}; csrf=proof`, 'x-csrf-token': 'proof', origin };
  const post = (path: string, data: object, override = {}) => request.post(`${origin}/memberships/${path}?client_id=n2c`, { headers: { ...headers, ...override }, data });
  expect((await post('withdraw', { version: 0 }, { cookie: 'csrf=proof' })).status()).toBe(401);
  expect((await post('withdraw', { version: 0 }, { 'x-app-secret': 'other-secret' })).status()).toBe(401);
  expect((await post('withdraw', { version: 0 }, { 'x-csrf-token': 'wrong' })).status()).toBe(403);
  expect((await post('withdraw', { version: 0 }, { origin: 'https://evil.test' })).status()).toBe(403);
  expect((await post('withdraw', { version: 0, userId: 'someone-else' })).status()).toBe(403);
  expect((await post('withdraw', { version: 0, serviceId: 'other' })).status()).toBe(403);
  expect((await post('withdraw', { version: -1 })).status()).toBe(400);
  const withdrawal = await post('withdraw', { version: 0 });
  expect(withdrawal.status()).toBe(201);
  const receipt = await withdrawal.json();
  expect(receipt).toMatchObject({ userId, clientId: 'n2c', state: 'withdrawn', version: 1, cleanupPending: true });
  expect(await (await post('withdraw', { version: 0 })).json()).toEqual(receipt);
  expect((await request.get(`${origin}/verify?client_id=n2c`, { headers })).status()).toBe(403);
  expect((await request.get(`${origin}/verify?client_id=other`, { headers: { ...headers, 'x-app-secret': 'other-secret' } })).status()).toBe(200);
  expect((await request.post(`${origin}/memberships?client_id=n2c`, { headers, data: { clientId: 'n2c', userId } })).status()).toBe(201);
  // Real callback/ensure path also cannot erase withdrawal.
  expect((await request.get(`${origin}/callback/google?state=test&code=test`, {
    headers: { cookie: `sid=${sid}; oauth_state=test` }, maxRedirects: 0,
  })).status()).toBe(302);
  expect((await request.get(`${origin}/verify?client_id=n2c`, { headers })).status()).toBe(403);
  const identity = await request.get(`${origin}/memberships/identity?client_id=n2c`, { headers });
  expect(await identity.json()).toMatchObject({ ...receipt, purpose: 'membership-lifecycle' });
  expect((await post('rejoin', { version: 1, consent: true })).status()).toBe(409);
  expect((await post('cleanup/ack', { version: 1, cleanupId: 'wrong' })).status()).toBe(409);
  expect((await post('cleanup/ack', { version: 1, cleanupId: receipt.cleanupId })).status()).toBe(201);
  expect((await request.get(`${origin}/verify?client_id=n2c`, { headers })).status()).toBe(403);
  expect((await post('rejoin', { version: 1 })).status()).toBe(400);
  expect(await (await post('rejoin', { version: 1, consent: true })).json()).toMatchObject({ state: 'active', version: 2 });
  expect((await post('withdraw', { version: 0 })).status()).toBe(409);
  expect((await post('cleanup/ack', { version: 1, cleanupId: receipt.cleanupId })).status()).toBe(409);
  expect((await request.get(`${origin}/verify?client_id=n2c`, { headers })).status()).toBe(200);
});
