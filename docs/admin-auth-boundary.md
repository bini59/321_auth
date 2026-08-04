# Admin 인증 경계

Admin은 기존 NestJS auth 서버가 `https://auth.bini59.dev/admin` 및 `/admin/<SPA route>` 아래에서 제공하는 정적 SPA 골격과 인증 API 호출 경계만 제공합니다. Cloudflare Tunnel은 기존처럼 `auth-app:3000`으로 라우팅합니다.

## 현재 경계

- Admin 브라우저 코드는 같은 origin의 상대 경로(`/healthz`, `/me`)로 auth API를 호출한다.
- 요청은 `credentials: include`를 사용해 향후 auth 서버가 발급하는 HttpOnly 관리자 세션을 사용할 수 있다.
- 브라우저 번들에는 `ADMIN_API_KEY`, 앱 시크릿, `x-app-secret` 값을 넣지 않는다.
- 현재 Admin 리소스 API 및 관리자 로그인은 구현하지 않는다. `/healthz` 호출은 연결 상태 표시용이다.

## 다음 단계의 보안 요구사항

관리자 API를 추가할 때는 auth 서버의 관리자 전용 세션 경계를 먼저 정해야 한다. 일반 앱의 `x-app-secret`은 서버 간 인증용이므로 Admin SPA에 재사용하지 않는다. 관리자 세션을 도입할 때 CORS 허용 origin, CSRF 방어, 쿠키 Domain/Path, 세션 만료·폐기 정책을 함께 정의해야 한다.
