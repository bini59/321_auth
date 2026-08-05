# Admin 인증 경계

Admin은 기존 NestJS auth 서버가 `https://auth.bini59.dev/admin` 및 `/admin/<SPA route>` 아래에서 제공하는 정적 SPA 골격과 인증 API 호출 경계만 제공합니다. Cloudflare Tunnel은 기존처럼 `auth-app:3000`으로 라우팅합니다.

## 현재 경계

- Admin 브라우저 코드는 같은 origin의 상대 경로(`/healthz`, `/me`)로 auth API를 호출한다.
- 관리자 API는 `/admin/auth/csrf`, `/admin/auth/login`, `/admin/auth/session`, `/admin/auth/logout`으로 분리되어 있다.
- 로그인 성공 시 서버가 Redis의 `admin_sess:<opaque-id>`에 세션을 저장하고, `admin_sid` HttpOnly·Secure·SameSite=Lax 쿠키를 `/admin` 경로에만 발급한다.
- 로그인과 로그아웃은 `/admin` 경로의 `admin_csrf` double-submit 쿠키와 `x-csrf-token` 헤더가 일치해야 한다. 일반 OAuth의 `csrf` 쿠키와 분리한다.
- 로그인은 분당 5회로 제한되며, 비밀번호 오류·누락·미설정은 동일한 비민감 오류로 응답한다.
- 브라우저 번들에는 `ADMIN_API_KEY`, 앱 시크릿, `x-app-secret` 값을 넣지 않는다.
- 관리자 비밀번호는 `ADMIN_PASSWORD_HASH`에 scrypt-v1 인코딩으로만 설정한다. 평문 비밀번호, 관리자 해시, 앱 시크릿은 브라우저 번들에 넣지 않는다.

## 다음 단계의 보안 요구사항

일반 앱의 `x-app-secret`은 서버 간 인증용이므로 Admin SPA에 재사용하지 않는다. 관리자 세션은 기본 8시간 후 Redis TTL로 만료되고 로그아웃 시 즉시 폐기된다. `ADMIN_PASSWORD_HASH`가 없으면 로그인은 실패하며 관리자 세션을 발급하지 않는다.

해시는 `.env.example`의 명령으로 로컬에서 생성하고 운영 비밀 저장소에만 주입한다. 배포 시 기존 Postgres·Redis·Tunnel·migration·healthcheck 토폴로지는 변경하지 않는다.

## 운영 검증과 롤백

- `ADMIN_PASSWORD_HASH`가 비어 있거나 형식이 잘못되면 로그인은 동일한 401 오류로 실패하고 Redis 관리자 세션은 발급되지 않는다. 이 상태는 관리자 잠금 상태이지 평문 비밀번호 fallback이 아니다.
- 배포 전 CI는 API/Admin 테스트·타입체크·빌드를 실행하고 Admin 산출물에서 관리자 비밀 마커를 검사한다. 배포 job은 기존 순서대로 이미지 pull, migration, `auth-app` 재기동, `/healthz` 확인을 수행한다.
- 새 이미지가 부팅되지 않거나 healthcheck가 실패하면 compose의 `up --wait` 단계가 실패해 이전 앱을 유지하는 배포 규칙을 따른다. 운영 롤백은 이전 `sha-<commit>` 이미지로 `APP_IMAGE`를 지정해 같은 migration·healthcheck 절차를 다시 실행한다.
