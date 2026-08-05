import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ENV } from '../config/env';
import { AdminCsrfGuard } from './admin-csrf.guard';
import { AdminSessionService } from './admin-session.service';
import { validateAdminReturnTo } from './admin-return-to';
import { verifyAdminPassword } from './admin-password';

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
  constructor(private readonly sessions: AdminSessionService) {}

  @Get('csrf')
  csrf(@Res() res: Response) {
    const token = randomBytes(32).toString('base64url');
    res.cookie(CSRF_COOKIE, token, adminCookieOptions({ httpOnly: false }));
    return res.json({ csrfToken: token });
  }

  @Post('login')
  @UseGuards(AdminCsrfGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() body: { password?: string; returnTo?: string },
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const password = typeof body.password === 'string' ? body.password.slice(0, 1025) : '';
    if (typeof body.password === 'string' && body.password.length > 1024) {
      throw new UnauthorizedException('invalid administrator credentials');
    }
    if (!ENV.adminPasswordHash || !verifyAdminPassword(password, ENV.adminPasswordHash)) {
      throw new UnauthorizedException('invalid administrator credentials');
    }
    const sid = await this.sessions.create({ ua: String(req.headers['user-agent'] ?? ''), ip: req.ip ?? '' });
    res.cookie(ADMIN_COOKIE, sid, adminCookieOptions({ maxAge: ENV.adminSessionTtlSeconds * 1000 }));
    return res.json({ ok: true, returnTo: validateAdminReturnTo(body.returnTo) });
  }

  @Get('session')
  async session(@Req() req: Request) {
    const sid = req.cookies?.[ADMIN_COOKIE];
    if (!sid || !(await this.sessions.exists(sid))) throw new UnauthorizedException();
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
