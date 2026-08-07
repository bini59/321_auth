# 인증 통합 E2E 및 운영 smoke

## 로컬/CI E2E

`pnpm e2e`는 실제 Nest HTTP 라우팅을 띄우고 Playwright 브라우저가 로컬 mock Provider를 왕복한다. Google/Kakao 모두 외부 네트워크와 Provider secret 없이 실행되며, 테스트 로그에는 secret·토큰을 출력하지 않는다.

검증 범위:

- OAuth state 1회 소비, provider mismatch, 잘못된 callback
- Google/Kakao 브라우저 왕복, 세션 쿠키, `/me`, 앱 시크릿 기반 `/verify`
- 두 Client 간 SSO, `auto_provision=false`의 onboarding 상태
- active/suspended membership, CSRF가 필요한 logout/logout-all/account delete

실행:

```bash
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium # 최초 1회
pnpm e2e
```

## 운영 smoke (실계정/Provider secret 필요)

운영에서는 테스트 계정과 별도 Client를 사용하고, 아래 결과와 시각만 기록한다. secret, authorization code, ID token, session cookie 값은 기록하지 않는다.

1. `GET $AUTH_ORIGIN/healthz` → HTTP 200, `{ "ok": true }`
2. `GET $AUTH_ORIGIN/login?client_id=<test-client>` → HTTP 200 및 Provider 버튼 확인
3. Google/Kakao 중 승인된 Provider 1회 로그인 → 등록된 test return URL로 302
4. 앱 서버가 전달받은 cookie로 `GET /verify?client_id=<test-client>` + `x-app-secret` → HTTP 200, membership active
5. `/me`에서 사용자 표시 정보 확인 후 CSRF double-submit으로 `/logout` → 302 및 세션 무효화
6. 실패 시각, endpoint, HTTP status, request-id/서버 오류 요약만 남기고 원문 secret은 남기지 않는다.
