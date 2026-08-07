import { describe, expect, it, vi } from 'vitest';
import { installAdminStatic, isAdminApiPath, shouldFallbackToAdminShell, shouldRequireAdminLogin, shouldServeAdminShell } from './admin-static';

vi.mock('node:fs', () => ({ existsSync: () => true }));

describe('admin SPA fallback policy', () => {
  it('falls back for extensionless SPA routes', () => {
    expect(shouldFallbackToAdminShell('/users')).toBe(true);
    expect(shouldFallbackToAdminShell('/operations/audit')).toBe(true);
  });

  it('does not fall back for the static root or asset-looking paths', () => {
    expect(shouldFallbackToAdminShell('/')).toBe(false);
    expect(shouldFallbackToAdminShell('/assets/index.js')).toBe(false);
    expect(shouldFallbackToAdminShell('/missing.css')).toBe(false);
    expect(shouldFallbackToAdminShell('/auth/csrf')).toBe(false);
    expect(shouldFallbackToAdminShell('/auth')).toBe(false);
    expect(shouldFallbackToAdminShell('/api/users')).toBe(false);
    expect(shouldFallbackToAdminShell('/api/overview')).toBe(false);
    expect(shouldFallbackToAdminShell('/services')).toBe(false);
    expect(shouldFallbackToAdminShell('/services/client-a')).toBe(false);
    expect(shouldFallbackToAdminShell('/clients')).toBe(false);
    expect(shouldFallbackToAdminShell('/clients/client-a')).toBe(false);
    expect(isAdminApiPath('/services')).toBe(true);
    expect(isAdminApiPath('/clients/client-a')).toBe(true);
    expect(isAdminApiPath('/service-worker')).toBe(false);
  });

  it('serves the shell at both admin entry paths', () => {
    expect(shouldServeAdminShell('/')).toBe(true);
    expect(shouldServeAdminShell('/overview')).toBe(true);
  });

  it('requires a session for Admin routes except the login page', () => {
    expect(shouldRequireAdminLogin('/')).toBe(true);
    expect(shouldRequireAdminLogin('/users')).toBe(true);
    expect(shouldRequireAdminLogin('/login')).toBe(false);
    expect(shouldRequireAdminLogin('/assets/index.js')).toBe(false);
  });

  it('passes service controller paths through before applying the SPA shell', () => {
    const use = vi.fn();
    const app = {
      getHttpAdapter: () => ({ getInstance: () => ({ use }) }),
      get: () => ({ exists: vi.fn() }),
    };
    installAdminStatic(app as never);
    const middleware = use.mock.calls[0][1] as (req: unknown, res: unknown, next: () => void) => void;
    const next = vi.fn();

    middleware({ path: '/services', originalUrl: '/admin/services' }, {}, next);
    middleware({ path: '/clients/legacy', originalUrl: '/admin/clients/legacy' }, {}, next);

    expect(next).toHaveBeenCalledTimes(2);
  });
});
