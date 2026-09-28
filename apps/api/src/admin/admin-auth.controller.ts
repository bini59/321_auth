import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ENV, PROVIDERS, type ProviderName } from '../config/env';
import { OidcService } from '../oidc/oidc.service';
import { MembershipsService } from '../memberships/memberships.service';
import { AdminCsrfGuard } from './admin-csrf.guard';
import { AdminSessionService } from './admin-session.service';
import { validateAdminReturnTo } from './admin-return-to';
import { setOauthStateCookie } from '../auth/cookies';

const SECURE = ENV.authOrigin.startsWith('https://');
const ADMIN_COOKIE = 'admin_sid';
const CSRF_COOKIE = 'admin_csrf';

function adminCookieOptions(overrides: Record<string, unknown> = {}) {
  return {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax' as const,
    path: '/admin',
    ...overrides,
  };
}

@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    private readonly sessions: AdminSessionService,
    private readonly oidc: OidcService,
    private readonly memberships: MembershipsService,
  ) {}

  @Get('login/:provider')
  async startLogin(@Param('provider') provider: string, @Req() req: Request, @Res() res: Response) {
    if (!Object.hasOwn(PROVIDERS, provider)) throw new UnauthorizedException();
    const returnTo = validateAdminReturnTo(req.query.return_to);
    const url = await this.oidc.buildAdminAuthUrl(provider as ProviderName, `${ENV.authOrigin}${returnTo}`);
    setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Get('csrf')
  csrf(@Res() res: Response) {
    const token = randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE, token, adminCookieOptions({ httpOnly: false }));
    return res.json({ csrfToken: token });
  }

  @Get('session')
  async session(@Req() req: Request) {
    const sid = req.cookies?.[ADMIN_COOKIE];
    const userId = sid && await this.sessions.userId(sid);
    if (!sid || !(await this.sessions.exists(sid)) || !userId || !(await this.memberships.isAdmin(userId))) {
      throw new UnauthorizedException();
    }
    return { authenticated: true };
  }

  @Post('logout')
  @UseGuards(AdminCsrfGuard)
  async logout(@Req() req: Request, @Res() res: Response) {
    const sid = req.cookies?.[ADMIN_COOKIE];
    if (sid) await this.sessions.revoke(sid);
    res.clearCookie(ADMIN_COOKIE, adminCookieOptions());
    return res.json({ ok: true });
  }
}
