# Code Deletion Log

## 2026-08-07 Refactor Session

### Dead UI Removed

- `apps/admin/src/main.tsx` — removed the obsolete `memberships` navigation tab.
  Service membership browsing is provided by the `services` cards as required by #42;
  the old tab only rendered a generic placeholder.

### Findings Kept

- `apps/admin/src/service-memberships.ts` — retained because its state messages and
  page-boundary rule are used by the service membership UI and covered by Admin tests.
- Legacy Service/Client aliases and Membership `role` response fields — retained for
  compatibility and the `/verify` contract; #41 removes only role mutation.

### Impact

- Files deleted: 0
- Dead navigation entries removed: 1
- Dependencies removed: 0
- Required #41/#42 behavior, security validation, pagination, and #43 documentation preserved.
