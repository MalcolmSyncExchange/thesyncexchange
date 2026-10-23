# SEC payment readiness

Isolated from the buyer pre-checkout patch. Base: `9d018ae3211c3fd629bd0ab0843215657c3b4f95`.

The Admin V2 Overview shows a server-derived, read-only Payment Readiness panel. It does not initiate checkout, probe Stripe, emit analytics, or change capability flags.

## Evidence and status rules

- **Configuration:** existing payment runtime and strict Stripe configuration validators (including webhook configuration), required application/operational configuration, demo and maintenance gates. Missing preview credentials are blockers even when the legacy display projection treats them as warnings. Reasons are fixed allowlisted codes/messages; raw diagnostics and secret values never enter the DTO.
- **Provider:** Unknown. No provider probe, connectivity, credential-validity or webhook-delivery evidence is collected.
- **Purchase capabilities:** one snapshot of the actual six booleans in `commerce_private.capabilities`. Missing/failed/partial/malformed evidence is Unknown, with a null enabled count. Demo mode also reports Unknown, not invented OFF flags.
- **Checkout:** Blocked for known configuration blockers or missing foundation/payment-adapter prerequisites when the application explicitly requests that adapter. Otherwise Unknown. This version cannot prove operational Ready. Six flags ON does not prove provider availability, per-order eligibility, worker execution or delivery.

Six flags OFF does not disable the legacy checkout path when the new adapter is not requested. Other foundation flags govern fulfillment workers and delivery; partial fulfillment is reported separately. Gate D remains an exact-grant controlled test path, not evidence of general marketplace readiness.

## Security and failure behavior

Canonical admin authorization occurs before service-role client creation; authorization failures are never swallowed. Demo access uses the existing local-only demo gate. Capability reads use a three-second abort bound. Read failures return Unknown without raw logs; evaluation failures return an all-Unknown safe DTO so the admin workspace remains usable.

The new `get_admin_purchase_capabilities()` RPC is STABLE, SECURITY INVOKER, empty search_path, parameterless, and service-role-only. It reads six explicit columns using existing SELECT grants. It neither exposes the private schema nor grants table mutations. Browser/ordinary authenticated roles, including canonical admins connecting directly, cannot execute it.

## Local migration only

`20261011004710_sec_payment_readiness.sql` requires the purchase foundation and payment-adapter migrations. It creates only the read-only RPC and its execute grants. No data changes, backfills, capability changes or analytics changes. It has **not** been applied to any hosted environment. Until separately authorized application, deployed capability visibility would remain Unknown.

System Health navigation remains planned. Provider probes, deployed schema/worker health monitoring, per-order diagnostics and end-to-end certification are deferred. No link is offered to an inactive surface.

## Validation

Focused suite: `node --test --experimental-strip-types tests/admin-payment-readiness.test.mjs` (included in `npm run test:unit`). It executes real migration SQL in an isolated in-memory database, plus configuration, authorization, rendering, failure and privacy tests.

Founder E2E uses only the existing local demo fixture on 127.0.0.1:3106. It preserves the approved base's existing buyer checkout behavior; it does not import the uncommitted pre-checkout selection implementation. Known label drift is corrected to current HEAD copy. Hosted commerce tests are outside this task.
