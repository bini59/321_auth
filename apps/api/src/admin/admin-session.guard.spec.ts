import { describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { AdminSessionGuard } from './admin-session.guard';

describe('AdminSessionGuard', () => {
  const context = (cookies: Record<string, string> = {}) => ({
    switchToHttp: () => ({ getRequest: () => ({ cookies }) }),
  }) as any;

  it('rejects missing and expired admin sessions', async () => {
    const guard = new AdminSessionGuard({ exists: async () => false } as any);
    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard.canActivate(context({ admin_sid: 'expired' }))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid admin session cookie', async () => {
    const guard = new AdminSessionGuard({ exists: async (sid: string) => sid === 'valid' } as any);
    await expect(guard.canActivate(context({ admin_sid: 'valid' }))).resolves.toBe(true);
  });
});
