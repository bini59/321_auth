# Issue #18 — Monorepo migration and Admin shell

<!-- track: heavy; exec: worktree+parallel -->

## Scope

- Convert the repository to a pnpm workspace monorepo.
- Move the existing NestJS API into `apps/api` without changing its public routes or security behavior.
- Add a Vite + React + TypeScript Admin shell with layout, routing, and a separated API boundary.
- Add `packages/contracts` for shared API response types; do not expose app secrets in browser code.
- Update Docker, Compose, and GitHub Actions while preserving `api-net`, `auth-app:3000`, Postgres/Redis isolation, migrations, and self-hosted deployment.
- Record that real Admin authentication is intentionally deferred; the browser must never contain `ADMIN_API_KEY` or `x-app-secret`.

## Execution order

1. Create feature branch from `main` and establish workspace metadata. (done)
2. Move API source/tests/config/build metadata into `apps/api`; make root scripts delegate to workspace packages. (done)
3. Add contracts package and Admin shell (`apps/admin`) with route/layout/API client seams only. (done)
4. Update Docker/Compose/Actions for workspace install/build/deploy. (done)
5. Run API tests/build, Admin typecheck/build, frozen-lockfile install, and config/static secret checks. (in progress)
6. Run graphify update, review the complete diff, then merge and push after review gate.

## File ownership / likely changes

- Root: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig*.json`, `nest-cli.json`, docs.
- API: all current `src/**` and API-specific build/test configuration → `apps/api/**`.
- Admin: new `apps/admin/**`.
- Contracts: new `packages/contracts/**`.
- Delivery: `Dockerfile`, `docker-compose.yml`, `.github/workflows/deploy.yml`.
- Preserve unrelated untracked `1Prefix_schema`.

## Acceptance checks

- `pnpm install --frozen-lockfile` succeeds.
- Root commands cover API build/test and Admin build/typecheck.
- Existing SSO and `return_to` tests pass unchanged in behavior.
- API build succeeds from `apps/api`.
- Admin produces a deployable static `dist` and contains no secret key.
- Docker image build context and deployment workflow use the workspace layout.
- `api-net`, `auth-app:3000`, Postgres/Redis internal-only access, migrations, and rollback path remain intact.

## Risks / decisions

- Keep API and Admin as separate workspace packages; the API image remains API-only so the existing tunnel target remains stable.
- Use pnpm's workspace protocol only for local contracts; keep runtime dependencies package-local.
- Admin API calls are same-origin-relative by default and expose an injectable credential-free transport boundary. No server-side admin proxy/auth implementation is added in this issue.
- The existing lockfile is npm-based; generate and commit a pnpm lockfile rather than hand-editing it.
