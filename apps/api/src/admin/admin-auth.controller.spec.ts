import { describe, expect, it, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { AdminAuthController } from './admin-auth.controller';
import type { AdminSessionService } from './admin-session.service';
import type { OidcService } from '../oidc/oidc.service';
import type { MembershipsService } from '../memberships/memberships.service';
import type { UsersService } from '../users/users.service';
import { ENV } from '../config/env';

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
  const users = {
    findById: async (id: string) => (id === 'user-1'
      ? { id: 'user-1', email: 'admin@example.com', email_verified: true, name: 'Admin', avatar_url: null }
      : null),
  };

  beforeEach(() => {
    controller = new AdminAuthController(
      sessions as unknown as AdminSessionService,
      {} as OidcService,
      { isAdmin: async () => true } as unknown as MembershipsService,
      users as unknown as UsersService,
    );
  });

  it('checks and revokes the opaque session', async () => {
    await expect(controller.session({ cookies: { admin_sid: 'admin-session-id' } } as unknown as Request)).resolves.toEqual({
      authenticated: true,
      user: { userId: 'user-1', email: 'admin@example.com', emailVerified: true, name: 'Admin', avatarUrl: null, membership: null },
    });
    await expect(controller.session({ cookies: { admin_sid: 'expired' } } as unknown as Request)).rejects.toMatchObject({ status: 401 });

    const res = responseDouble();
    await controller.logout(
      { cookies: { admin_sid: 'admin-session-id' } } as unknown as Request,
      res as unknown as Response,
    );
    expect(res.body).toEqual({ ok: true });
    expect(res.cleared[0]).toMatchObject({ name: 'admin_sid', options: { path: '/admin' } });
  });

  it('rejects a session whose user record is gone', async () => {
    const ghost = new AdminAuthController(
      { ...sessions, userId: async () => 'ghost' } as unknown as AdminSessionService,
      {} as OidcService,
      { isAdmin: async () => true } as unknown as MembershipsService,
      users as unknown as UsersService,
    );
    await expect(ghost.session({ cookies: { admin_sid: 'admin-session-id' } } as unknown as Request)).rejects.toMatchObject({ status: 401 });
  });

  it('only exposes avatars the CSP img-src allows (static origin)', async () => {
    const withAvatar = (avatar_url: string) => new AdminAuthController(
      sessions as unknown as AdminSessionService,
      {} as OidcService,
      { isAdmin: async () => true } as unknown as MembershipsService,
      { findById: async () => ({ id: 'user-1', email: 'a@b.c', email_verified: true, name: 'A', avatar_url }) } as unknown as UsersService,
    );
    const req = { cookies: { admin_sid: 'admin-session-id' } } as unknown as Request;
    const own = `${ENV.staticOrigin}/img/profile/x.png`;
    await expect(withAvatar(own).session(req)).resolves.toMatchObject({ user: { avatarUrl: own } });
    await expect(withAvatar('https://lh3.googleusercontent.com/a/x').session(req)).resolves.toMatchObject({ user: { avatarUrl: null } });
  });
});
