# ADR-0001: Auth authorization boundary

- Status: Accepted
- Date: 2026-08-07

## Context

The central auth service owns authentication, session validation, and the
Membership record for each user and Service. `GET /verify` therefore has three
distinct outcomes:

1. An invalid or missing session is an authentication failure and returns
   HTTP 401.
2. A valid session with no Membership is an onboarding state. It returns HTTP
   200 with `membership: null`; it is not an authorization failure.
3. A user×Service Membership whose `status` is `suspended` blocks only that
   Service. The current boundary in
   [`auth.controller.ts`](../../apps/api/src/auth/auth.controller.ts#L193)
   returns HTTP 403 for that Service's `/verify` request.

The third outcome can appear to conflict with the rule that applications own
authorization. Without an explicit decision, the reason for this exception is
easy to lose and the boundary can be implemented inconsistently by future
services.

## Decision

Auth enforces the status of the requested user×Service Membership, and only
that status, at the Membership authorization boundary:

- `status === suspended` is a Service-scoped block. When an administrator
  suspends one Membership, only that Service receives 403 from `/verify`; the
  user's Memberships for other Services are not changed or blocked.
- A missing Membership remains a successful onboarding response. Auth must not
  turn `membership: null` into 401 or 403.
- Roles, features, resources, and other domain-specific authorization are owned
  by the application using the auth response. Auth does not decide whether a
  particular role may perform an application operation.

## Rationale

Keeping the Service-scoped Membership check in auth gives each Service one
consistent enforcement point. Auth deliberately does not add an account-wide
block; a suspension is evaluated only after `/verify` resolves the requested
client's Membership.

## Consequences

- Applications must treat HTTP 403 from their `/verify` as a terminal suspended
  state for that Service, not as a login redirect or onboarding request.
- Applications must handle HTTP 200 with `membership: null` as onboarding when
  their Service allows it.
- Application authorization remains local and can evolve without expanding the
  auth service's knowledge of application roles or resources.
- Tests and service documentation should preserve the distinction between
  authentication (401), onboarding (`membership: null`), and account blocking
  (403 for the requested Service).

## References

- [`CONTEXT.md` membership terminology](../../CONTEXT.md)
- [`docs/service-boundary.md`](../service-boundary.md)
- [`GET /verify` implementation](../../apps/api/src/auth/auth.controller.ts#L163-L197)
