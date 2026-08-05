import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

describe('AuthController membership authorization', () => {
  it('rejects a body clientId that differs from the authenticated client', async () => {
    const memberships = { ensure: vi.fn() };
    const controller = new AuthController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      memberships as never,
    );

    await expect(
      controller.createMembership(
        { clientId: 'other', userId: 'user-1' },
        { authClientId: 'profile' } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(memberships.ensure).not.toHaveBeenCalled();
  });

  it('creates a membership for the authenticated client', async () => {
    const memberships = { ensure: vi.fn().mockResolvedValue(undefined) };
    const controller = new AuthController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      memberships as never,
    );

    await expect(
      controller.createMembership(
        { clientId: 'profile', userId: 'user-1' },
        { authClientId: 'profile' } as never,
      ),
    ).resolves.toEqual({ ok: true });
    expect(memberships.ensure).toHaveBeenCalledWith('user-1', 'profile');
  });
});
