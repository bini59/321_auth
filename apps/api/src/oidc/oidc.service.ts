import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { jwtVerify, type JWTPayload, type JWTVerifyOptions } from 'jose';
import { ENV, JWKS, PROVIDERS, type ProviderName } from '../config/env';
import { REDIS } from '../redis/redis-module';
import type Redis from 'ioredis';
import { validateReturnTo, type ClientInfo } from './return-to';

export type NormalizedIdentity = {
  provider: ProviderName;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
};

interface OauthState {
  provider: string;
  clientId: string | null;
  returnTo: string;
  verifier: string;
  nonce: string;
  mode?: 'login' | 'link' | 'account-login' | 'account-link' | 'admin-login';
  existingUserId?: string;
  existingSessionId?: string;
}

const OAUTH_STATE_TTL = 600;

@Injectable()
export class OidcService {
  constructor(@Inject(REDIS) private readonly redis: Redis | null) {}

  private client(): Redis {
    if (!this.redis) throw new Error('REDIS_URL not configured');
    return this.redis;
  }

  validateReturnTo(returnTo: string | undefined, client: ClientInfo): string {
    return validateReturnTo(returnTo, client);
  }

  async buildAuthUrl(
    provider: ProviderName,
    clientId: string | null,
    returnTo: string,
    opts: { mode?: 'login' | 'link' | 'account-login' | 'account-link' | 'admin-login'; existingUserId?: string; existingSessionId?: string } = {},
  ): Promise<string> {
    const cfg = PROVIDERS[provider];
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const nonce = randomBytes(16).toString('base64url');

    const payload: OauthState = {
      provider,
      clientId: clientId || null,
      returnTo,
      verifier,
      nonce,
      mode: opts.mode,
      existingUserId: opts.existingUserId,
      existingSessionId: opts.existingSessionId,
    };

    await this.client().set(`oauth_state:${state}`, JSON.stringify(payload), 'EX', OAUTH_STATE_TTL);

    const url = new URL(cfg.authUrl);
    url.searchParams.set('client_id', cfg.clientId);
    url.searchParams.set('redirect_uri', `${ENV.authOrigin}/callback/${provider}`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', cfg.scope);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    return url.toString();
  }

  async buildAccountAuthUrl(provider: ProviderName, mode: 'account-login' | 'account-link', existingUserId?: string, existingSessionId?: string) {
    return this.buildAuthUrl(provider, null, `${ENV.authOrigin}/client`, { mode, existingUserId, existingSessionId });
  }

  async buildAdminAuthUrl(provider: ProviderName, returnTo: string) {
    return this.buildAuthUrl(provider, null, returnTo, { mode: 'admin-login' });
  }

  // GETDEL — state 1회만 소비 (리플레이 차단)
  async consumeState(state: string): Promise<OauthState | null> {
    const raw = await this.client().getdel(`oauth_state:${state}`);
    return raw ? (JSON.parse(raw) as OauthState) : null;
  }

  async exchangeCode(provider: ProviderName, code: string, verifier: string) {
    const cfg = PROVIDERS[provider];
    const params = new URLSearchParams({
      client_id: cfg.clientId,
      code,
      redirect_uri: `${ENV.authOrigin}/callback/${provider}`,
      grant_type: 'authorization_code',
      code_verifier: verifier,
    });
    // 카카오: client_secret은 콘솔에서 활성화했을 때만 포함 (켜/끄면 조용히 깨짐)
    if (cfg.clientSecret) params.set('client_secret', cfg.clientSecret);

    const res = await fetch(cfg.tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    if (!res.ok) {
      throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as { access_token?: string; id_token?: string };
  }

  async verifyIdToken(provider: ProviderName, idToken: string, nonce: string): Promise<JWTPayload> {
    const cfg = PROVIDERS[provider];
    const opts: JWTVerifyOptions = {
      issuer: cfg.issuer,
      audience: cfg.clientId,
    };
    const { payload } = await jwtVerify(idToken, JWKS[provider], opts);
    if (payload.nonce !== nonce) {
      throw new Error('nonce mismatch');
    }
    return payload;
  }

  // PRD §7.6 — 프로바이더 차이를 여기서 전부 흡수
  normalize(provider: ProviderName, c: JWTPayload): NormalizedIdentity {
    if (provider === 'google') {
      return {
        provider: 'google',
        providerUserId: c.sub!,
        email: (c.email as string | undefined) ?? null,
        emailVerified: c.email_verified === true,
        name: (c.name as string | undefined) ?? null,
        avatarUrl: (c.picture as string | undefined) ?? null,
      };
    }
    if (provider === 'kakao') {
      return {
        provider: 'kakao',
        providerUserId: c.sub!,
        email: (c.email as string | undefined) ?? null,
        // 카카오는 email_verified를 제공하지 않으므로 기본 false
        emailVerified: false,
        name: (c.nickname as string | undefined) ?? (c.name as string | undefined) ?? null,
        avatarUrl: (c.picture as string | undefined) ?? null,
      };
    }
    throw new Error(`unknown provider: ${provider}`);
  }
}
