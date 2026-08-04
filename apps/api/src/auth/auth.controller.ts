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
import type { ClientRow } from '../clients/clients.service';
import { pool } from '../db/db';

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
  ) {}

  @Get('healthz')
  healthz() {
    return { ok: true };
  }

  @Get('login')
  async login(@Req() req: Request, @Res() res: Response) {
    const q = req.query;
    const client = await this.clients.find(String(q.client_id ?? ''));
    if (!client) throw new BadRequestException('unknown client');

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
    if (!client) throw new BadRequestException('unknown client');

    const returnTo = this.oidc.validateReturnTo(
      req.query.return_to ? String(req.query.return_to) : undefined,
      client,
    );
    const url = await this.oidc.buildAuthUrl(provider, client.client_id, returnTo);
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
    if (!client) throw new BadRequestException('unknown client');
    const returnTo = this.oidc.validateReturnTo(
      req.query.return_to ? String(req.query.return_to) : undefined,
      client,
    );
    const url = await this.oidc.buildAuthUrl(provider, client.client_id, returnTo, {
      mode: 'link',
      existingUserId: session.userId,
    });
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
    const ctx = await this.oidc.consumeState(String(state ?? ''));
    if (!ctx) throw new BadRequestException('invalid or expired state');
    if (ctx.provider !== provider) throw new BadRequestException('provider mismatch');

    const client = await this.clients.find(ctx.clientId);
    if (!client) throw new BadRequestException('unknown client');

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
    if (ctx.mode === 'link' && ctx.existingUserId) {
      await this.users.linkIdentity(ctx.existingUserId, ident);
      userId = ctx.existingUserId;
    } else {
      userId = await this.users.upsertFromProvider(ident);
    }

    if (client.auto_provision) {
      await this.memberships.ensure(userId, client.client_id);
    }

    const sid = await this.sessions.create(userId, {
      ua: req.headers['user-agent'] ?? '',
      ip: req.ip ?? '',
    });
    res.cookie('sid', sid, cookieOptions({ maxAge: ENV.sessionTtlSeconds * 1000 }));
    res.cookie('csrf', '', cookieOptions({ maxAge: 0, httpOnly: false }));
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
    this.memberships.touch(user.id, clientId);
    await this.sessions.touch(sid, user.id);

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatar_url,
      membership,
    };
  }

  @Get('me')
  async me(@Req() req: Request, @Res() res: Response) {
    const sid: string | undefined = req.cookies?.sid;
    if (!sid) throw new UnauthorizedException();
    const sess = await this.sessions.get(sid);
    if (!sess) throw new UnauthorizedException();
    const user = await this.users.findById(sess.userId);
    if (!user) throw new UnauthorizedException();

    let membership = null;
    const clientId = req.query.client_id ? String(req.query.client_id) : undefined;
    if (clientId) membership = await this.memberships.find(user.id, clientId);

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
  ) {
    if (!dto.clientId || !dto.userId) throw new BadRequestException('clientId/userId required');
    await this.memberships.ensure(dto.userId, dto.clientId);
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
    await this.sessions.revokeAll(session.userId);
    res.clearCookie('sid', sidCookie());
    return res.status(204).send();
  }
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
    .map((p) => {
      const cfg = PROVIDERS[p];
      const disabled = !cfg.clientId;
      return `<a class="login ${disabled ? 'disabled' : ''}" href="/login/${p}?client_id=${escapeHtml(
        clientId,
      )}&return_to=${rt}"><span class="dot"></span>${escapeHtml(cfg.labels.ko)}로 시작</a>`;
    })
    .join('');
  const unconfigured = !PROVIDERS.google.clientId || !PROVIDERS.kakao.clientId;

  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>로그인 · ${escapeHtml(client.name)}</title>
<style>
  body{font-family:system-ui,sans-serif;background:#f4f5f7;display:grid;place-items:center;min-height:100vh;margin:0}
  .card{background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:32px;width:340px;box-shadow:0 10px 30px rgba(0,0,0,.06)}
  .logo{width:48px;height:48px;border-radius:10px;object-fit:cover;display:block;margin:0 auto 8px}
  h1{font-size:18px;text-align:center;color:#111827;margin:8px 0 24px}
  a.login{display:block;text-align:center;padding:12px;border:1px solid #d1d5db;border-radius:8px;color:#111827;text-decoration:none;margin-bottom:10px;transition:background .15s}
  a.login:hover{background:#f3f4f6}a.login[disabled]{opacity:.45;pointer-events:none;cursor:not-allowed}
  .error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:8px;padding:10px;font-size:13px;margin-bottom:14px;text-align:center}
  .hint{color:#6b7280;font-size:12px;text-align:center;margin-top:16px}
  .provider{display:flex;gap:8px;align-items:center;justify-content:center;font-weight:600}
  .dot{width:10px;height:10px;border-radius:50%;background:${theme};display:inline-block}
</style></head><body>
<div class="card">${logo}<h1>${escapeHtml(client.name)}</h1>${err}
<div id="btns">${providerButtons}</div>
${unconfigured ? '<div class="hint">프로바이더 키가 설정되지 않았습니다 (운영자는 .env 확인)</div>' : ''}
</div></body></html>`;
}
