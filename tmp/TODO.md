# Issue #19 — Admin 정적 파일을 NestJS에서 `/admin` 경로로 서빙

## Scope

- NestJS가 `apps/admin/dist`를 `/admin` 및 `/admin/`에서 직접 서빙한다.
- `/admin/<SPA route>`는 확장자 없는 경로만 Admin `index.html`로 fallback한다.
- 누락된 정적 asset 요청(확장자가 있는 경로)은 404를 반환한다.
- Admin Vite base는 `/admin/`이고, Admin API 호출은 same-origin 상대 경로를 사용한다.
- Docker build/runtime 이미지에 API 산출물과 Admin `dist`를 모두 포함한다.
- 기존 API routes, `/healthz`, Docker Compose의 Postgres/Redis 내부 네트워크, `api-net`, `auth-app:3000` 및 CI 배포 흐름을 유지한다.
- `AUTH_ORIGIN=https://auth.bini59.dev` 기준의 운영 경로를 문서화한다.
- 별도 Cloudflare Pages 프로젝트, `admin.bini59.dev`, 관리자 인증/API 구현은 범위에 포함하지 않는다.
- 기존 작업자 변경 `1Prefix_schema`는 읽거나 수정하거나 staging하지 않는다.

## Acceptance criteria

- `pnpm install --frozen-lockfile` succeeds.
- Root workspace validation passes: API test/build/typecheck and Admin build/typecheck.
- Docker image contains both `apps/api/dist` and `apps/admin/dist` (including the Admin HTML/assets).
- `GET /admin` and `GET /admin/` return Admin HTML.
- A valid Admin asset request succeeds; a missing asset request returns 404.
- An extensionless `/admin/<route>` refresh returns the Admin shell; an asset-looking route does not fallback.
- Existing `/login`, `/callback/*`, `/verify`, `/me`, and `/healthz` behavior does not regress.
- Compose networking, healthcheck, migration invocation, and Tunnel-facing `auth-app:3000` topology remain unchanged.
- The built Admin bundle contains no API secret or `x-app-secret` value.

## Investigation notes

- API entrypoint: `apps/api/src/main.ts`; current module: `apps/api/src/app.module.ts`.
- API currently has no static-file module. Add `@nestjs/serve-static` and configure the Admin root with a stable runtime path.
- Admin entrypoint/API client: `apps/admin/src/main.tsx`, `apps/admin/src/api.ts`; Vite config is `apps/admin/vite.config.ts`.
- Current Admin client already defaults to relative API URLs, but the explicit Vite base and any environment-origin behavior must be made consistent with same-origin production serving.
- Docker currently builds only `apps/api`; its dependency stage already copies both workspace manifests, so the build stage must additionally copy/build Admin and the runtime stage must copy `apps/admin/dist`.
- CI validation already runs install/test/build/typecheck; image build runs after validation. Add targeted image-content/route regression checks without changing deployment topology.
- Existing API routes are owned by `apps/api/src/auth/auth.controller.ts`; static route configuration must not capture those routes.

## Planned implementation

### 1. Static serving and route semantics

- Add the Nest static-serving dependency to the API workspace and lockfile.
- Configure `ServeStaticModule` (or the equivalent Nest static middleware configuration) with `/admin` as the public prefix and a runtime-safe Admin dist root.
- Ensure `/admin` and `/admin/` both resolve to the shell.
- Add a narrowly scoped fallback for `/admin/<path>` only when the path has no extension and is not a real file; leave extension-bearing misses as 404.
- Verify ordering/route exclusions so `/login`, `/callback/*`, `/verify`, `/me`, and `/healthz` continue to reach the API controllers.
- Prefer an implementation that can be exercised through an HTTP test against the Nest application rather than relying only on middleware internals.

### 2. Admin build configuration

- Set Vite `base: '/admin/'`.
- Keep production API calls same-origin and relative (`/healthz`, `/me`); remove or constrain any production use of an absolute API origin.
- Confirm generated HTML references `/admin/` asset URLs and the bundle has no secret headers/values.

### 3. Docker and workspace pipeline

- Extend the Docker build stage to copy the Admin source/config required for its build and run the Admin build after dependency installation.
- Copy `apps/admin/dist` into the runtime image at a deterministic path matching Nest configuration.
- Preserve API migration SQL copying and API runtime command.
- Add or update CI checks for workspace validation, Docker image file contents, and route behavior; do not alter existing Postgres/Redis, `api-net`, healthcheck, or deploy sequencing.

### 4. Documentation

- Document `https://auth.bini59.dev/admin` and `/admin/<SPA route>` as the production Admin entry points.
- Document same-origin API calls and the fact that Cloudflare Tunnel continues to route to `auth-app:3000`.
- Keep the deferred admin authentication/data-operation boundary explicit.

## Test strategy

1. Unit/integration route regression tests for the Nest app:
   - `/admin`, `/admin/`, extensionless SPA route, existing asset, missing asset, and missing extension-bearing asset.
   - `/login`, `/callback/*`, `/verify`, `/me`, `/healthz` route reachability/response behavior.
   - Use isolated fixtures or the built Admin dist; avoid requiring production Postgres/Redis for static route assertions where possible.
2. Admin build/type checks:
   - `pnpm --filter @321-auth/admin typecheck`
   - `pnpm --filter @321-auth/admin build`
   - Inspect output HTML/assets for `/admin/` prefixes and absence of secrets.
3. API/workspace checks:
   - `pnpm install --frozen-lockfile`
   - `pnpm --filter @321-auth/api test`
   - `pnpm --filter @321-auth/api build`
   - `pnpm typecheck` and `pnpm build`.
4. Docker checks:
   - Build the image with `docker build`.
   - Inspect the image filesystem for `apps/api/dist` and `apps/admin/dist`.
   - Start an isolated container/test harness as needed and exercise the Admin routes plus `/healthz`.
   - Confirm Compose configuration and healthcheck/network declarations remain unchanged except for the required image contents.
5. After code changes, run `graphify update .` and include its result in the handoff.

## Change map

Expected files (verify during implementation; do not edit unrelated files):

- `apps/api/package.json` — static-serving dependency.
- `pnpm-lock.yaml` — lockfile update.
- `apps/api/src/app.module.ts` and/or a focused static-serving module/helper — `/admin` root and fallback behavior.
- `apps/api/src/main.ts` only if bootstrap/testability requires a minimal refactor.
- `apps/admin/vite.config.ts` — `base: '/admin/'`.
- `apps/admin/src/api.ts` — enforce same-origin relative API paths and remove unsafe production-origin assumptions.
- `Dockerfile` — build and runtime Admin dist inclusion.
- `.github/workflows/deploy.yml` — targeted validation/image-content checks if needed.
- `apps/api/src/**/*.spec.ts` and/or dedicated route test fixtures — route regression coverage.
- `docs/admin-auth-boundary.md` and/or `CONTEXT.md` — production path/Tunnel documentation.

Do not modify `1Prefix_schema` or unrelated schema work.

## Track / execution metadata

```yaml
issue: 19
track: heavy
exec: worktree
workflow: dev-flow
phase: plan
planner: planner
implementation: dev-workflow
review: review-gate
release: release
integration_branch: main
parallelizable:
  - admin-vite-and-api-client
  - nest-static-serving-and-route-tests
  - docker-ci-and-documentation
serial_dependencies:
  - workspace-install-and-lockfile
  - admin-vite-and-api-client -> docker-build
  - nest-static-serving-and-route-tests -> docker-route-regression
  - all-implementation -> review-gate
  - review-gate -> main-integration
validation_required:
  - pnpm install --frozen-lockfile
  - pnpm test
  - pnpm build
  - pnpm typecheck
  - docker image contents
  - HTTP route regression
preserve_unrelated_changes:
  - 1Prefix_schema
release_target: production via existing main-triggered CI/CD and Cloudflare Tunnel
```

## Execution gates

- Plan complete: this file records the accepted scope and heavy/worktree execution metadata.
- Before implementation: confirm the track/exec metadata with the user through `dev-flow`.
- After implementation: run `review-gate`; resolve CRITICAL/HIGH findings and report any deferred cleanup.
- After merge to `main`: use the project `release` skill to perform production release verification, including CI deployment and `/admin`/`/healthz` smoke checks.
