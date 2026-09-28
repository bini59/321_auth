import { describe, expect, it, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { AdminAuthController } from './admin-auth.controller';
import type { AdminSessionService } from './admin-session.service';
import type { OidcService } from '../oidc/oidc.service';
import type { MembershipsService } from '../memberships/memberships.service';

function responseDouble() {
  const response = {
    cookies: [] as Array<{ name: string; value: string; options: Record<string, unknown> }>,
    cleared: [] as Array<{ name: string; options: Record<string, unknown> }>,
    body: undefined as unknown,
    cookie(name: string, value: string, options: Record<string, unknown>) {
      response.cookies.push({ name, value, options });
      return response;
    },
    clearCookie(name: string, options: Record<string, unknown>) {
      response.cleared.push({ name, options });
      return response;
    },
    json(body: unknown) {
      response.body = body;
      return response;
    },
  };
  return response;
}

describe('AdminAuthController', () => {
  const sessions = {
    create: async () => 'admin-session-id',
    exists: async (sid: string) => sid === 'admin-session-id',
    userId: async () => 'user-1',
    revoke: async () => undefined,
  };
  let controller: AdminAuthController;

  beforeEach(() => {
    controller = new AdminAuthController(
      sessions as unknown as AdminSessionService,
      {} as OidcService,
      { isAdmin: async () => true } as unknown as MembershipsService,
    );
  });

  it('checks and revokes the opaque session', async () => {
    await expect(controller.session({ cookies: { admin_sid: 'admin-session-id' } } as unknown as Request)).resolves.toEqual({ authenticated: true });
    await expect(controller.session({ cookies: { admin_sid: 'expired' } } as unknown as Request)).rejects.toMatchObject({ status: 401 });

    const res = responseDouble();
    await controller.logout(
      { cookies: { admin_sid: 'admin-session-id' } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.body).toEqual({ ok: true });
    expect(res.cleared[0]).toMatchObject({ name: 'admin_sid', options: { path: '/admin' } });
  });
});
