import { describe, expect, it } from 'vitest';
import { shouldFallbackToAdminShell, shouldRequireAdminLogin, shouldServeAdminShell } from './admin-static';

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
    expect(shouldFallbackToAdminShell('/api/overview')).toBe(false);
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
    expect(shouldRequireAdminLogin('/api/overview')).toBe(false);
  });
});
