# 서비스 연동 가이드

이 문서는 `auth.bini59.dev`를 다른 웹 서비스의 중앙 로그인(SSO)으로 사용하는 방법을 설명한다.

## 1. 연동 방식

현재 `321_auth`는 표준 OIDC Provider가 아니라, 중앙 opaque session을 공유하는 서비스 연동 방식이다.

- 사용자는 `auth.bini59.dev`에서 Google 또는 Kakao로 로그인한다.
- auth 서버는 `sid` HttpOnly 세션 쿠키를 발급한다.
- 서비스 서버는 브라우저가 가진 `sid`를 auth 서버의 `/verify`에 전달한다.
- `/verify`는 사용자 정보와 해당 서비스의 membership을 반환한다.
- 서비스는 비밀번호, Google/Kakao 토큰, auth DB를 직접 관리하지 않는다.

현재 쿠키 도메인은 `.bini59.dev`이므로 이 방식은 `*.bini59.dev` 서비스에 가장 적합하다. 다른 최상위 도메인의 서비스는 아래의 “다른 도메인 서비스” 절을 먼저 확인한다.

## 2. 서비스 등록

서비스마다 독립적인 `client_id`와 `APP_SECRET`을 사용한다. `APP_SECRET`은 서비스 서버에만 저장하며 브라우저 코드에 넣지 않는다.

운영 auth DB에 다음 명령으로 등록한다.

```bash
DATABASE_URL="$AUTH_DATABASE_URL" pnpm --filter @321-auth/api seed -- \
  profile "Profile" "$PROFILE_APP_SECRET" \
  "https://profile.bini59.dev" \
  "https://profile.bini59.dev/" \
  true
```

인자는 다음 순서다.

```text
<clientId> <name> <secret> <allowedOrigins(csv)> <defaultRedirect> [autoProvision]
```

- `clientId`: 서비스 식별자. 예: `profile`, `archive`
- `allowedOrigins`: `return_to`에 사용할 수 있는 origin의 허용 목록
- `defaultRedirect`: `return_to`가 없거나 허용되지 않을 때 이동할 기본 주소
- `autoProvision=true`: 최초 접근 시 membership을 자동 생성
- `autoProvision=false`: 서비스가 별도 온보딩 후 membership을 생성

`allowedOrigins`에는 임의의 경로가 아니라 origin만 넣는다. 운영과 로컬 환경은 서로 다른 client를 등록하는 것을 권장한다.

## 3. 서비스 환경변수

```bash
AUTH_ORIGIN=https://auth.bini59.dev
CLIENT_ID=profile
APP_SECRET=<서비스 전용 secret>
```

`APP_SECRET`은 다음 요청의 `x-app-secret` 헤더로만 사용한다.

## 4. 로그인 흐름

인증이 필요한 요청에서 서비스는 세션 쿠키가 없을 때 auth 서버로 redirect한다.

```text
GET https://auth.bini59.dev/login
    ?client_id=profile
    &return_to=https%3A%2F%2Fprofile.bini59.dev%2Fdashboard
```

auth 서버는 다음을 처리한다.

1. `client_id`를 확인하고 `return_to`를 허용 목록과 비교한다.
2. 이미 유효한 `sid`가 있으면 OAuth 화면 없이 즉시 `return_to`로 보낸다.
3. 세션이 없으면 Google/Kakao 로그인 화면을 표시한다.
4. OAuth callback에서 state, PKCE verifier, nonce, ID token을 검증한다.
5. 사용자를 생성 또는 조회하고 `sid`를 발급한 뒤 `return_to`로 redirect한다.

같은 `.bini59.dev` 아래의 다른 서비스로 이동하면 기존 `sid`가 자동으로 전송된다. 따라서 두 번째 서비스에서는 소셜 로그인 화면이 다시 나타나지 않는 것이 정상이다.

## 5. 서버 측 세션 검증

서비스 서버는 브라우저의 `sid` 값을 auth 서버에 직접 전달해야 한다. 서버 간 `fetch`는 브라우저 쿠키를 자동 전달하지 않는다.

```ts
const sid = request.cookies.get('sid')?.value;

const response = await fetch(
  `${process.env.AUTH_ORIGIN}/verify?client_id=${encodeURIComponent(process.env.CLIENT_ID!)}`,
  {
    headers: {
      cookie: `sid=${sid}`,
      'x-app-secret': process.env.APP_SECRET!,
    },
    cache: 'no-store',
  },
);

if (response.status === 401) {
  // sid가 없거나 만료됨: 쿠키를 삭제하고 로그인으로 redirect
}

if (!response.ok) {
  // auth 서버 장애: 로그인 실패로 처리하지 말고 503 등 서비스 장애로 처리
}

const identity = await response.json() as {
  userId: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  membership: {
    role: string;
    status: 'active' | 'suspended' | string;
  } | null;
};
```

검증 결과 처리 순서는 다음을 권장한다.

1. `401`: 세션 쿠키 삭제 후 `/login`으로 redirect
2. `membership === null`: 온보딩 화면으로 이동
3. `membership.status !== 'active'`: `/suspended`를 렌더링하고 로그인으로 redirect하지 않음
4. 그 외: `userId`와 membership role을 요청 처리에 사용

`/verify`는 membership이 없을 때 client 설정이 `auto_provision=true`면 자동으로 membership을 생성한다.

## 6. Next.js middleware 예제

```ts
import { NextRequest, NextResponse } from 'next/server';

const AUTH = process.env.AUTH_ORIGIN!;
const CLIENT_ID = process.env.CLIENT_ID!;
const APP_SECRET = process.env.APP_SECRET!;

export async function middleware(request: NextRequest) {
  const sid = request.cookies.get('sid')?.value;
  if (!sid) return redirectToLogin(request);

  const verify = await fetch(
    `${AUTH}/verify?client_id=${encodeURIComponent(CLIENT_ID)}`,
    {
      headers: { cookie: `sid=${sid}`, 'x-app-secret': APP_SECRET },
      cache: 'no-store',
    },
  );

  if (verify.status === 401) {
    const response = redirectToLogin(request);
    response.cookies.delete({ name: 'sid', domain: '.bini59.dev', path: '/' });
    return response;
  }
  if (!verify.ok) return new NextResponse('auth unavailable', { status: 503 });

  const identity = await verify.json();
  if (!identity.membership) {
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }
  if (identity.membership.status !== 'active') {
    return NextResponse.rewrite(new URL('/suspended', request.url));
  }

  const headers = new Headers(request.headers);
  headers.set('x-user-id', identity.userId);
  headers.set('x-user-role', identity.membership.role);
  return NextResponse.next({ request: { headers } });
}

function redirectToLogin(request: NextRequest) {
  const url = new URL(`${AUTH}/login`);
  url.searchParams.set('client_id', CLIENT_ID);
  url.searchParams.set('return_to', request.url);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next|favicon.ico|onboarding|suspended|api/public).*)'],
};
```

온보딩과 정지 안내 경로를 middleware 대상에서 제외하지 않으면 redirect/rewrite loop가 발생한다.

## 7. 온보딩과 membership

서비스 고유 프로필이 필요한 경우 다음 순서를 지킨다.

1. 서비스 DB에 프로필을 저장한다.
2. auth 서버에 `POST /memberships`를 호출한다.
3. 요청에는 `clientId`, `userId`, `x-app-secret`을 사용한다.

```http
POST /memberships?client_id=profile
x-app-secret: <서비스 전용 secret>
content-type: application/json

{"clientId":"profile","userId":"<auth user id>"}
```

`client_id` query parameter, `clientId` body field, and the client associated with `x-app-secret`은 모두 같은 서비스 ID여야 한다.

프로필 저장을 먼저 해야 membership만 있고 서비스 프로필이 없는 상태를 피할 수 있다. 온보딩 요청은 재시도할 수 있도록 멱등적으로 구현한다.

## 8. 로그아웃

현재 auth 서버의 로그아웃 endpoint는 `POST`이며 CSRF double-submit 검사가 필요하다. 서비스는 로그인된 브라우저에서 먼저 `/me`를 호출해 `csrf` 쿠키를 받은 뒤, 그 값을 `x-csrf-token` 헤더로 보내야 한다. 이 브라우저 호출을 사용하려면 auth 서버 CORS 허용 목록에 서비스 origin도 포함되어야 한다.

```ts
await fetch(`${AUTH}/me?client_id=${encodeURIComponent(CLIENT_ID)}`, {
  credentials: 'include',
});

const csrf = getCookie('csrf'); // HttpOnly가 아닌 csrf 쿠키
await fetch(
  `${AUTH}/logout?client_id=${encodeURIComponent(CLIENT_ID)}&return_to=${encodeURIComponent(location.origin)}`,
  {
    method: 'POST',
    credentials: 'include',
    headers: { 'x-csrf-token': csrf! },
  },
);
```

서비스 자체의 로그아웃 endpoint를 두는 경우에도 최종적으로 위 요청을 수행하거나, auth 서버의 CSRF 계약을 만족하는 별도 서버 측 연동을 구현한다.

```text
POST https://auth.bini59.dev/logout?client_id=profile&return_to=https%3A%2F%2Fprofile.bini59.dev%2F
x-csrf-token: <csrf cookie value>
```

auth 서버가 중앙 세션을 폐기하므로 `.bini59.dev` 아래의 모든 서비스에서 다음 요청부터 인증이 실패한다. 서비스는 자체적으로 보관한 `sid` 쿠키도 삭제한다.

## 9. 다른 최상위 도메인 서비스

현재 방식은 `.bini59.dev` 쿠키를 전제로 한다. 예를 들어 `example.com` 서비스는 브라우저가 `auth.bini59.dev`의 `sid`를 전달하지 않으므로 현재 `/verify` 방식만으로는 완전한 SSO가 되지 않는다.

그런 서비스까지 지원하려면 다음 중 하나를 별도 설계해야 한다.

- 표준 OIDC Provider endpoints와 authorization-code callback 추가
- auth 서버의 일회성 authorization code를 서비스 callback으로 전달한 뒤 서버 간 교환
- 서비스별 signed assertion/token 교환 API 추가

현재 연동 범위에서는 auth와 서비스가 같은 `.bini59.dev` 부모 도메인인지 먼저 확인한다. `sid` 값을 URL query나 로그에 직접 노출하는 방식은 사용하지 않는다.

## 10. 보안 규칙

- `APP_SECRET`은 서비스 서버 환경변수 또는 secret manager에만 저장한다.
- 브라우저 JavaScript, public 환경변수, HTML, 로그에 `APP_SECRET`을 넣지 않는다.
- 서비스마다 서로 다른 `APP_SECRET`을 발급한다.
- `return_to`는 auth DB의 `allowed_origins`에 등록된 origin만 사용한다.
- `/verify` 요청의 `sid`는 `cookie` 헤더로만 전달하고 query string에 넣지 않는다.
- auth 서버가 `5xx`이면 사용자를 로그아웃시키지 말고 일시적인 auth 장애로 처리한다.
- `/verify` 결과를 장기간 캐시하지 않는다. 짧은 캐시는 가능하지만 로그아웃·정지 상태 반영이 늦어질 수 있다.
- auth 서버의 내부 DB와 Redis에 직접 접근하지 않는다.

## 11. 연동 완료 체크리스트

- [ ] 운영/로컬 client를 각각 등록했다.
- [ ] `allowed_origins`와 `default_redirect`가 정확하다.
- [ ] 서비스 서버에 `AUTH_ORIGIN`, `CLIENT_ID`, `APP_SECRET`을 주입했다.
- [ ] 로그인 redirect와 `return_to` 검증을 확인했다.
- [ ] `/verify`에 브라우저 `sid`를 직접 전달한다.
- [ ] 401, 503, membership 없음, suspended를 각각 처리한다.
- [ ] 온보딩에서 프로필 저장 후 membership을 생성한다.
- [ ] 로그아웃 후 다른 서비스에서도 세션이 끊기는지 확인했다.
- [ ] secret이 번들·응답·로그에 노출되지 않는지 확인했다.
- [ ] auth 서버 장애 시 서비스가 안전하게 실패하는지 확인했다.
