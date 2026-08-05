import { describe, expect, it } from 'vitest';
import { validateAdminReturnTo } from './admin-return-to';

describe('validateAdminReturnTo', () => {
  it('allows only local admin paths outside auth endpoints', () => {
    expect(validateAdminReturnTo('/admin/users')).toBe('/admin/users');
    expect(validateAdminReturnTo('https://evil.example')).toBe('/admin');
    expect(validateAdminReturnTo('//evil.example/admin')).toBe('/admin');
    expect(validateAdminReturnTo('/admin/auth/session')).toBe('/admin');
  });
});

