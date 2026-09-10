import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { ENV, PROVIDERS, type ProviderName } from '../config/env';
import { ClientsService } from '../clients/clients.service';
import { OidcService } from '../oidc/oidc.service';
import { SessionService } from '../sessions/session.service';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../memberships/memberships.service';
import { AppSecretGuard } from '../security/app-secret.guard';
import { CsrfGuard } from '../security/csrf.guard';
import { pool } from '../db/db';
import { AdminSessionService } from '../admin/admin-session.service';
import { cspNonce } from './portal-ui';
import { renderLoginPage } from './login-page';
import { cookieOptions, oauthStateCookieOptions, setOauthStateCookie } from './cookies';

const SECURE = ENV.authOrigin.startsWith('https://');

@Controller()
export class AuthController {
  constructor(
    private readonly clients: ClientsService,
    private readonly oidc: OidcService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly memberships: MembershipsService,
    private readonly adminSessions: AdminSessionService,
  ) {}

  @Get('healthz')
  healthz() {
    return { ok: true };
  }

  @Get('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const q = req.query;
    const client = await this.clients.find(String(q.client_id ?? ''));
    if (!client || !client.is_active) throw new BadRequestException('unknown client');

    const returnTo = this.oidc.validateReturnTo(
      q.return_to ? String(q.return_to) : undefined,
      client,
    );

    // 이미 로그인되어 있으면 즉시 통과 (SSO 핵심)
    const sid: string | undefined = req.cookies?.sid;
    if (sid) {
      const sess = await this.sessions.get(sid);
      if (sess) return res.redirect(302, returnTo);
    }

    res.cookie('csrf', randomBytes(16).toString('base64url'), {
      ...cookieOptions({ httpOnly: false }),
    });

    const html = renderLoginPage(
      client,
      client.client_id,
      returnTo,
      q.error ? String(q.error) : undefined,
      cspNonce(res),
    );
    res.type('html').send(html);
  }

  @Get('login/:provider')
  async start(@Param('provider') providerStr: string, @Req() req: Request, @Res() res: Response) {
    const provider = providerStr as ProviderName;
    if (!PROVIDERS[provider]) throw new BadRequestException('unknown provider');

    const client = await this.clients.find(String(req.query.client_id ?? ''));
    if (!client || !client.is_active) throw new BadRequestException('unknown client');

    const returnTo = this.oidc.validateReturnTo(
      req.query.return_to ? String(req.query.return_to) : undefined,
      client,
    );
    const url = await this.oidc.buildAuthUrl(provider, client.client_id, returnTo);
    setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Get('link/:provider')
  async link(@Param('provider') providerStr: string, @Req() req: Request, @Res() res: Response) {
    const provider = providerStr as ProviderName;
    if (!PROVIDERS[provider]) throw new BadRequestException('unknown provider');

    const sid: string | undefined = req.cookies?.sid;
    if (!sid) throw new UnauthorizedException();
    const session = await this.sessions.get(sid);
    if (!session) throw new UnauthorizedException();

    const client = await this.clients.find(String(req.query.client_id ?? ''));
    if (!client || !client.is_active) throw new BadRequestException('unknown client');
    const returnTo = this.oidc.validateReturnTo(
      req.query.return_to ? String(req.query.return_to) : undefined,
      client,
    );
    const url = await this.oidc.buildAuthUrl(provider, client.client_id, returnTo, {
      mode: 'link',
      existingUserId: session.userId,
      existingSessionId: sid,
    });
    setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Get('callback/:provider')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async callback(
    @Param('provider') providerStr: string,
    @Query('state') state: string,
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = providerStr as ProviderName;
    if (!state || req.cookies?.oauth_state !== state) {
      throw new BadRequestException('invalid OAuth browser state');
    }
    const ctx = await this.oidc.consumeState(String(state ?? ''));
    if (!ctx) throw new BadRequestException('invalid or expired state');
    if (ctx.provider !== provider) throw new BadRequestException('provider mismatch');
    if (ctx.existingSessionId && ctx.existingSessionId !== req.cookies?.sid) {
      throw new UnauthorizedException('oauth session mismatch');
    }
    res.clearCookie('oauth_state', oauthStateCookieOptions());

    const client = ctx.clientId ? await this.clients.find(ctx.clientId) : null;
    if (ctx.clientId && (!client || !client.is_active)) throw new BadRequestException('unknown client');

    if (error && ctx.mode === 'admin-login') {
      return res.redirect(302, `${ENV.authOrigin}/admin/login?error=denied&return_to=${encodeURIComponent(ctx.returnTo.replace(`${ENV.authOrigin}`, ''))}`);
    }
    if (error) {
      const u = new URL(ctx.returnTo);
      u.searchParams.set('auth_error', 'denied');
      return res.redirect(302, u.toString());
    }
    if (!code) throw new BadRequestException('missing code');

    const tokens = await this.oidc.exchangeCode(provider, code, ctx.verifier);
    if (!tokens.id_token) throw new BadRequestException('missing id_token');
    const claims = await this.oidc.verifyIdToken(provider, tokens.id_token, ctx.nonce);
    const ident = this.oidc.normalize(provider, claims);

    let userId: string;
    if ((ctx.mode === 'link' || ctx.mode === 'account-link') && ctx.existingUserId) {
      try {
        await this.users.linkIdentity(ctx.existingUserId, ident);
      } catch (error) {
        if (error instanceof Error && error.message.includes('identity already linked')) {
          const u = new URL(ctx.returnTo);
          u.searchParams.set('auth_error', 'identity_already_linked');
          return res.redirect(302, u.toString());
        }
        throw error;
      }
      userId = ctx.existingUserId;
    } else {
      userId = await this.users.upsertFromProvider(ident);
    }

    if (client?.auto_provision) {
      await this.memberships.ensure(userId, client.client_id);
    }

    if (ctx.mode === 'admin-login') {
      if (!(await this.memberships.isAdmin(userId))) {
        const u = new URL(ctx.returnTo);
        const returnTo = u.pathname + u.search;
        return res.redirect(302, `${ENV.authOrigin}/admin/login?error=forbidden&return_to=${encodeURIComponent(returnTo)}`);
      }
      const adminSid = await this.adminSessions.create({
        userId,
        ua: String(req.headers['user-agent'] ?? ''),
        ip: req.ip ?? '',
      });
      res.cookie('admin_sid', adminSid, {
        httpOnly: true,
        secure: SECURE,
        sameSite: 'lax' as const,
        path: '/admin',
        maxAge: ENV.adminSessionTtlSeconds * 1000,
      });
      res.clearCookie('oauth_state', oauthStateCookieOptions({ maxAge: 0, domain: ENV.cookieDomain || undefined }));
      return res.redirect(302, ctx.returnTo);
    }

    let sid: string | undefined;
    if (ctx.mode !== 'link' && ctx.mode !== 'account-link') {
      sid = await this.sessions.create(userId, {
        ua: req.headers['user-agent'] ?? '',
        ip: req.ip ?? '',
      });
      res.cookie('sid', sid, cookieOptions({ maxAge: ENV.sessionTtlSeconds * 1000 }));
    }
    res.cookie('csrf', '', cookieOptions({ maxAge: 0, httpOnly: false }));
    if (ctx.mode === 'account-login' || ctx.mode === 'account-link') return res.redirect(302, ctx.returnTo);
    const freshUser = await this.users.findById(userId);
    if (freshUser && !freshUser.profile_completed_at) {
      return res.redirect(302, `${ENV.authOrigin}/client?onboarding=1`);
    }
    return res.redirect(302, ctx.returnTo);
  }

  @Get('verify')
  @UseGuards(AppSecretGuard)
  async verify(@Req() req: Request) {
    const clientId = req.authClientId;
    const authClient = req.authClient;
    if (!clientId || !authClient) throw new UnauthorizedException();
    const sid: string | undefined = req.cookies?.sid;
    if (!sid) throw new UnauthorizedException();

    const sess = await this.sessions.get(sid);
    if (!sess) throw new UnauthorizedException();

    const user = await this.users.findById(sess.userId);
    if (!user) throw new UnauthorizedException();

    let membership = await this.memberships.find(user.id, clientId);
    if (!membership && authClient.auto_provision) {
      await this.memberships.ensure(user.id, clientId);
      membership = await this.memberships.find(user.id, clientId);
    }
    if (membership?.status === 'suspended') throw new ForbiddenException('membership suspended');
    this.memberships.touch(user.id, clientId);
    await this.sessions.touch(sid, user.id);

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      profileComplete: Boolean(user.profile_completed_at),
      membership,
    };
  }

  @Get('me')
  async me(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const sid: string | undefined = req.cookies?.sid;
    if (!sid) throw new UnauthorizedException();
    const sess = await this.sessions.get(sid);
    if (!sess) throw new UnauthorizedException();
    const user = await this.users.findById(sess.userId);
    if (!user) throw new UnauthorizedException();

    let membership = null;
    const clientId = req.query.client_id ? String(req.query.client_id) : undefined;
    if (clientId) {
      const client = await this.clients.find(clientId);
      if (!client || !client.is_active) throw new BadRequestException('unknown client');
      membership = await this.memberships.find(user.id, clientId);
    }

    res.cookie('csrf', randomBytes(16).toString('base64url'), {
      ...cookieOptions({ httpOnly: false }),
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      membership,
    };
  }

  @Post('memberships')
  @UseGuards(AppSecretGuard)
  async createMembership(
    @Body() dto: { clientId: string; userId: string },
    @Req() req: Request,
  ) {
    const serviceId = (dto as { serviceId?: string }).serviceId ?? dto.clientId;
    if (!serviceId || !dto.userId) throw new BadRequestException('serviceId/userId required');
    if (req.authClientId !== serviceId) throw new ForbiddenException('service mismatch');
    await this.memberships.ensure(dto.userId, serviceId);
    return { ok: true };
  }

  @Get('deletions')
  @UseGuards(AppSecretGuard)
  async deletions(@Query('since') since: string | undefined) {
    const sinceIso = since && !isNaN(Date.parse(since)) ? since : undefined;
    const r = await pool.query(
      `SELECT user_id, requested_at FROM deletion_queue
       WHERE ($1::timestamptz IS NULL OR requested_at > $1::timestamptz)
       ORDER BY requested_at ASC`,
      [sinceIso ?? null],
    );
    return { deletions: r.rows.map((x) => ({ userId: x.user_id, requestedAt: x.requested_at })) };
  }

  @Post('deletions/:userId/ack')
  @UseGuards(AppSecretGuard)
  async ackDeletion(@Param('userId') userId: string) {
    await pool.query(`DELETE FROM deletion_queue WHERE user_id = $1`, [userId]);
    return { ok: true };
  }

  @Post('logout')
  @UseGuards(CsrfGuard)
  async logout(@Req() req: Request, @Res() res: Response) {
    const sid: string | undefined = req.cookies?.sid;
    if (sid) await this.sessions.revoke(sid);
    res.clearCookie('sid', cookieOptions());

    const client = await this.clients.find(String(req.query.client_id ?? ''));
    const target = client
      ? this.oidc.validateReturnTo(req.query.return_to ? String(req.query.return_to) : undefined, client)
      : `${ENV.authOrigin}/client`;
    return res.redirect(302, target);
  }

  @Post('logout/all')
  @UseGuards(CsrfGuard)
  async logoutAll(@Req() req: Request, @Res() res: Response) {
    const sid: string | undefined = req.cookies?.sid;
    const sess = sid ? await this.sessions.get(sid) : null;
    if (sess) await this.sessions.revokeAll(sess.userId);
    res.clearCookie('sid', cookieOptions());
    return res.redirect(302, `${ENV.authOrigin}/client`);
  }
}
