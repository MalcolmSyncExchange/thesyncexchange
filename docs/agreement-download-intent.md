# Agreement delivery: read safety and explicit authorization

## Incident and classification

The approved Phase 2B application's agreement GET handler called `markGeneratedLicenseDownloaded` and appended `agreement_download_authorized` whenever it signed or streamed an artifact. Next.js `Link` automatically prefetched this URL from Buyer orders and confirmation. Buyer settings and Admin orders had the same link pattern.

A production-mode Next.js browser fixture using the unchanged old handler and fake data reproduced a GET carrying `Next-Router-Prefetch: 1`, `RSC: 1`, and `Next-Url`. Rendering the link, without clicking it, generated one authorization audit and one license write. Direct GET and the old GET implementation invoked for HEAD also reproduced writes. Headers are evidence, not the integrity control: all GET/HEAD requests must be harmless regardless of which headers are present.

Production evidence contains four authorized-delivery events at 22:08:33–22:09:41 UTC on October 3, 2026, for three existing licenses. One license was accessed twice. Each request updated `downloaded_at`; migration 0013's existing update trigger changed `updated_at`. No order, agreement document, Storage object, or Phase 2B artifact was created or modified by that access path.

The four historical requests are **INDETERMINATE**, not definitively prefetch or intentional download. Their application audit records do not retain HTTP method, user agent, prefetch headers, or a Netlify request ID. Available Netlify function logs do not supply an exact-deploy request/header correlation. No deliberate download was clicked during verification, and the timing matches page views, but retrospective certainty is not justified. Preserved evidence is local-only; private Buyer/order identifiers are not committed.

## Contract

* `GET /api/orders/:orderId/agreement`: authenticate, resolve canonical database role, enforce order scope through the authenticated RLS client, and return safe readiness metadata. No signing, streaming, license update, or audit write. Authorized but unavailable agreements return 409; anonymous 401; wrong role/owner 403. Existing API URLs remain valid read endpoints.
* `HEAD` has the same authorization/status/cache behavior with no response body and no writes.
* `POST /api/orders/:orderId/agreement/download`: require same-origin `Origin` and reject cross-site Fetch Metadata; repeat canonical Buyer/Admin and owner authorization server-side. An eligible artifact receives a 60-second signed delivery URL via 303, or an authorized attachment stream if signing is unavailable. The privileged client is acquired only after the session, canonical role, and order-scope checks pass.
* Every response is private/no-store. No permanent public URL is introduced. Existing Admin authority is retained; Artists cannot authorize Buyer agreements. GET/HEAD on the POST-only endpoint are unsupported and cannot invoke it.

The four UI entry points use native POST forms, not navigation links to delivery. Security does not depend on JavaScript, `prefetch={false}`, or recognizing one prefetch header.

## Audit and retry semantics

One successfully prepared, explicit POST authorization writes one `agreement_download_authorized` event with the authenticated actor, database timestamp, agreement number, method POST, and `transferCompletionObserved: false`. Audit persistence is required before returning delivery. Signing/stream preparation failure and denied access create no download event. Audit failure returns 503 without returning a delivery URL.

Repeated GET, HEAD, navigation, refresh, probes, or prefetch create zero download telemetry. Repeated authenticated, same-origin POST requests are separate authorization attempts and may each create an event. This is per-request authorization telemetry, **not a download count**, unique-user metric, or completed-transfer claim. No exactly-once completion is asserted; automatic POST retry is not used by the UI. A signed URL may be reused until expiry without producing another app authorization event.

`generated_licenses` describes the license document and is no longer updated for agreement access. Existing `downloaded_at` values are retained as legacy, ambiguous telemetry; no schema migration or data repair is included.

## Evidence reconciliation recommendation

Prefer leaving the four events and three license timestamps intact, with a separately authorized corrective incident note explaining the ambiguity. Do not silently reset timestamps or delete audit history. A data repair, if later required, must name the exact rows and expected old/new values, preserve an immutable correction record, and receive separate production authorization. None is performed by this change.

## Verification and release boundaries

`npm run test:agreements` exercises read/prefetch/HEAD safety, owner and Admin POST, repeated intent, anonymous/Artist/cross-Buyer denial, CSRF, missing artifacts, streaming fallback, and storage/audit failures. Existing role/security tests follow the shared authorization handler. The local browser fixture is isolated in-memory and records only allowlisted request headers; it never connects to Supabase or Stripe.

No migration, capability, checkout, adapter, entitlement, receipt, Artist projection, RLS, Storage policy, or payment-mode change is included. Production publication and the Phase 2B production activation prohibition remain outside this fix. Security review must precede resuming the dormant release.

Run `node scripts/agreement-prefetch-fixture.mjs` and open its `/legacy` and `/fixed` pages in Chrome. The generated evidence file captures real Next.js prefetch headers and in-memory side effects. `/fixed` must remain at zero license writes throughout; prefetch creates zero authorization events, and each intentional form submit adds one. The fixture binds only localhost and contains synthetic records. A browser may independently block a synthetic delivery response; that is not evidence of completed transfer.
