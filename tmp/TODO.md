# Issue #30 — Admin 운영 대시보드 구현

## Scope

- 로그인한 Admin만 `/admin/api/overview`와 `/admin/api/deletion-queue`를 조회한다.
- Overview에서 users, active user sessions, clients, memberships, deletion requests와 API/PostgreSQL/Redis 상태를 표시한다.
- Operations에서 `deletion_queue`의 user UUID와 요청 시각을 조회한다.
- Admin `admin_sid` 세션·`admin_csrf` 경계와 브라우저 비밀값 비노출을 유지한다.
- 기존 OAuth/API/정적 Admin 경로와 배포 토폴로지는 변경하지 않는다.

## Acceptance criteria

- 로그인 후 실제 PostgreSQL/Redis 기반 운영 데이터가 overview에 표시된다.
- operations에서 탈퇴 대기 항목을 조회할 수 있다.
- 인증되지 않은 API 호출은 401이고, 기존 SPA 경로는 로그인 페이지로 이동한다.
- API/Admin 테스트와 기존 전체 테스트, typecheck, build가 통과한다.
- Admin 번들에 `ADMIN_PASSWORD_HASH`, 앱 시크릿, `x-app-secret`이 포함되지 않는다.
- 변경 후 `graphify update .`, CI 배포, production health/Admin smoke를 확인한다.

## Implementation plan

1. Add an Admin session guard and dashboard service/controller with safe database/Redis health reporting.
2. Add API client types and render overview/operations states in the Admin SPA.
3. Add API and UI-facing unit tests and focused security regression coverage.
4. Run workspace validation, bundle secret scan, Docker build checks, and graph update.
5. Review the diff, merge/push to main, wait for CI deployment, smoke test production, and close issue #30.

## Track / execution metadata

```yaml
issue: 30
track: heavy
exec: worktree
workflow: dev-flow
planner: planner
implementation: dev-workflow
review: review-gate
release: release
integration_branch: main
parallelizable: false
validation_required:
  - pnpm install --frozen-lockfile
  - pnpm test
  - pnpm build
  - pnpm typecheck
  - Admin bundle secret scan
  - production health and Admin smoke
preserve_unrelated_changes:
  - 1Prefix_schema
```

## Status

- [x] API dashboard boundary
- [x] Admin UI
- [x] Tests and validation
- [ ] Review and integration
- [ ] Production release and issue closure
