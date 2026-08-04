import { createRemoteJWKSet } from 'jose';

export type ProviderName = 'google' | 'kakao';

export interface ProviderConfig {
  discovery: string;
  jwksUri: string;
  authUrl: string;
  tokenUrl: string;
  issuer: string;
  clientId: string;
  clientSecret: string | null;
  scope: string;
  labels: Record<string, string>;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function optional(name: string): string {
  return process.env[name] ?? '';
}

export const ENV = {
  port: Number(process.env.PORT ?? 3000),
  authOrigin: optional('AUTH_ORIGIN') || 'http://localhost:3000',
  cookieDomain: optional('COOKIE_DOMAIN'),
  sessionTtlSeconds: Number(process.env.SESSION_TTL_SECONDS ?? 1209600),
  csrfSalt: optional('CSRF_TOKEN_SALT'),
  allowedOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  googleClientId: optional('GOOGLE_CLIENT_ID'),
  googleClientSecret: optional('GOOGLE_CLIENT_SECRET'),
  kakaoRestApiKey: optional('KAKAO_REST_API_KEY'),
  kakaoClientSecret: optional('KAKAO_CLIENT_SECRET'),
  databaseUrl: optional('DATABASE_URL'),
  redisUrl: optional('REDIS_URL'),
};

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  google: {
    discovery: 'https://accounts.google.com/.well-known/openid-configuration',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    issuer: 'https://accounts.google.com',
    clientId: ENV.googleClientId,
    clientSecret: ENV.googleClientSecret || null,
    scope: 'openid email profile',
    labels: { ko: 'Google' },
  },
  kakao: {
    jwksUri: 'https://kauth.kakao.com/.well-known/jwks.json',
    authUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    issuer: 'https://kauth.kakao.com',
    clientId: ENV.kakaoRestApiKey,
    clientSecret: ENV.kakaoClientSecret || null,
    scope: 'openid',
    labels: { ko: 'Kakao' },
    discovery: 'https://kauth.kakao.com/.well-known/openid-configuration',
  },
};

// module 스코프 1회 생성 — 요청마다 만들면 카카오가 차단할 수 있음
export const JWKS = {
  google: createRemoteJWKSet(new URL(PROVIDERS.google.jwksUri)),
  kakao: createRemoteJWKSet(new URL(PROVIDERS.kakao.jwksUri)),
};
