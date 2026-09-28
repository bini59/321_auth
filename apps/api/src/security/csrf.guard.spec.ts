import { describe, expect, it } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { ENV } from '../config/env';
import { CsrfGuard } from './csrf.guard';
import { AdminCsrfGuard } from '../admin/admin-csrf.guard';

function ctx(origin: string | undefined, cookieName = 'csrf') {
  const req = { path: '/logout', query: {}, cookies: { [cookieName]: 't' }, headers: { 'x-csrf-token': 't', ...(origin ? { origin } : {}) } };
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

describe('CsrfGuard origin check', () => {
  ENV.authOrigin = 'https://auth.bini59.dev';
  ENV.allowedOrigins = ['https://app.bini59.dev'];

  it('accepts the auth origin, allowed app origins, and requests without Origin', () => {
    const guard = new CsrfGuard();
    expect(guard.canActivate(ctx('https://auth.bini59.dev'))).toBe(true);
    expect(guard.canActivate(ctx('https://app.bini59.dev'))).toBe(true);
    expect(guard.canActivate(ctx(undefined))).toBe(true);
  });

  it('rejects other same-site subdomains even with a matching token', () => {
    expect(() => new CsrfGuard().canActivate(ctx('https://evil.bini59.dev'))).toThrow('cross-origin request');
  });

  it('admin guard accepts only the auth origin', () => {
    const guard = new AdminCsrfGuard();
    expect(guard.canActivate(ctx('https://auth.bini59.dev', 'admin_csrf'))).toBe(true);
    expect(() => guard.canActivate(ctx('https://app.bini59.dev', 'admin_csrf'))).toThrow('cross-origin request');
  });
});
