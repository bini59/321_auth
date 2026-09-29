# Admin 인증 경계

Admin은 기존 NestJS auth 서버가 `https://auth.bini59.dev/admin` 및 `/admin/<SPA route>` 아래에서 제공하는 정적 SPA 골격과 인증 API 호출 경계만 제공합니다. Cloudflare Tunnel은 기존처럼 `auth-app:3000`으로 라우팅합니다.

## 현재 경계

- Admin 브라우저 코드는 같은 origin의 상대 경로(`/healthz`, `/me`)로 auth API를 호출한다.
- 관리자 API는 `/admin/auth/csrf`, `/admin/auth/login/:provider`(OAuth), `/admin/auth/session`(세션 확인 + 사이드바 프로필용 관리자 정보. CSP `img-src` 가 static 출처만 허용하므로 그 밖의 `avatarUrl` 은 `null` 로 내려 이니셜로 대체한다), `/admin/auth/logout`으로 분리되어 있다. 로그인은 OAuth 한 가지이며 비밀번호 로그인은 없다.
- 운영 대시보드 API는 `/admin/api/overview`와 `/admin/api/deletion-queue`로 분리되며, 각 요청도 `admin_sid` 세션을 서버에서 재검증한다. 정적 SPA fallback은 이 API 경로를 가로채지 않는다.
- 로그인 성공 시 서버가 Redis의 `admin_sess:<opaque-id>`에 관리자 userId와 함께 세션을 저장하고, `admin_sid` HttpOnly·Secure·SameSite=Lax 쿠키를 `/admin` 경로에만 발급한다.
- 로그아웃과 관리자 변경 요청은 `/admin` 경로의 `admin_csrf` double-submit 쿠키와 `x-csrf-token` 헤더가 일치해야 한다. 일반 OAuth의 `csrf` 쿠키와 분리한다.
- 브라우저 번들에는 `ADMIN_API_KEY`, 앱 시크릿, `x-app-secret` 값을 넣지 않는다.

## 다음 단계의 보안 요구사항

일반 앱의 `x-app-secret`은 서버 간 인증용이므로 Admin SPA에 재사용하지 않는다. 관리자 세션은 기본 8시간 후 Redis TTL로 만료되고 로그아웃 시 즉시 폐기된다.

배포 시 기존 Postgres·Redis·Tunnel·migration·healthcheck 토폴로지는 변경하지 않는다.

## 운영 검증과 롤백

- 배포 전 CI는 API/Admin 테스트·타입체크·빌드를 실행하고 Admin 산출물에서 관리자 비밀 마커를 검사한다. 배포 job은 기존 순서대로 이미지 pull, migration, `auth-app` 재기동, `/healthz` 확인을 수행한다.
- 새 이미지가 부팅되지 않거나 healthcheck가 실패하면 compose의 `up --wait` 단계가 실패해 이전 앱을 유지하는 배포 규칙을 따른다. 운영 롤백은 이전 `sha-<commit>` 이미지로 `APP_IMAGE`를 지정해 같은 migration·healthcheck 절차를 다시 실행한다.
