# PK08 controlled hosted rehearsal — prepared, NOT authorized or executed

2026-10-22. Applies to the integrated PK04 + PK07/03/06/08 candidate. Every case
below is **Not Run**. Local automation is supporting evidence only. This document
is an execution assignment for a separately authorized environment owner.

## Authorization and isolation gate (H0)

Founder approval must name project/site/broker, exact commit/tree and migration
hash manifest, allowed SQL/Storage/API operations, synthetic accounts/assets,
provider TEST-only scope, test window, operator and rollback authority. Approval
of this plan does not provision an environment or release a shared staging hold.
Use an isolated nonproduction Supabase project and Netlify preview/context plus a
separate large-file Node broker; no production clones containing personal data.
Verify IDs/regions/URLs independently, preserve Auth/PostHog owner holds and never
reuse their writers, credentials, callbacks or deploy. No live keys or real music.

Before mutation: fresh migration ledger/effective object/ACL/RLS/owner/extension
inventory; exact source hashes and existing media dependency comparison; zero
unexpected writers/locks; backup and point-in-time recovery evidence; all current
capability values; baseline account/track/payment/object counts and route health.
Stop on identity, source, hash, role, dependency, ledger or ownership drift. Older
A/B/C IDs may exist with different definitions. Review additive forward SQL rather
than altering history. No blanket `db push`, old-PR replay or blind retry.

## Storage and database gate (H1)

One migration integrator applies only separately approved missing/forward SQL in
the reviewed dependency order. Record success per transaction and reconcile actual
objects after uncertain responses before retrying. Verify all private-schema
ACLs, FORCE RLS, empty search paths, canonical roles, retained FKs and disabled
flags. Keep ordinary buyers ineligible for commercial rights even with TEST pay.

Approve the supported Storage API configuration separately. Required buckets:
`submission-source` PRIVATE, max 250,000,000 bytes, reviewed source audio MIME set;
`submission-derived` PRIVATE, <=4,000,000 bytes, reviewed preview/waveform MIME set;
`submission-artwork` PRIVATE, <=10,000,000 bytes, reviewed image MIME set;
`purchase-assets` PRIVATE, max 250,000,000 bytes, approved audio/ZIP/PDF MIME set;
`agreements` (verify the configured agreements bucket) PRIVATE and existing size/path policy; `order-receipts` PRIVATE
if receipt acceptance is included. Compare the actual broker MIME allowlist and
agreement limit (<=4 MB) before selecting fixtures. Do not hand-update provider
metadata tables as a substitute for supported bucket/object API operations.

The recorded project ceiling is 50 MB; SQL allowing 250 MB does not increase it.
Independently establish the global upload ceiling, plan/quota, egress and retention
budget. Any account/billing/limit change needs its own authorization. Stop if the
required maximum is unsupported; do not silently lower the approved product limit.
Review the media owner's separately hashed Storage protection installer and its
real provider/supautils prerequisites. This PK04 candidate did not install it.
Measure actual raw HTTP read/list/write/update/delete/upsert for anon, Buyer,
other Buyer, Artist, other Artist, Admin and isolated broker. Client full-source,
private catalog audio and purchased-object enumeration must fail. A service key
never appears in browser bundles, responses, URLs, referrers or logs.

## Broker identity, TLS and runtime gate (H2)

App: authenticate getUser, canonical profile, owner RLS, real JWT session verified
against Auth sessions before privileged begin. Test logout/session deletion,
changed persisted role, stale cookie and token substitution. A forged role claim
cannot elevate rights. Verify actual provider session/schema grants at this head.

Large broker: HTTPS-only configured `/download` with a valid trusted certificate,
TLS >=1.2 (prefer 1.3), no HTTP downgrade, no broad CORS and no redirected requests.
Exact approved app Origin; POST body contains only the opaque random ticket. No
buyer JWT/cookie, asset path or supplied target URL. Server derives Buyer/order/
asset from the stored 256-bit ticket digest. One redemption, original <=60-second
expiry, current session and entitlement check, then sealed bytes + final recheck.
CORS is browser-origin control, not authentication; ticket possession is the
short-lived capability. Test stolen/replayed/malformed/expired/cross-origin tickets
and ensure TLS/proxy/APM/trace logs redact ticket bodies, Authorization and secrets.
Do not put the service key in NEXT_PUBLIC_* or a cloud deployment transcript.

Include the explicit approved-master copy command in a reviewed operator/worker
runtime, with the same bounded fetch/hash/readback and no-overwrite contract.
A Next server export does not establish capacity for 250-MB ingestion.

Deploy only the reviewed standalone runtime, not a Netlify large binary Function.
Pin Node/dependencies/image, network egress to the exact project, least privilege
operator/secret access, private staging ingress controls and audit retention.
Use >=2 GiB initial memory budget and the existing 2-request process limit; measure
actual peak before accepting it. Autoscale ceilings must bound aggregate egress,
concurrency and spend, not only one process. Metrics: admitted/denied/count by safe
reason, time to verified preparation, bytes, integrity failures, memory/OOM and
session/provider failure. No sensitive payload collection. Health/alert ownership
and TLS expiry alert must be assigned. No unrestricted credential inspection.

## Test protocol and evidence (H3)

Create synthetic canonical Artist/2 Buyers/Admin and purpose-reviewed QA fixtures
only after explicit fixture/capability approval in this isolated environment.
Store exact hashes/versions, benign synthetic rights/terms and TEST-only review
references. No affirmative legal clearance or real master implied. Freeze quote
and consent through the actual browser, then use separately approved provider TEST
flows/webhook signatures. No LIVE event/transaction or commercial entitlement.
Retain event and purchase hashes to prove amount/currency and full chain equality.

| Case | Execute and expected result | Required evidence |
| --- | --- | --- |
| H3-01 | Full submission → worker → Admin approval → rights → quote → assent → checkout → signed paid proof → exactly one license → only included assets | Correlated IDs/hashes, role/session, event, audit and downloaded hash; private SQL/HTTP evidence |
| H3-02 | Pending/failed/unpaid/wrong amount/currency/scope/missing assent or source | No issued license/active entitlement; retained original facts and reason |
| H3-03 | Unknown provider response, restart/retry, concurrent checkout, duplicate and out-of-order events | Original operation key and snapshot; one payment binding/license; holds cannot be cleared by late success |
| H3-04 | Replace source before assent/issuance; change then revert; simultaneous Admin update | Stale pending purchase denied; new purchase requires new reviewed source; no pointer substitution |
| H3-05 | Replace after issuance and edit metadata | Old evidence/downloaded hash stays exact; new purchase uses new approval |
| H3-06 | Wrong user/role/tier/entitlement, guessed IDs, direct raw access/list, role metadata forgery | Denied without existence disclosure; safe durable decisions |
| H3-07 | Full/partial refund, dispute, source/rights hold, catalog rejection, retirement, session deletion during I/O | Admission/final release denied; original agreement retained; revocation outcome; no silent unhold |
| H3-08 | Ticket 0/59/60/61 seconds, replay and two concurrent redemptions; small authorization expiry | Original expiry enforced, one redemption, no bytes after invalid final recheck |
| H3-09 | Storage 404/403/5xx, mismatched SHA/size/version/MIME, truncated/oversized response, provider timeout, DB/audit outage | No unverified bytes, bounded failure, durable outcome/retry; no URL/credential logging |
| H3-10 | Browser cancellation, process crash before/after redemption, network drop after final preparation | Original purchase retained; old ticket unusable, fresh authorized retry; no assertion that preparation proves receipt |
| H3-11 | Private agreement owner/other Buyer/Admin; held/refunded order's historical document | Authorized historical document hash matches; separate from exploitation access; no regeneration |

Maximum-size protocol: validate genuine allowed WAV/AIFF/FLAC plus approved ZIP/PDF
variants with exact expected byte count/hash. Test 4,000,000 and 4,000,001-byte
transport boundary, 50 MB provider boundary, 249,999,999, 250,000,000 and
250,000,001-byte limits (use structurally valid, duration/sample/frame-compliant
fixtures where acceptance is expected; size-only negative fixtures are distinct).
For exact 250 MB WAV, construct legal RIFF chunks/frame alignment rather than
padding arbitrary audio. Test 2 simultaneous maximum downloads, a third admission,
cold start, slow link, concurrent revocation and an integrity error. Record client
and server hashes, process RSS/heap, egress, gateway sizes, 20-second Storage fetch
budget and 60-second authorization. Proposed acceptance: no OOM, no oversized
serverless response, preparation p95 <45s and each Storage fetch <20s at maximum;
these are engineering rehearsal targets, not founder-approved service SLAs. If
hosting cannot meet them, stop and review transport/runtime, never extend grants
silently or omit maximum-size results. Already released bytes cannot be recalled.

## Human and independent security acceptance (H4)

Chrome, Firefox and Safari latest stable at execution; macOS/Windows desktop,
iOS Safari and Android Chrome actual devices; record exact versions. Download
small/large audio and agreement, cancellation/retry, stale tabs, narrow 320px
layout, retained accessible error/focus, keyboard-only control, visible focus,
contrast, VoiceOver and NVDA. WCAG 2.2 AA review is a target requiring human
acceptance, not a claim from lint or screenshots. Preserve the approved visual
baseline. Test async states without asserting a download completed merely because
the app prepared bytes. Check no filenames or secrets leak via shared caches.

Independent reviewer signs the exact candidate tree + deployed environment:
source/variant substitution, issuer fencing, SQL owner/grant/RLS, Storage real HTTP,
admin privilege boundaries, ticket entropy/replay/session scope, races, SSRF/path
handling, rate/resource bounds and logs/proxy/TLS configuration. Disposition every
Critical/High before test admission or release as appropriate. No automatic scan
count is an independent review certificate.

## Failure, rollback and exit (H5)

On security/identity/payment/hash drift or data leak: stop fixture admissions and
issuer/broker traffic; record time/IDs, restrict affected access and preserve
immutable source, original quotes/acceptance/payment/license/audits. Disable only
approved isolated capability/routing knobs, revoke broker secret on suspected leak
under incident authority, restore the approved app/runtime candidate. Reconcile
pending provider operations without creating a fresh key. Never delete evidence,
rewrite balances, drop tables, unhold transactions or regenerate agreements.
Record original and rollback flags, route health, disabled issuance/delivery and
operator sign-off. Rehearse a broker outage and incorrect-bucket-visibility alert
using only approved isolated controls. No shared services may be stopped.

Exit evidence: exact source/tree/migration/setup hashes, environment IDs, ordered
SQL/API logs and pre/post fingerprints; every H3 case result and downloaded hash;
maximum-size/resource measurements; browser/a11y artifacts; independent review;
remaining risks, incident/rollback exercise and named human acceptance. Formal
Command Center QA remains Not Run until those actual scenarios execute. Internal
Alpha → Private Beta → Controlled Live Beta → Market Launch each requires explicit
founder transition approval. TEST rehearsal never authorizes real money.
