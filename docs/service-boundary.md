# Service boundary and terminology

Auth keeps the deployed `clients` table and legacy `/admin/clients` routes for compatibility. A registered, active row is the trust boundary for a Service: login start, OAuth callback, `/verify`, and internal membership creation all require that Service to exist and be active.

The canonical Admin route is `/admin/services`. It accepts `service_id` (and the legacy `client_id`) and returns Service aliases alongside legacy fields so existing integrations can migrate without a flag day. The Admin UI uses Service terminology and shows `auto_provision` explicitly.

`auto_provision=false` prevents creation of a new Membership during login callback or `/verify`; it does not invalidate an existing active Membership. Internal `POST /memberships` requests must identify the same Service authenticated by `x-app-secret`, preventing one Service from provisioning another Service's Membership.

Existing database rows retain their stored `auto_provision` value. New Services are created with an explicit boolean and the Admin form defaults to `false`, which is the safer onboarding policy. A future migration may change existing defaults only with an explicit product decision; no data is renamed or deleted by this compatibility release.
