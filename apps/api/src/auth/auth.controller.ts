import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Req,
  Res,
  UnauthorizedException,
  ForbiddenException,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import type { ClientRow } from '../clients/clients.service';
import { pool } from '../db/db';
import { InvalidProfileImageError, ProfileService } from '../profile/profile.service';
import { renderAccountLoginPage, renderAccountPage } from './account-page';
import { providerButton, providerButtonCss } from './provider-brand';

const SECURE = ENV.authOrigin.startsWith('https://');

function cookieOptions(userOpts: Partial<Record<string, unknown>> = {}) {
  return {
    httpOnly: true,
    secure: SECURE,
    sameSite: 'lax' as const,
    domain: ENV.cookieDomain || undefined,
    path: '/',
    ...userOpts,
  };
}

@Controller()
export class AuthController {
  constructor(
    private readonly clients: ClientsService,
    private readonly oidc: OidcService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly memberships: MembershipsService,
    private readonly profile: ProfileService,
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

    const html = renderLoginPage(client, client.client_id, returnTo, q.error ? String(q.error) : undefined);
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
    this.setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Get('client')
  async clientPortal(@Req() req: Request, @Res() res: Response) {
    const account = await this.account(req);
    if (!account) return res.status(401).type('html').send(renderAccountLoginPage());
    const csrf = randomBytes(16).toString('base64url');
    res.cookie('csrf', csrf, cookieOptions({ httpOnly: false }));
    return res.type('html').send(renderAccountPage(account, csrf));
  }

  @Get('client/login/:provider')
  async accountLogin(@Param('provider') providerStr: string, @Res() res: Response) {
    const provider = providerStr as ProviderName;
    if (!PROVIDERS[provider]) throw new BadRequestException('unknown provider');
    const url = await this.oidc.buildAccountAuthUrl(provider, 'account-login');
    this.setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Get('account')
  async accountApi(@Req() req: Request) {
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    return account;
  }

  @Get('account/link/:provider')
  async accountLink(@Param('provider') providerStr: string, @Req() req: Request, @Res() res: Response) {
    const provider = providerStr as ProviderName;
    if (!PROVIDERS[provider]) throw new BadRequestException('unknown provider');
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    const sid = req.cookies?.sid as string;
    const url = await this.oidc.buildAccountAuthUrl(provider, 'account-link', account.userId, sid);
    this.setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Patch('account/profile')
  @UseGuards(CsrfGuard)
  async updateAccountProfile(@Req() req: Request, @Body() body: { name?: unknown }) {
    const user = await this.saveAccountName(req, body);
    return { ...user, identities: await this.users.identities(user.id) };
  }

  // 포털은 서버 렌더링 HTML 폼이라 PATCH를 보낼 수 없다. 저장 후 포털로 되돌린다.
  @Post('account/profile')
  @UseGuards(CsrfGuard)
  async submitAccountProfile(@Req() req: Request, @Body() body: { name?: unknown }, @Res() res: Response) {
    await this.saveAccountName(req, body);
    return res.redirect(302, '/client');
  }

  @Post('account/avatar')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @UseGuards(CsrfGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 }, storage: undefined }))
  async uploadAccountAvatar(@Req() req: Request, @UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined) {
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    if (!file?.buffer) throw new BadRequestException('PNG image file is required');
    let avatarUrl: string;
    try {
      avatarUrl = await this.profile.saveAvatar(account.userId, file.buffer);
    } catch (error) {
      if (!(error instanceof InvalidProfileImageError)) throw error;
      throw new BadRequestException('invalid profile image');
    }
    try {
      const user = await this.users.updateProfile(account.userId, account.name || '사용자', avatarUrl);
      return { avatarUrl: user.avatar_url };
    } catch (error) {
      await this.profile.deleteAvatar(account.userId).catch(() => {});
      throw error;
    }
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
    this.setOauthStateCookie(res, url);
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
      : `${ENV.authOrigin}/login`;
    return res.redirect(302, target);
  }

  @Post('logout/all')
  @UseGuards(CsrfGuard)
  async logoutAll(@Req() req: Request, @Res() res: Response) {
    const sid: string | undefined = req.cookies?.sid;
    const sess = sid ? await this.sessions.get(sid) : null;
    if (sess) await this.sessions.revokeAll(sess.userId);
    res.clearCookie('sid', sidCookie());
    return res.redirect(302, `${ENV.authOrigin}/login`);
  }

  @Post('account/delete')
  @UseGuards(CsrfGuard)
  async deleteAccount(@Req() req: Request, @Res() res: Response) {
    const sid: string | undefined = req.cookies?.sid;
    if (!sid) throw new UnauthorizedException();
    const session = await this.sessions.get(sid);
    if (!session) throw new UnauthorizedException();

    await this.users.requestDeletion(session.userId);
    await this.profile.deleteAvatar(session.userId).catch(() => {});
    await this.sessions.revokeAll(session.userId);
    res.clearCookie('sid', sidCookie());
    return res.status(204).send();
  }

  private async saveAccountName(req: Request, body: { name?: unknown }) {
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 40) throw new BadRequestException('name must be 2-40 characters');
    return this.users.updateProfile(account.userId, name);
  }

  private async account(req: Request) {
    const sid: string | undefined = req.cookies?.sid;
    if (!sid) return null;
    const session = await this.sessions.get(sid);
    if (!session) return null;
    const user = await this.users.findById(session.userId);
    if (!user) return null;
    return { userId: user.id, email: user.email, name: user.name, avatarUrl: user.avatar_url, profileCompleted: Boolean(user.profile_completed_at), identities: await this.users.identities(user.id) };
  }

  private setOauthStateCookie(res: Response, url: string) {
    const state = new URL(url).searchParams.get('state');
    if (!state) throw new Error('OAuth state missing from authorization URL');
    res.cookie('oauth_state', state, oauthStateCookieOptions());
  }
}

function oauthStateCookieOptions() {
  return cookieOptions({ domain: undefined, httpOnly: true, maxAge: 10 * 60 * 1000 });
}

function sidCookie() {
  return { path: '/', domain: ENV.cookieDomain || undefined, secure: SECURE, httpOnly: true, sameSite: 'lax' as const };
}

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLoginPage(
  client: { name: string; logo_url: string | null; theme_color: string | null },
  clientId: string,
  returnTo: string,
  error?: string,
) {
  const theme = (client.theme_color || '#4f46e5').replace(/[^#0-9a-f]/gi, '');
  const logo = client.logo_url ? `<img src="${escapeHtml(client.logo_url)}" class="logo" alt="" />` : '';
  const err = error
    ? `<div class="error">로그인할 수 없습니다 (${escapeHtml(error)})</div>`
    : '';
  const rt = encodeURIComponent(returnTo);
  const providerButtons = (Object.keys(PROVIDERS) as ProviderName[])
    .map((p) =>
      providerButton(p, `/login/${p}?client_id=${escapeHtml(clientId)}&return_to=${rt}`, {
        configured: Boolean(PROVIDERS[p].clientId),
      }),
    )
    .join('');
  const unconfigured = !PROVIDERS.google.clientId || !PROVIDERS.kakao.clientId;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>로그인 · ${escapeHtml(client.name)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f4f5f7;display:grid;place-items:center;min-height:100vh;margin:0}
  .card{background:#fff;border:1px solid #e5e7eb;border-top:3px solid ${theme};border-radius:14px;padding:32px;width:340px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
  .logo{width:48px;height:48px;border-radius:10px;object-fit:cover;display:block;margin:0 auto 8px}
  h1{font-size:18px;text-align:center;color:#111827;margin:8px 0 24px}
  .error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:10px;font-size:13px;margin-bottom:14px;text-align:center}
  .hint{color:#6b7280;font-size:12px;text-align:center;margin-top:16px}
  ${providerButtonCss()}
</style></head><body>
<div class="card">${logo}<h1>${escapeHtml(client.name)}</h1>${err}
<div id="btns">${providerButtons}</div>
${unconfigured ? '<div class="hint">프로바이더 키가 설정되지 않았습니다 (운영자는 .env 확인)</div>' : ''}
</div></body></html>`;
}
