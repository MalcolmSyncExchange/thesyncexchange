# Production Beta cutover maintenance mode

`SYNC_EXCHANGE_MAINTENANCE_MODE` accepts `off` (the default) and `cutover`.
An unrecognized value blocks application traffic and fails health reporting.
The mode is a server-side setting. It is not a browser variable or a substitute
for the database write guard.

In cutover, the Next middleware returns a self-contained, uncached HTTP 503
maintenance page for navigation and a small `maintenance_mode` JSON response
for APIs. It permits only GET `/api/health/config` and GET
`/api/health/readiness`. The Stripe webhook and direct Storage upload, signing,
and deletion routes also check the mode before their service dependencies.
Health responses include `maintenanceMode` and disable caching.

For a production cutover, configure the value for the exact production deploy
context, then build and verify a new deploy before publication. Netlify's
Next/Edge environment is captured as part of deployment; editing a site
variable alone is not proof that a published deploy changed modes. Verify both
health endpoints and blocked routes on the exact locked deploy. Keep the
existing password gate and sandbox webhook disablement until the separately
approved rollout sequence permits changing them. Rebuild and verify an exact
final revision with mode `off` before reopening application traffic.

This route gate cannot invalidate signed Storage upload tokens issued before
cutover. The reviewed token-expiry interval and SQL write guard remain separate
required rollout controls. Do not start their clocks based on an unverified
environment edit or a build that has not been published.
