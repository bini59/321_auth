import { createServer, type Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { NestFactory } from '@nestjs/core';
import { Module } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { test, expect, type Page } from '@playwright/test';
// Playwright's esbuild path cannot transpile Nest legacy decorators. The API build
// is loaded here so the E2E test exercises the same emitted controller metadata.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AuthController } = require('../../dist/auth/auth.controller.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppSecretGuard } = require('../../dist/security/app-secret.guard.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CsrfGuard } = require('../../dist/security/csrf.guard.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ClientsService } = require('../../dist/clients/clients.service.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { OidcService } = require('../../dist/oidc/oidc.service.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SessionService } = require('../../dist/sessions/session.service.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { UsersService } = require('../../dist/users/users.service.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MembershipsService } = require('../../dist/memberships/memberships.service.js');

const USER_ID = '00000000-0000-0000-0000-000000000033';
const APP_SECRET = 'e2e-alpha-secret';
const CLIENTS = {
  alpha: { client_id: 'alpha', name: 'Alpha', logo_url: null, theme_color: null, allowed_origins: [] as string[], default_redirect: '', auto_provision: true, onboarding_path: null, secret_hash: '' },
  beta: { client_id: 'beta', name: 'Beta', logo_url: null, theme_color: null, allowed_origins: [] as string[], default_redirect: '', auto_provision: false, onboarding_path: '/onboarding', secret_hash: '' },
};

class FakeClients {
  async find(id: string) { return CLIENTS[id as keyof typeof CLIENTS] ?? null; }
  async verifySecret(id: string, secret: string) { return id === 'alpha' && secret === APP_SECRET ? CLIENTS.alpha : null; }
}

class FakeSessions {
  private readonly sessions = new Map<string, { userId: string }>();
  async create(userId: string) { const sid = `sid-${this.sessions.size + 1}`; this.sessions.set(sid, { userId }); return sid; }
  async get(sid: string) { return this.sessions.get(sid) ?? null; }
  async touch() {}
  async revoke(sid: string) { this.sessions.delete(sid); }
  async revokeAll(userId: string) { for (const [sid, session] of this.sessions) if (session.userId === userId) this.sessions.delete(sid); }
}

class FakeUsers {
  deleted = false;
  async findById(id: string) { return id === USER_ID && !this.deleted ? { id, email: 'e2e@example.test', name: 'E2E User', avatar_url: null } : null; }
  async upsertFromProvider() { return USER_ID; }
  async requestDeletion() { this.deleted = true; }
}

class FakeMemberships {
  private readonly memberships = new Map<string, { role: string; status: string; joinedAt: string }>();
  async find(userId: string, clientId: string) { return this.memberships.get(`${userId}:${clientId}`) ?? null; }
  async ensure(userId: string, clientId: string) { this.memberships.set(`${userId}:${clientId}`, { role: 'member', status: 'active', joinedAt: '2026-08-07T00:00:00.000Z' }); }
  async touch() {}
  suspend(clientId: string) { this.memberships.set(`${USER_ID}:${clientId}`, { role: 'member', status: 'suspended', joinedAt: '2026-08-07T00:00:00.000Z' }); }
}

class FakeOidc {
  private readonly states = new Map<string, { provider: string; clientId: string; returnTo: string; mode?: string; expiresAt: number }>();
  constructor(private readonly providerOrigin: string) {}
  validateReturnTo(returnTo: string | undefined, client: { allowed_origins: string[]; default_redirect: string }) { return returnTo ?? (client.default_redirect || `${this.providerOrigin}/logged-in`); }
  async buildAuthUrl(provider: string, clientId: string, returnTo: string) {
    const state = `${provider}-${this.states.size + 1}`;
    this.states.set(state, { provider, clientId, returnTo, expiresAt: Date.now() + 600_000 });
    return `${this.providerOrigin}/authorize?provider=${provider}&state=${state}`;
  }
  async consumeState(state: string) { const value = this.states.get(state); this.states.delete(state); return value && value.expiresAt > Date.now() ? value : null; }
  expire(state: string) { const value = this.states.get(state); if (value) value.expiresAt = 0; }
  async exchangeCode() { return { id_token: 'mock-id-token' }; }
  async verifyIdToken() { return { sub: 'mock-provider-user', nonce: 'mock' }; }
  normalize(provider: 'google' | 'kakao') { return { provider, providerUserId: 'mock-provider-user', email: 'e2e@example.test', emailVerified: true, name: 'E2E User', avatarUrl: null }; }
}

class MockProvider {
  origin = '';
  server: Server | undefined;
  async start() {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname !== '/authorize') return res.writeHead(404).end();
      const callback = `http://127.0.0.1:${process.env.E2E_AUTH_PORT}/callback/${url.searchParams.get('provider')}?code=mock-code&state=${url.searchParams.get('state')}`;
      res.writeHead(302, { location: callback }).end();
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const port = (this.server.address() as AddressInfo).port;
    this.origin = `http://127.0.0.1:${port}`;
  }
  async stop() { await new Promise<void>((resolve, reject) => this.server?.close((error) => error ? reject(error) : resolve())); }
}

@Module({
  controllers: [AuthController],
  providers: [
    { provide: ClientsService, useClass: FakeClients },
    { provide: OidcService, useFactory: (server: MockProvider) => new FakeOidc(server.origin), inject: [MockProvider] },
    { provide: SessionService, useClass: FakeSessions },
    { provide: UsersService, useClass: FakeUsers },
    { provide: MembershipsService, useClass: FakeMemberships },
    { provide: AppSecretGuard, useFactory: (clients: FakeClients) => new AppSecretGuard(clients as never), inject: [ClientsService] },
    CsrfGuard,
    { provide: MockProvider, useFactory: () => provider },
  ],
})
class E2eModule {}

let app: Awaited<ReturnType<typeof NestFactory.create>>;
let origin = '';
let provider: MockProvider;

test.beforeAll(async () => {
  provider = new MockProvider();
  await provider.start();
  app = await NestFactory.create(E2eModule, { logger: false });
  app.use(cookieParser());
  await app.listen(0, '127.0.0.1');
  const port = (app.getHttpServer().address() as AddressInfo).port;
  process.env.E2E_AUTH_PORT = String(port);
  origin = `http://127.0.0.1:${port}`;
  CLIENTS.alpha.allowed_origins = [origin];
  CLIENTS.alpha.default_redirect = `${origin}/logged-in`;
  CLIENTS.beta.allowed_origins = [origin];
  CLIENTS.beta.default_redirect = `${origin}/onboarding`;
});

test.afterAll(async () => { await app.close(); await provider.stop(); });

async function login(page: Page, providerName: 'google' | 'kakao', clientId = 'alpha') {
  await page.goto(`${origin}/login?client_id=${clientId}&return_to=${encodeURIComponent(CLIENTS[clientId as 'alpha' | 'beta'].default_redirect)}`);
  await page.locator(`a[href*="/login/${providerName}"]`).click();
  await expect(page).toHaveURL(/logged-in|onboarding/);
}

test('Google browser round trip creates a session and verifies the active membership', async ({ page }) => {
  await login(page, 'google');
  await expect((await page.request.get(`${origin}/me?client_id=alpha`)).status()).toBe(200);
  const verify = await page.request.get(`${origin}/verify?client_id=alpha`, { headers: { 'x-app-secret': APP_SECRET } });
  expect(await verify.json()).toMatchObject({ userId: USER_ID, membership: { status: 'active' } });
});

test('Kakao browser round trip and cross-client SSO preserve one user session', async ({ page }) => {
  await login(page, 'kakao');
  await page.goto(`${origin}/login?client_id=beta&return_to=${encodeURIComponent(CLIENTS.beta.default_redirect)}`);
  await expect(page).toHaveURL(/onboarding/);
  const me = await page.request.get(`${origin}/me?client_id=beta`);
  expect(await me.json()).toMatchObject({ userId: USER_ID, membership: null });
});

test('state is single-use and rejects provider mismatch', async ({ page }) => {
  const response = await page.request.get(`${origin}/login/google?client_id=alpha&return_to=${encodeURIComponent(CLIENTS.alpha.default_redirect)}`, { maxRedirects: 0 });
  const location = response.headers().location;
  expect(location).toContain('state=google-');
  const state = new URL(location!, origin).searchParams.get('state');
  expect((await page.request.get(`${origin}/callback/kakao?state=${state}&code=x`)).status()).toBe(400);
  expect((await page.request.get(`${origin}/callback/google?state=${state}&code=x`)).status()).toBe(400);

  const expiredResponse = await page.request.get(`${origin}/login/kakao?client_id=alpha&return_to=${encodeURIComponent(CLIENTS.alpha.default_redirect)}`, { maxRedirects: 0 });
  const expiredState = new URL(expiredResponse.headers().location!, origin).searchParams.get('state')!;
  (app.get(OidcService) as unknown as FakeOidc).expire(expiredState);
  expect((await page.request.get(`${origin}/callback/kakao?state=${expiredState}&code=x`)).status()).toBe(400);
});

test('logout, all-session logout, suspended membership, and deletion are enforced', async ({ page }) => {
  await login(page, 'google');
  await page.request.get(`${origin}/me?client_id=alpha`);
  const csrf = await page.context().cookies(origin).then((cookies) => cookies.find((cookie) => cookie.name === 'csrf')?.value);
  expect(csrf).toBeTruthy();
  expect((await page.request.post(`${origin}/logout?client_id=alpha`, { headers: { 'x-csrf-token': csrf! }, maxRedirects: 0 })).status()).toBe(302);
  await login(page, 'google');
  await page.request.get(`${origin}/me?client_id=alpha`);
  expect((await page.request.post(`${origin}/logout/all`, { headers: { 'x-csrf-token': (await page.context().cookies(origin)).find((cookie) => cookie.name === 'csrf')!.value }, maxRedirects: 0 })).status()).toBe(302);
  await login(page, 'google');
  await page.request.get(`${origin}/me?client_id=alpha`);
  (app.get(MembershipsService) as unknown as FakeMemberships).suspend('alpha');
  const suspended = await page.request.get(`${origin}/verify?client_id=alpha`, { headers: { 'x-app-secret': APP_SECRET } });
  expect(await suspended.json()).toMatchObject({ membership: { status: 'suspended' } });
  const deleteCsrf = (await page.context().cookies(origin)).find((cookie) => cookie.name === 'csrf')!.value;
  expect((await page.request.post(`${origin}/account/delete`, { headers: { 'x-csrf-token': deleteCsrf } })).status()).toBe(204);
  expect((await page.request.get(`${origin}/me`)).status()).toBe(401);
});
