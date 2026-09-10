import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { PROVIDERS, type ProviderName } from '../config/env';
import { OidcService } from '../oidc/oidc.service';
import { SessionService } from '../sessions/session.service';
import { UsersService } from '../users/users.service';
import { MembershipsService } from '../memberships/memberships.service';
import { CsrfGuard } from '../security/csrf.guard';
import { InvalidProfileImageError, ProfileService } from '../profile/profile.service';
import { renderAccountLoginPage, renderAccountPage } from './account-page';
import { cspNonce } from './portal-ui';
import { cookieOptions, setOauthStateCookie } from './cookies';

@Controller()
export class AccountController {
  constructor(
    private readonly oidc: OidcService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly memberships: MembershipsService,
    private readonly profile: ProfileService,
  ) {}

  @Get('client')
  async clientPortal(@Req() req: Request, @Res() res: Response) {
    const account = await this.account(req);
    if (!account) return res.status(401).type('html').send(renderAccountLoginPage(cspNonce(res)));
    const csrf = randomBytes(16).toString('base64url');
    res.cookie('csrf', csrf, cookieOptions({ httpOnly: false }));
    const [memberships, sessions] = await Promise.all([
      this.accountMemberships(account.userId),
      this.accountSessions(account.userId, req.cookies?.sid),
    ]);
    const authError = req.query.auth_error ? String(req.query.auth_error) : null;
    const notice = req.query.notice ? String(req.query.notice) : null;
    return res
      .type('html')
      .send(renderAccountPage({ ...account, memberships, sessions, authError, notice }, csrf, cspNonce(res)));
  }

  @Get('client/login/:provider')
  async accountLogin(@Param('provider') providerStr: string, @Res() res: Response) {
    const provider = providerStr as ProviderName;
    if (!PROVIDERS[provider]) throw new BadRequestException('unknown provider');
    const url = await this.oidc.buildAccountAuthUrl(provider, 'account-login');
    setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Get('account')
  async accountApi(@Req() req: Request) {
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    return { ...account, memberships: await this.accountMemberships(account.userId) };
  }

  @Get('account/memberships')
  async accountMembershipsApi(@Req() req: Request) {
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    return { memberships: await this.accountMemberships(account.userId) };
  }

  @Get('account/sessions')
  async accountSessionsApi(@Req() req: Request) {
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    return { sessions: await this.accountSessions(account.userId, req.cookies?.sid) };
  }

  @Get('account/link/:provider')
  async accountLink(@Param('provider') providerStr: string, @Req() req: Request, @Res() res: Response) {
    const provider = providerStr as ProviderName;
    if (!PROVIDERS[provider]) throw new BadRequestException('unknown provider');
    const account = await this.account(req);
    if (!account) throw new UnauthorizedException();
    const sid = req.cookies?.sid as string;
    const url = await this.oidc.buildAccountAuthUrl(provider, 'account-link', account.userId, sid);
    setOauthStateCookie(res, url);
    return res.redirect(302, url);
  }

  @Patch('account/profile')
  @UseGuards(CsrfGuard)
  async updateAccountProfile(@Req() req: Request, @Body() body: { name?: unknown }) {
    const user = await this.saveAccountName(req, body);
    return { ...user, identities: await this.users.identities(user.id) };
  }

  @Post('account/profile')
  @UseGuards(CsrfGuard)
  async submitAccountProfile(@Req() req: Request, @Body() body: { name?: unknown }, @Res() res: Response) {
    try {
      await this.saveAccountName(req, body);
    } catch (error) {
      if (error instanceof BadRequestException) return res.redirect(302, '/client?notice=name_invalid');
      throw error;
    }
    return res.redirect(302, '/client?notice=profile_saved');
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
      const user = await this.users.updateProfile(account.userId, undefined, avatarUrl);
      return { avatarUrl: user.avatar_url };
    } catch (error) {
      await this.profile.deleteAvatar(account.userId).catch(() => {});
      throw error;
    }
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
    res.clearCookie('sid', cookieOptions());
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

  // Redis/DB 가 흔들려도 계정 화면 전체가 죽지 않도록 목록 조회는 빈 배열로 접는다.
  private async accountMemberships(userId: string) {
    try {
      return await this.memberships.listForUser(userId);
    } catch {
      return [];
    }
  }

  private async accountSessions(userId: string, currentSid?: string) {
    try {
      return await this.sessions.listForUser(userId, currentSid);
    } catch {
      return [];
    }
  }
}
