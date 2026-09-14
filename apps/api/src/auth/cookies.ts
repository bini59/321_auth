import type { CookieOptions, Response } from 'express';
import { ENV } from '../config/env';

const SECURE = ENV.authOrigin.startsWith('https://');

export function cookieOptions(userOpts: CookieOptions = {}): CookieOptions {
  return {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax' as const,
    domain: ENV.cookieDomain || undefined,
    path: '/',
    ...userOpts,
  };
}

export function oauthStateCookieOptions(overrides: CookieOptions = {}): CookieOptions {
  return cookieOptions({ domain: undefined, httpOnly: true, maxAge: 10 * 60 * 1000, ...overrides });
}

export function setOauthStateCookie(res: Response, url: string) {
  const state = new URL(url).searchParams.get('state');
  if (!state) throw new Error('OAuth state missing from authorization URL');
  res.cookie('oauth_state', state, oauthStateCookieOptions());
}
