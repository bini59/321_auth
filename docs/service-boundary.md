# Service boundary and terminology

Auth keeps the deployed `clients` table and legacy `/admin/clients` routes for compatibility. A registered, active row is the trust boundary for a Service: login start, OAuth callback, `/verify`, and internal membership creation all require that Service to exist and be active.

The canonical Admin route is `/admin/services`. It accepts `service_id` (and the legacy `client_id`) and returns Service aliases alongside legacy fields so existing integrations can migrate without a flag day. The Admin UI uses Service terminology and shows `auto_provision` explicitly.

`auto_provision=false` prevents creation of a new Membership during login callback or `/verify`; it does not invalidate an existing active Membership. Internal `POST /memberships` requests must identify the same Service authenticated by `x-app-secret`, preventing one Service from provisioning another Service's Membership.

Auth's authorization boundary for Memberships is intentionally narrow: a missing Membership is an onboarding state and remains a successful `/verify` response with `membership: null`; `status === suspended` makes `/verify` return HTTP 403 only for that user×Service Membership identified by the request's `client_id`. It does not block the user's other Services or implement an account-wide block. Role, feature, and domain-specific authorization remains the responsibility of each application. See [ADR-0001: Auth authorization boundary](adr/0001-auth-authorization-boundary.md).

Existing database rows retain their stored `auto_provision` value. New Services are created with an explicit boolean and the Admin form defaults to `false`, which is the safer onboarding policy. A future migration may change existing defaults only with an explicit product decision; no data is renamed or deleted by this compatibility release.
