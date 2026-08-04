# 개인 프로젝트 통합 인증 시스템 설계 및 구현 문서

> 대상: `*.[bini59.dev](http://bini59.dev)` 하위 개인 프로젝트들의 통합 로그인 방식: 중앙 auth 서버 + 공유 세션 쿠키 (opaque session ID) 프로바이더: Google, Kakao (소셜 로그인 전용, ID/PW 없음)

---

## 1. 설계 결정 요약


| 항목         | 선택                                                     | 이유                                                                 |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------ |
| SSO 구현 방식  | 공유 쿠키 + 중앙 세션 스토어                                      | 모든 앱이 `.[bini59.dev](http://bini59.dev)` 하위. OIDC provider 자체 구축은 과함 |
| 세션 토큰      | opaque session ID (랜덤 32B)                             | 즉시 무효화 가능. JWT는 이 장점을 버림                                           |
| 로그인 페이지    | auth 서버가 테마별로 서빙 (패턴 1)                                | 앱이 비밀번호/토큰을 만지지 않음. blast radius 최소                                |
| 인증 방식      | 소셜 전용 (Google, Kakao)                                  | 비밀번호 해싱/재설정/유출대응 전부 제거                                             |
| 프로바이더 프로토콜 | OIDC (양쪽 모두)                                           | 표준 ID token 검증으로 통일. 프로바이더별 SDK 불필요                                |
| 계정 연결      | 이메일 기반 자동 연결 **안 함**                                   | 카카오 이메일은 없을 수도/미인증일 수도 있음                                          |
| 회원 정보      | `users`(전역) / `memberships`(앱별) / `profiles`(앱 DB) 3계층 | auth 서버가 앱 스키마를 알지 않도록                                             |


### 명시적으로 채택하지 않은 것

- **JWT 세션** — 무효화가 안 됨. 블랙리스트를 만들면 opaque ID와 같아지는데 복잡도만 늘어남
- **각 앱이 직접 소셜 로그인** — 프로바이더 콘솔에 앱마다 redirect URI 등록 + client secret 배포가 필요해짐
- **각 앱이 Redis 직접 조회** — 모든 앱에 Redis 자격증명이 퍼지고 세션 스키마가 결합됨
- **이메일 기반 자동 계정 병합** — pre-account hijacking 취약점
- `users` **테이블에 앱별 컬럼** — 앱 추가마다 auth DB 마이그레이션 발생

---

## 2. 아키텍처

```
                    ┌────────────────────────┐
                    │   auth.bini59.dev       │
                    │  - 로그인 UI (테마별)   │
   Google  ◄───────►│  - OIDC 클라이언트     │
   Kakao   ◄───────►│  - 세션 발급/검증      │
                    └──────┬──────────┬──────┘
                           │          │
                  ┌────────▼───┐  ┌───▼─────────┐
                  │   Redis    │  │  auth_db    │
                  │  세션/state │  │  users 등    │
                  └────────▲───┘  └─────────────┘
                           │ (auth 서버만 접근)
      ┌────────────────────┴────────────────────┐
      │  /verify 호출 (앱 서버 → auth 서버)      │
 ┌────▼──────┐      ┌───────────┐      ┌────────▼───┐
 │a.bini59.dev│      │b.bini59.dev│      │c.bini59.dev │
 │ app_a_db  │      │ app_b_db  │      │ app_c_db   │
 └───────────┘      └───────────┘      └────────────┘

```

auth 서버의 이중 역할:

- **밖으로는** Google/Kakao에 대한 OAuth 클라이언트 (RP)
- **안으로는** 내 앱들에 대한 세션 발급자

### 2.1 배포 인프라 (docker-compose)

이 서버 한 대에서 docker-compose로 전체 스택을 돌린다. 바깥에는 **cloudflared tunnel 하나만** 노출되고, DB·Redis는 compose 내부 네트워크로만 접근한다.

| 서비스     | 역할                             | 포트 노출          |
| ---------- | -------------------------------- | ----------------- |
| auth-app   | NestJS auth 서버                 | 없음 (tunnel만)   |
| postgres   | 인증 DB (auth_db + 앱 DBs)       | 없음              |
| redis      | 세션 / oauth_state               | 없음              |

- `postgres`, `redis`는 `ports:` 절을 **쓰지 않는다** (외부 노출 금지). 접속은 compose 서비스 이름(`postgres:5432`, `redis:6379`)으로만.
- 도메인: `auth.bini59.dev` ← cloudflared tunnel. 쿠키 `Domain=.bini59.dev`.
- named volumes(`pgdata`, `redisdata`) + `pg_dump` 백업 cron.
- 로컬 개발도 같은 compose를 재사용하되, 프로바이더 dev 앱·호스트(`*.local.bini59.dev`)는 §12를 따른다.

### 쿠키

```
Set-Cookie: sid=<base64url(32 random bytes)>;
  Domain=.bini59.dev;
  Path=/;
  HttpOnly;
  Secure;
  SameSite=Lax;
  Max-Age=1209600

```

`Domain=.[bini59.dev](http://bini59.dev)` 하나가 전체 SSO를 성립시킴. `SameSite=Lax`여야 프로바이더에서 돌아오는 top-level 리다이렉트에 쿠키가 실림 (`Strict`면 깨짐).

---

## 3. 데이터 모델

### 3.1 auth DB

```sql
-- 등록된 앱(클라이언트)
CREATE TABLE clients (
  client_id         TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  logo_url          TEXT,
  theme_color       TEXT,
  allowed_origins   TEXT[] NOT NULL,      -- return_to 화이트리스트
  default_redirect  TEXT NOT NULL,
  auto_provision    BOOLEAN NOT NULL DEFAULT true,
  onboarding_path   TEXT,                 -- auto_provision=false일 때
  secret_hash       TEXT NOT NULL,        -- S2S 인증용 (앱 시크릿 해시)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 전역 사용자 (누구인가)
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT,                   -- nullable! 카카오는 없을 수 있음
  email_verified  BOOLEAN NOT NULL DEFAULT false,
  name            TEXT,
  avatar_url      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 값이 있을 때만 유니크 (NULL 중복 허용 + 대소문자 정규화)
CREATE UNIQUE INDEX users_email_uniq
  ON users (lower(email)) WHERE email IS NOT NULL;

-- 로그인 수단 (어떻게 로그인했나)
CREATE TABLE identities (
  provider          TEXT NOT NULL,        -- 'google' | 'kakao'
  provider_user_id  TEXT NOT NULL,        -- ID token의 sub
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_at_link     TEXT,                 -- 연결 시점 이메일 (감사용)
  linked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, provider_user_id)
);

CREATE INDEX ON identities (user_id);

-- 앱별 회원 자격 (어디 회원인가)
CREATE TABLE memberships (
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id     TEXT NOT NULL REFERENCES clients(client_id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member',
  status        TEXT NOT NULL DEFAULT 'active',   -- active | suspended
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  PRIMARY KEY (user_id, client_id)
);

CREATE INDEX ON memberships (client_id, joined_at DESC);

-- 탈퇴 큐 (앱들이 폴링해서 자기 데이터 정리)
CREATE TABLE deletion_queue (
  user_id       UUID PRIMARY KEY,
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

```

`identities`**를 분리한 이유**: 한 사람이 Google과 Kakao 둘 다로 로그인해도 같은 [`users.id`](http://users.id)를 유지할 수 있어야 함. [`users.google](http://users.google)_id`, `users.kakao_id` 컬럼 방식이면 프로바이더 추가마다 마이그레이션.

**조회 키는 반드시** `provider_user_id`**(=** `sub`**)**. 이메일로 조회하면 안 됨 — 이메일은 변경 가능, `sub`는 불변.

### 3.2 각 앱 DB

```sql
-- 예: app_a_db
CREATE TABLE profiles (
  user_id       UUID PRIMARY KEY,   -- auth의 users.id. FK 아님 (다른 DB)
  display_name  TEXT NOT NULL,
  -- 이하 앱 고유 필드
  preferences   JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

```

**절대 하지 말 것**: `email`, `name`, `avatar_url`을 앱 DB에 복사. 사용자가 프로필 사진을 바꿨을 때 앱마다 다른 걸 보여주게 됨. 표시용 정보는 `/verify` 응답에서 받아 요청 스코프로만 쓰고 버릴 것.

검색/정렬 때문에 캐시가 필요하면 이름으로 의도를 명시:

```sql
cached_display_name  TEXT,          -- auth에서 복제. 인덱스용, 표시용 아님
cached_at            TIMESTAMPTZ

```

`display_name`을 앱이 별도로 갖는 것은 복사가 아니라 별개 값이므로 문제없음 (카카오 로그인 시 이메일 없이 닉네임뿐이라, 앱마다 다른 표시명을 쓰고 싶을 수 있음).

### 3.3 DB 격리

Postgres 컨테이너 하나 + 데이터베이스/유저 분리:

```
bini59-pg
├── auth_db    (유저: auth_svc)
├── app_a_db   (유저: app_a_svc)
└── app_b_db   (유저: app_b_svc)

```

**DB 유저를 반드시 분리**. 스키마만 나누고 유저를 공유하면 `app_a` 커넥션 문자열 유출 시 `auth_db`까지 읽힘.

---

## 4. Redis 키 스키마

```
sess:{sid}            HASH    {userId, createdAt, lastSeenAt, ua, ip}   TTL 14d
user_sess:{userId}    SET     {sid, sid, ...}                          TTL 14d
oauth_state:{state}   STRING  JSON{provider,clientId,returnTo,verifier,nonce}  TTL 10m

```

`user_sess`가 필요한 이유: "전체 로그아웃"(계정 탈취 의심 시) 구현. 없으면 나중에 반드시 후회함. TTL을 같이 걸어 orphan set 방지.

---

## 5. 프로바이더 설정

```ts
export const PROVIDERS = {
  google: {
    discovery: 'https://accounts.google.com/.well-known/openid-configuration',
    jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    issuer: 'https://accounts.google.com',
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    scope: 'openid email profile',
  },
  kakao: {
    discovery: 'https://kauth.kakao.com/.well-known/openid-configuration',
    jwksUri: 'https://kauth.kakao.com/.well-known/jwks.json',
    authUrl: 'https://kauth.kakao.com/oauth/authorize',
    tokenUrl: 'https://kauth.kakao.com/oauth/token',
    issuer: 'https://kauth.kakao.com',
    clientId: process.env.KAKAO_REST_API_KEY!,    // REST API 키
    clientSecret: process.env.KAKAO_CLIENT_SECRET, // 콘솔에서 활성화한 경우만
    scope: 'openid',                               // account_email은 심사 후 추가
  },
} as const;

```

### 5.1 redirect URI (프로바이더 콘솔 등록)

```
https://auth.bini59.dev/callback/google
https://auth.bini59.dev/callback/kakao

```

**앱을 몇 개 만들어도 이 2개뿐.** 이게 중앙화의 실무적 최대 이득.

개발용은 별도 앱/프로젝트로 분리해서 등록:

```
https://auth.local.bini59.dev/callback/google
https://auth.local.bini59.dev/callback/kakao

```

### 5.2 Google 설정

- Google Cloud Console → OAuth 2.0 클라이언트 ID 생성
- 승인된 리디렉션 URI에 위 URL 등록
- `email_verified` 클레임을 신뢰 가능 (계정 연결 판단에 사용 가능)

### 5.3 Kakao 설정 — 주의사항 다수

1. **OpenID Connect를 콘솔에서 ON으로 켜야** ID token이 발급됨. OFF로 되돌리면 그 시점부터 ID token이 안 나와서 로그인이 아예 실패함
2. `client_secret`**은 옵션**. 콘솔에서 활성화했으면 토큰 요청에 반드시 포함, 안 했으면 포함하면 안 됨. 켰다/껐다 하면 조용히 깨짐
3. `account_email` **동의항목은 비즈앱 전환 + 개인정보 동의항목 심사 필요** (영업일 3~5일). 개인 개발자도 본인인증 + 비즈앱 전환으로 신청 가능하되 개인정보 처리방침 URL과 회원가입 페이지 제출 필요
4. **설정하지 않은 동의항목을 scope에 넣으면 인가 코드 요청 자체가 실패** (KOE205 계열). 심사 통과 전에는 `scope=openid`만
5. **심사를 통과해도 "선택 동의"면 사용자가 거부 가능** → 카카오 이메일은 **항상 없을 수 있는 값**으로 취급
6. `aud`는 REST API 키 값
7. `sub`는 카카오 회원번호(숫자 문자열)
8. ID token 만료가 access token과 동일해 짧음 — 로그인 순간에만 쓰고 버리므로 무관

> 문서에 "ID token을 서비스 로그인 세션 대신 쓸 수 있다"는 안내가 있으나 **따르지 말 것**. 무효화가 안 되고, 프로바이더 2개의 토큰 형식이 갈려서 관리 불가능해짐.

### 5.4 JWKS 캐싱 (필수)

카카오는 공개키를 일정 기간 캐싱하도록 권고하며, 과도한 요청 시 차단될 수 있음.

```ts
// 모듈 최상단 — 요청 핸들러 안에서 생성하면 차단당함
import { createRemoteJWKSet } from 'jose';

export const JWKS = {
  google: createRemoteJWKSet(new URL(PROVIDERS.google.jwksUri)),
  kakao:  createRemoteJWKSet(new URL(PROVIDERS.kakao.jwksUri)),
};

```

---

## 6. 엔드포인트 명세


| 메서드  | 경로                    | 호출자              | 인증             |
| ---- | --------------------- | ---------------- | -------------- |
| GET  | `/login`              | 브라우저 (앱에서 302)   | -              |
| GET  | `/login/:provider`    | 브라우저 (버튼 클릭)     | -              |
| GET  | `/callback/:provider` | 브라우저 (프로바이더 302) | state          |
| GET  | `/verify?client_id=`  | **앱 서버**         | 앱 시크릿 + 전달된 쿠키 |
| GET  | `/me`                 | 브라우저 (앱 프론트)     | 세션 쿠키          |
| POST | `/memberships`        | **앱 서버**         | 앱 시크릿          |
| POST | `/logout`             | 브라우저             | 세션 쿠키 + CSRF   |
| POST | `/logout/all`         | 브라우저             | 세션 쿠키 + CSRF   |
| GET  | `/deletions?since=`   | **앱 서버**         | 앱 시크릿          |


앱 서버 전용 4개는 쿠키가 아니라 **앱 시크릿 헤더**로 인증. 브라우저에서 직접 호출되면 안 됨. `/verify`는 예외적으로 쿠키도 함께 받지만, 앱 시크릿을 같이 요구해서 아무나 남의 세션을 조회하는 것을 차단.

---

## 7. 구현

### 7.1 return_to 검증 (오픈 리다이렉트 방어)

가장 흔한 실수. 반드시 `URL`로 파싱해서 `origin`을 정확히 비교.

```ts
export function validateReturnTo(returnTo: string | undefined, client: Client): string {
  if (!returnTo) return client.defaultRedirect;
  try {
    const url = new URL(returnTo);
    if (!client.allowedOrigins.includes(url.origin)) {
      return client.defaultRedirect;   // 조용히 기본값으로
    }
    return url.toString();
  } catch {
    return client.defaultRedirect;
  }
}

```

`startsWith('[https://a.bini59.dev](https://a.bini59.dev)')` 방식은 [`https://a.bini59.dev.evil.com`에](https://a.bini59.dev.evil.com에) 뚫림.

### 7.2 세션 서비스

```ts
import { randomBytes } from 'crypto';

const TTL = 60 * 60 * 24 * 14;   // 14일

@Injectable()
export class SessionService {
  constructor(private redis: Redis) {}

  async create(userId: string, meta: { ua: string; ip: string }): Promise<string> {
    const sid = randomBytes(32).toString('base64url');
    const key = `sess:${sid}`;

    await this.redis
      .multi()
      .hset(key, {
        userId,
        createdAt: Date.now(),
        lastSeenAt: Date.now(),
        ua: meta.ua,
        ip: meta.ip,
      })
      .expire(key, TTL)
      .sadd(`user_sess:${userId}`, sid)
      .expire(`user_sess:${userId}`, TTL)
      .exec();

    return sid;
  }

  async get(sid: string) {
    const h = await this.redis.hgetall(`sess:${sid}`);
    return h.userId ? h : null;
  }

  /** 슬라이딩 만료 */
  async touch(sid: string, userId: string) {
    await this.redis
      .multi()
      .hset(`sess:${sid}`, 'lastSeenAt', Date.now())
      .expire(`sess:${sid}`, TTL)
      .expire(`user_sess:${userId}`, TTL)
      .exec();
  }

  async revoke(sid: string) {
    const h = await this.redis.hgetall(`sess:${sid}`);
    const multi = this.redis.multi().del(`sess:${sid}`);
    if (h.userId) multi.srem(`user_sess:${h.userId}`, sid);
    await multi.exec();
  }

  async revokeAll(userId: string) {
    const sids = await this.redis.smembers(`user_sess:${userId}`);
    if (sids.length === 0) return;
    await this.redis.del(
      ...sids.map(s => `sess:${s}`),
      `user_sess:${userId}`,
    );
  }
}

```

### 7.3 GET /login — 테마별 로그인 페이지

```ts
@Get('login')
async loginPage(@Query() q, @Res() res) {
  const client = await this.clients.find(q.client_id);
  if (!client) throw new BadRequestException('unknown client');

  const returnTo = validateReturnTo(q.return_to, client);

  // 이미 로그인되어 있으면 바로 통과 (SSO)
  const sid = res.req.cookies?.sid;
  if (sid && await this.sessions.get(sid)) {
    return res.redirect(302, returnTo);
  }

  return res.render('login', {
    clientId: client.clientId,
    name: client.name,
    logoUrl: client.logoUrl,
    themeColor: client.themeColor,
    returnTo,
    error: q.error ?? null,
  });
}

```

세션이 이미 있으면 프로바이더 버튼을 보여주지 않고 즉시 통과시키는 게 SSO의 핵심 동작.

### 7.4 GET /login/:provider — 인가 요청 시작

```ts
import { randomBytes, createHash } from 'crypto';

@Get('login/:provider')
async start(@Param('provider') p: string, @Query() q, @Res() res) {
  const cfg = PROVIDERS[p];
  if (!cfg) throw new BadRequestException('unknown provider');

  const client = await this.clients.find(q.client_id);
  if (!client) throw new BadRequestException('unknown client');

  const state     = randomBytes(32).toString('base64url');
  const verifier  = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const nonce     = randomBytes(16).toString('base64url');

  await this.redis.set(
    `oauth_state:${state}`,
    JSON.stringify({
      provider: p,
      clientId: client.clientId,
      returnTo: validateReturnTo(q.return_to, client),
      verifier,
      nonce,
    }),
    'EX', 600,
  );

  const url = new URL(cfg.authUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', `${process.env.AUTH_ORIGIN}/callback/${p}`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', state);
  url.searchParams.set('nonce', nonce);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  return res.redirect(302, url.toString());
}

```

`state`는 CSRF 방어와 문맥 전달(clientId, returnTo)을 겸함. 쿠키나 URL에 담지 말고 Redis에 둘 것.

### 7.5 ID token 검증

```ts
import { jwtVerify, JWTPayload } from 'jose';

async function verifyIdToken(
  provider: keyof typeof PROVIDERS,
  idToken: string,
  nonce: string,
): Promise<JWTPayload> {
  const cfg = PROVIDERS[provider];
  const { payload } = await jwtVerify(idToken, JWKS[provider], {
    issuer: cfg.issuer,
    audience: cfg.clientId,      // 프로바이더마다 다른 값
  });
  if (payload.nonce !== nonce) {
    throw new UnauthorizedException('nonce mismatch');
  }
  return payload;
}

```

`audience`가 프로바이더별로 다름(Google은 OAuth client ID, Kakao는 REST API 키)이므로 설정 맵에서 꺼내오는 것이 중요.

### 7.6 클레임 정규화

프로바이더 차이를 여기서 전부 흡수하고, 위 레이어로는 통일된 모양만 전달.

```ts
export type NormalizedIdentity = {
  provider: 'google' | 'kakao';
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
};

export function normalize(provider: string, c: JWTPayload): NormalizedIdentity {
  if (provider === 'google') {
    return {
      provider: 'google',
      providerUserId: c.sub!,
      email: (c.email as string) ?? null,
      emailVerified: c.email_verified === true,
      name: (c.name as string) ?? null,
      avatarUrl: (c.picture as string) ?? null,
    };
  }

  // kakao: email은 동의 안 하면 아예 없음. 신뢰 근거로 쓰지 않음
  return {
    provider: 'kakao',
    providerUserId: c.sub!,
    email: (c.email as string) ?? null,
    emailVerified: false,
    name: (c.nickname as string) ?? null,
    avatarUrl: (c.picture as string) ?? null,
  };
}

```

> 카카오 프로필 클레임 이름(`nickname`, `picture`)은 콘솔 동의항목 설정에 따라 달라질 수 있음. 카카오의 "ID 토큰 정보 보기" API로 실제 페이로드를 한 번 찍어보고 확정할 것.

`emailVerified: false` 하드코딩은 "카카오 이메일을 신뢰의 근거로 쓰지 않는다"는 설계 결정을 코드에 박아두는 것.

### 7.7 upsert (트랜잭션 + 락)

```ts
async upsertFromProvider(id: NormalizedIdentity): Promise<string> {
  return this.db.transaction(async tx => {
    const existing = await tx.query(
      `SELECT user_id FROM identities
        WHERE provider = $1 AND provider_user_id = $2
        FOR UPDATE`,
      [id.provider, id.providerUserId],
    );

    if (existing.rows[0]) {
      const userId = existing.rows[0].user_id;
      await tx.query(
        `UPDATE users SET
           name       = COALESCE($2, name),
           avatar_url = COALESCE($3, avatar_url),
           email      = CASE WHEN $4 THEN COALESCE($5, email) ELSE email END,
           email_verified = email_verified OR $4
         WHERE id = $1`,
        [userId, id.name, id.avatarUrl, id.emailVerified, id.email],
      );
      return userId;
    }

    // 신규. 이메일이 이미 쓰이고 있으면 자동 병합하지 않고 NULL로 생성
    const emailTaken = id.email
      ? (await tx.query(
          `SELECT 1 FROM users WHERE lower(email) = lower($1)`,
          [id.email],
        )).rowCount > 0
      : false;

    const inserted = await tx.query(
      `INSERT INTO users (email, email_verified, name, avatar_url)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        emailTaken ? null : id.email,
        !emailTaken && id.emailVerified,
        id.name,
        id.avatarUrl,
      ],
    );
    const userId = inserted.rows[0].id;

    await tx.query(
      `INSERT INTO identities (provider, provider_user_id, user_id, email_at_link)
       VALUES ($1, $2, $3, $4)`,
      [id.provider, id.providerUserId, userId, id.email],
    );

    return userId;
  });
}

```

`FOR UPDATE`**가 필요한 이유**: 사용자가 로그인 버튼을 빠르게 두 번 누르면 콜백이 동시에 들어와 유저가 2개 생길 수 있음. `identities` PK 유니크 제약으로 하나는 실패하지만, 그 전에 `users` INSERT가 커밋되면 orphan 유저가 남음. 유니크 위반을 잡아서 재조회하는 fallback을 추가하면 완전해짐.

### 7.8 GET /callback/:provider

```ts
@Get('callback/:provider')
async callback(@Param('provider') p: string, @Query() q, @Req() req, @Res() res) {
  // 원자적으로 꺼내면서 삭제 — 리플레이 차단
  const raw = await this.redis.getdel(`oauth_state:${q.state}`);
  if (!raw) throw new BadRequestException('invalid or expired state');

  const ctx = JSON.parse(raw);
  if (ctx.provider !== p) throw new BadRequestException('provider mismatch');

  if (q.error) {
    const u = new URL(ctx.returnTo);
    u.searchParams.set('auth_error', 'denied');
    return res.redirect(302, u.toString());
  }

  const tokens = await exchangeCode(p, q.code, ctx.verifier);
  const claims = await verifyIdToken(p, tokens.id_token, ctx.nonce);
  const norm   = normalize(p, claims);

  const userId = await this.users.upsertFromProvider(norm);

  // 프로바이더 토큰은 저장하지 않음 (Drive/Calendar API를 쓸 게 아니라면 부채)

  const client = await this.clients.find(ctx.clientId);
  if (client.autoProvision) {
    await this.memberships.ensure(userId, client.clientId);
  }

  const sid = await this.sessions.create(userId, {
    ua: req.headers['user-agent'] ?? '',
    ip: req.ip,
  });

  res.cookie('sid', sid, {
    domain: '.bini59.dev',
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });

  return res.redirect(302, ctx.returnTo);
}

```

`GETDEL`이 핵심 — state를 한 번만 소비해서 리플레이를 막음.

### 7.9 GET /verify

```ts
@Get('verify')
@UseGuards(AppSecretGuard)
async verify(@Req() req, @Query('client_id') clientId: string) {
  const sid = req.cookies?.sid;
  if (!sid) throw new UnauthorizedException();

  const sess = await this.sessions.get(sid);
  if (!sess) throw new UnauthorizedException();

  const user = await this.users.findById(sess.userId);
  if (!user) throw new UnauthorizedException();

  let membership = await this.memberships.find(sess.userId, clientId);

  if (!membership) {
    const client = await this.clients.find(clientId);
    if (client?.autoProvision) {
      membership = await this.memberships.ensure(sess.userId, clientId);
    }
  }

  await this.sessions.touch(sid, sess.userId);

  return {
    userId: user.id,
    email: user.email,          // null 가능 (카카오)
    name: user.name,
    avatarUrl: user.avatarUrl,
    membership: membership
      ? { role: membership.role, status: membership.status, joinedAt: membership.joinedAt }
      : null,
  };
}

```

`membership: null`과 `401`을 반드시 구분할 것. 전자는 "로그인은 했으나 이 서비스 회원 아님", 후자는 "로그인 안 됨".

### 7.10 POST /memberships (온보딩 완료 시 앱 서버가 호출)

```ts
@Post('memberships')
@UseGuards(AppSecretGuard)
async createMembership(@Body() dto: { clientId: string; userId: string }) {
  // 멱등하게
  await this.db.query(
    `INSERT INTO memberships (user_id, client_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [dto.userId, dto.clientId],
  );
  return { ok: true };
}

```

**브라우저가 아니라 앱 서버가 호출**해야 함. 사용자가 이 엔드포인트를 직접 때려서 온보딩을 건너뛰면 안 됨.

### 7.11 로그아웃

```ts
@Post('logout')
@UseGuards(CsrfGuard)
async logout(@Req() req, @Res() res, @Query('return_to') returnTo, @Query('client_id') clientId) {
  const sid = req.cookies?.sid;
  if (sid) await this.sessions.revoke(sid);

  res.clearCookie('sid', { domain: '.bini59.dev', path: '/' });

  const client = await this.clients.find(clientId);
  return res.redirect(302, validateReturnTo(returnTo, client));
}

@Post('logout/all')
@UseGuards(CsrfGuard)
async logoutAll(@Req() req, @Res() res) {
  const sid = req.cookies?.sid;
  const sess = sid ? await this.sessions.get(sid) : null;
  if (sess) await this.sessions.revokeAll(sess.userId);

  res.clearCookie('sid', { domain: '.bini59.dev', path: '/' });
  return res.redirect(302, `${process.env.AUTH_ORIGIN}/login`);
}

```

Redis 키 하나 지우면 전 서비스에서 즉시 끊김. 이게 opaque session ID를 선택한 보상.

`/logout`에 CSRF 토큰이 필요한 이유: 없으면 제3자가 사용자를 강제 로그아웃시킬 수 있음. 심각하진 않지만 재현 어려운 짜증나는 버그가 됨.

---

## 8. 앱 측 미들웨어

### 8.1 판정 순서

```
1. sid 쿠키 존재?        ✗ → 302 auth/login (return_to 첨부)
2. /verify 200?          ✗ → 쿠키 삭제 후 302 auth/login
3. membership 존재?      ✗ → 302 온보딩  (auto_provision=false인 경우)
4. status === 'active'?  ✗ → 403 페이지 렌더 (리다이렉트 금지)
5. 통과                       → x-user-id 헤더 주입 후 핸들러

```

**4번에서 리다이렉트하면 안 됨**: `/login`으로 보내면 로그인은 성공하고 → 앱으로 돌아오고 → 또 정지 → 무한 루프. `suspended`는 터미널 상태이므로 그 자리에서 페이지를 렌더할 것.

### 8.2 Next.js 구현

```ts
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const AUTH = 'https://auth.bini59.dev';
const CLIENT_ID = process.env.CLIENT_ID!;
const APP_SECRET = process.env.APP_SECRET!;

export async function middleware(req: NextRequest) {
  const sid = req.cookies.get('sid')?.value;
  if (!sid) return toLogin(req);

  const r = await fetch(`${AUTH}/verify?client_id=${CLIENT_ID}`, {
    headers: {
      cookie: `sid=${sid}`,              // 반드시 직접 전달
      'x-app-secret': APP_SECRET,
    },
    cache: 'no-store',
  });

  if (r.status === 401) {
    const res = toLogin(req);
    res.cookies.delete({ name: 'sid', domain: '.bini59.dev', path: '/' });
    return res;
  }
  if (!r.ok) {
    return new NextResponse('auth unavailable', { status: 503 });
  }

  const v = await r.json();

  if (!v.membership) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }
  if (v.membership.status !== 'active') {
    return NextResponse.rewrite(new URL('/suspended', req.url));
  }

  const h = new Headers(req.headers);
  h.set('x-user-id', v.userId);
  h.set('x-user-role', v.membership.role);
  return NextResponse.next({ request: { headers: h } });
}

function toLogin(req: NextRequest) {
  const url = new URL(`${AUTH}/login`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('return_to', req.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|onboarding|suspended|api/public).*)'],
};

```

**가장 흔한 함정**: 앱 서버가 백엔드에서 `/verify`를 호출할 때 브라우저 쿠키가 자동으로 실리지 않음. 위처럼 `cookie` 헤더를 직접 넘겨야 함.

`/onboarding`**과** `/suspended`**를 matcher에서 제외**해야 함. 안 하면 미들웨어가 다시 걸려서 루프.

### 8.3 성능

`/verify`는 매 요청마다 네트워크 홉 1회 + DB 조회 2회(user, membership). 앱 서버 안에 5~10초 TTL 인메모리 캐시를 두면 실질 부담이 거의 사라짐. 대가는 그 TTL만큼의 무효화 지연.

```ts
const cache = new Map<string, { data: any; exp: number }>();

async function verifyCached(sid: string) {
  const hit = cache.get(sid);
  if (hit && hit.exp > Date.now()) return hit.data;
  const data = await verifyRemote(sid);
  cache.set(sid, { data, exp: Date.now() + 7000 });
  return data;
}

```

트래픽이 실제로 문제가 될 때 넣을 것. 처음부터 넣으면 로그아웃이 즉시 안 먹히는 걸로 보여서 디버깅이 헷갈림.

---

## 9. 플로우 시나리오

### 9.1 최초 로그인 (신규 유저)

```
1. GET a.bini59.dev/dash                   쿠키 없음
2. 302 → auth/login?client_id=alpha&return_to=...
3. auth: clients 조회 → 테마 적용된 프로바이더 버튼 렌더
4. "카카오로 시작" 클릭
5. GET auth/login/kakao?client_id=alpha&return_to=...
     Redis: oauth_state:{state} 저장 (TTL 10분)
6. 302 → kauth.kakao.com/oauth/authorize   (state, nonce, PKCE challenge)
7. 카카오 동의 화면 → 승인
8. 302 → auth/callback/kakao?code=...&state=...
9. auth:
     GETDEL oauth_state:{state}
     code + verifier → 토큰 교환
     id_token JWKS 검증 (iss, aud, exp, nonce)
     normalize() → identities 조회 → 없음
     트랜잭션: users INSERT + identities INSERT
     auto_provision → memberships INSERT
     Redis: sess:{sid} 생성, user_sess:{userId}에 추가
     Set-Cookie: sid=...; Domain=.bini59.dev
10. 302 → return_to
11. 미들웨어 4단계 통과 → 대시보드

```

### 9.2 재방문

```
1. GET a.bini59.dev/dash                   sid 쿠키 있음
2. 미들웨어 → auth/verify?client_id=alpha  (cookie 헤더 직접 전달)
3. Redis 조회 + touch + membership 조회
4. 200 {userId, email, name, membership:{role:'member', status:'active'}}
5. x-user-id 주입 → 핸들러

```

리다이렉트 0회, 프로바이더 호출 0회. **대부분의 요청이 이 경로.**

### 9.3 다른 앱 첫 진입 (SSO 발동)

```
1. GET b.bini59.dev            sid 쿠키가 이미 실려서 감 (.bini59.dev)
2. auth/verify?client_id=beta
3. 세션 유효, membership(userId, 'beta') 없음
4. auto_provision=true   → memberships INSERT → 200 통과
   auto_provision=false  → membership:null → 302 /onboarding

```

**소셜 로그인 화면이 안 뜨는 것이 정상.** 프로바이더로 다시 갈 이유가 없음. 이게 SSO가 실제로 작동하는 순간.

### 9.4 온보딩 (앱 고유 정보 수집)

```
1. b.bini59.dev/onboarding 렌더  (auth 정보를 /verify에서 받아 프리필)
2. 사용자가 앱 고유 필드 입력 (표시명, 앱별 설정 등)
3. POST b.bini59.dev/api/onboard
     (a) 앱 DB: profiles(user_id, display_name, ...) INSERT
     (b) auth 호출: POST auth/memberships {clientId, userId}   ← S2S
4. 302 → 원래 목적지

```

**순서가 중요**: `profiles`를 먼저, membership을 나중에. 반대면 "membership은 있는데 profile이 없음" 상태가 생겨 미들웨어는 통과시키는데 핸들러가 터짐. 이 순서면 최악의 경우가 "profile은 있고 membership 없음"이고, 온보딩을 한 번 더 하면 복구됨(멱등하게 짤 것).

### 9.5 로그아웃

```
1. POST a.bini59.dev/logout → 302 auth/logout?client_id=alpha&return_to=...
2. auth: sess:{sid} DEL, user_sess에서 SREM, clearCookie
3. 302 → return_to
4. b, c에서도 즉시 로그아웃 상태

```

---

## 10. 계정 2개 문제 (구글 + 카카오)

같은 사람이 구글로도, 카카오로도 로그인하면 `users` 행이 2개 생김. 이메일 기반 자동 병합을 하지 않기로 했으므로 이건 **의도된 동작**.

해법은 "로그인된 상태에서 프로바이더 연결하기":

```
1. 로그인 상태로 auth/link/kakao 진입
2. state에 {mode:'link', existingUserId} 저장
3. 프로바이더 왕복
4. callback에서 mode='link'면:
     - identities에 이미 다른 user_id로 연결되어 있으면 → 에러 (병합은 별도 작업)
     - 없으면 → identities INSERT (existingUserId로)

```

**주의**: 두 `users` 행이 이미 데이터를 갖고 있으면 병합은 앱 DB까지 건드려야 하는 별개의 큰 작업. 개인 프로젝트에서는 수동 SQL로 처리하는 게 현실적. 초기부터 연결 플로우를 제공해서 계정이 갈라지는 것 자체를 예방하는 편이 낫다.

프로바이더가 2개 이상 연결되어 있으면 **계정 복구 경로**도 생김 — 소셜 전용 설계에서 구글 계정을 잃으면 서비스 계정도 잃는 문제의 실질적 백업.

---

## 11. 보안 체크리스트

- [ ] `return_to`를 `URL` 파싱 + `origin` 정확 비교로 검증 (`startsWith` 금지)
- [ ] `state`를 `GETDEL`로 한 번만 소비 (리플레이 차단)
- [ ] PKCE (`S256`) 사용
- [ ] `nonce`를 ID token 클레임과 대조
- [ ] ID token의 `iss`, `aud`, `exp` 서명 검증 (JWKS)
- [ ] JWKS 인스턴스를 모듈 스코프에서 1회만 생성 (캐싱)
- [ ] 쿠키에 `HttpOnly`, `Secure`, `SameSite=Lax`
- [ ] 세션 ID는 `randomBytes(32)` (예측 불가)
- [ ] 프로바이더 access/refresh token은 저장하지 않음
- [ ] 앱 서버 전용 엔드포인트에 앱 시크릿 인증
- [ ] `/logout`, `/logout/all`에 CSRF 토큰
- [ ] `/callback`에 IP 기준 rate limiting
- [ ] CORS는 명시적 허용 목록 (`*` + `credentials` 조합은 브라우저가 거부)
- [ ] 이메일 기반 자동 계정 병합 없음
- [ ] 비밀번호 변경 상당 이벤트에서 `revokeAll` 호출
- [ ] DB 유저를 앱별로 분리

---

## 12. 개발 환경

### 12.1 hosts

`localhost:3000`, `localhost:3001`로 개발하면 `Domain=.[bini59.dev](http://bini59.dev)` 쿠키가 안 붙어서 SSO 테스트가 아예 불가능. 처음부터 이렇게 설정:

```
# /etc/hosts
127.0.0.1  auth.local.bini59.dev
127.0.0.1  a.local.bini59.dev
127.0.0.1  b.local.bini59.dev

```

쿠키 도메인은 환경변수로:

```
COOKIE_DOMAIN=.local.bini59.dev     # dev
COOKIE_DOMAIN=.bini59.dev           # prod

```

### 12.2 HTTPS

`Secure` 쿠키는 HTTPS 필수. Google은 `http` redirect URI를 `localhost`에만 허용하므로 커스텀 호스트명을 쓰려면 로컬 인증서가 필요.

```bash
mkcert -install
mkcert "*.local.bini59.dev" local.bini59.dev

```

**나중에 하려고 미루면 프로덕션에서만 터지는 버그를 만나게 됨.** 첫날에 세팅할 것.

### 12.3 프로바이더 dev 앱

Google, Kakao 각각 개발용 앱을 별도로 만들어 [`https://auth.local.bini59.dev/callback/*`을](https://auth.local.bini59.dev/callback/*을) 등록. 프로덕션 앱과 섞으면 redirect URI 목록이 지저분해지고 실수하기 쉬움.

---

## 13. 구현 순서

카카오 심사 대기 시간(3~5영업일)이 있으므로 순서가 중요하다.

**Day 0 — 즉시 던져놓을 것**

1. 카카오 비즈앱 전환 신청 (본인인증 필요)
2. 개인정보 처리방침 페이지 작성 (심사 제출용, 어차피 필요)
3. `account_email` 개인정보 동의항목 심사 신청

**Week 1 — 심사 대기 중 개발**

4. hosts + mkcert 로컬 HTTPS 세팅
5. auth DB 스키마 마이그레이션 (§3.1)
6. Redis 연결 + `SessionService` (§7.2)
7. `clients` 테이블에 첫 앱 등록 + `validateReturnTo` (§7.1)
8. Google OIDC 왕복 구현 — `/login/:provider`, `/callback/:provider` (§7.4, 7.8)
9. `normalize` + `upsertFromProvider` (§7.6, 7.7)
10. `/verify` + 앱 미들웨어 (§7.9, §8.2) — 여기까지 되면 SSO가 동작함
11. Kakao 추가 — `scope=openid`**만으로** (이메일 없이 동작하는 것이 정상 경로)
12. `/logout`, `/logout/all`

**Week 2**

13. `memberships` + `auto_provision` + 온보딩 플로우 (§7.10, §9.4)
14. `/me` (앱 프론트용)
15. CSRF, rate limiting
16. 두 번째 앱 붙여서 SSO 실제 검증 (§9.3)

**심사 통과 후**

17. Kakao `scope`에 `account_email` 추가 — 코드는 이미 nullable 처리되어 있으므로 설정만 변경

**나중에 (필요할 때)**

18. 프로바이더 연결 플로우 (§10)
19. `deletion_queue` 폴링 소비자
20. `/verify` 인메모리 캐시 (§8.3)

11번 순서가 특히 중요하다. 이메일을 전제로 짜놓고 심사가 반려되면 설계를 다시 뒤집어야 한다.

---

## 14. 함정 목록 (실제로 걸리는 것들)


| 함정                                             | 증상                     | 해결                    |
| ---------------------------------------------- | ---------------------- | --------------------- |
| 앱 서버가 `/verify` 호출 시 쿠키 미전달                    | 항상 401                 | `cookie` 헤더 직접 설정     |
| `SameSite=Strict`                              | 프로바이더에서 돌아오면 로그아웃      | `Lax` 사용              |
| `localhost`로 개발                                | SSO가 아예 안 됨            | hosts + 서브도메인         |
| 카카오 OIDC 미활성화                                  | `id_token`이 없음         | 콘솔에서 ON               |
| 카카오 미설정 scope 요청                               | 인가 코드 요청부터 실패 (KOE205) | 심사 전엔 `openid`만       |
| 카카오 `client_secret` 불일치                        | 토큰 교환 400              | 콘솔 활성화 여부와 일치시킬 것     |
| JWKS를 요청마다 생성                                  | 간헐적 차단                 | 모듈 스코프 1회 생성          |
| `/onboarding`이 matcher에 포함                     | 리다이렉트 루프               | matcher에서 제외          |
| `suspended`에서 `/login`으로 리다이렉트                 | 무한 루프                  | 그 자리에서 403 렌더         |
| 로그인 버튼 연속 클릭                                   | 유저 중복 생성               | 트랜잭션 + `FOR UPDATE`   |
| [`users.email](http://users.email) NOT NULL`   | 카카오 로그인 전부 실패          | nullable + 부분 유니크 인덱스 |
| 앱 DB에 email/name 복사                            | 앱마다 다른 프로필 표시          | `/verify` 응답만 사용      |
| `Access-Control-Allow-Origin: *` + credentials | 브라우저가 거부               | 명시적 허용 목록             |


---

## 부록 — 환경변수

```bash
# auth 서버
AUTH_ORIGIN=https://auth.bini59.dev
COOKIE_DOMAIN=.bini59.dev
SESSION_TTL_DAYS=14

DATABASE_URL=postgres://auth_svc:...@bini59-pg/auth_db
REDIS_URL=rediss://...

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

KAKAO_REST_API_KEY=
KAKAO_CLIENT_SECRET=        # 콘솔에서 활성화한 경우만

# 각 앱
CLIENT_ID=alpha
APP_SECRET=                 # auth의 clients.secret_hash와 대응
AUTH_ORIGIN=https://auth.bini59.dev
DATABASE_URL=postgres://app_a_svc:...@bini59-pg/app_a_db

```

`APP_SECRET`은 프로젝트가 늘어날수록 관리가 번거로워지므로 AWS Secrets Manager로 옮기는 것을 고려. (기존에 검토했던 방향과 동일)
