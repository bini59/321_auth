import { afterEach, expect, it, vi } from 'vitest';
import type { Response } from 'express';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each(['http', 'https'])('preserves session and OAuth cookie scopes over %s', async (protocol) => {
  vi.stubEnv('AUTH_ORIGIN', `${protocol}://auth.example.test`);
  vi.stubEnv('COOKIE_DOMAIN', '.example.test');
  vi.resetModules();
  const { cookieOptions, oauthStateCookieOptions, setOauthStateCookie } = await import('./cookies');
  const session = {
    httpOnly: true, secure: protocol === 'https', sameSite: 'lax', domain: '.example.test', path: '/',
  };
  expect(cookieOptions()).toEqual(session);
  expect(cookieOptions({ httpOnly: false })).toEqual({ ...session, httpOnly: false });
  expect(oauthStateCookieOptions()).toEqual({ ...session, domain: undefined, maxAge: 600_000 });
  expect(oauthStateCookieOptions({ domain: '.example.test', maxAge: 0 })).toEqual({ ...session, maxAge: 0 });

  const res = { cookie: vi.fn() };
  setOauthStateCookie(res as unknown as Response, 'https://provider.example/authorize?state=opaque-state');
  expect(res.cookie).toHaveBeenCalledWith('oauth_state', 'opaque-state', oauthStateCookieOptions());
  expect(() => setOauthStateCookie(res as unknown as Response, 'https://provider.example/authorize'))
    .toThrow('OAuth state missing from authorization URL');
  expect(res.cookie).toHaveBeenCalledTimes(1);
});
