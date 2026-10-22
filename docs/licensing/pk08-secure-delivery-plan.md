# PK08 secure delivery — execution plan only

Status 2026-10-22: the subsequent founder implementation directive authorizes
the local candidate described in [PK08 implementation](pk08-secure-delivery.md).
This original plan remains the architecture baseline; hosted changes remain unapproved.

No hosted Storage changes or asset-delivery implementation is authorized by this plan.
Build on the accepted PK07 and PK03/PK06 interfaces; do not create a parallel contract,
worker, entitlement or asset-version model.

## Entry dependencies

* PK04 must identify exact immutable recording/variant bytes, object version, MIME,
  byte size and SHA-256. Reconcile the existing media owner's staging data model before
  adding anything. An accepted track identifier alone is not an asset version.
* PK06 `licensing_private.acceptances` supplies the immutable purchase/hash, license,
  parties, usage, legal document hashes and acceptance receipt. Generated licenses
  supply immutable paths and PDF/HTML byte hashes. Resolve commercial legal approval
  and the existing PDF Unicode presentation limit before commercial acceptance.
* PK07 supplies signed payment proof, immutable provider bindings, adverse holds,
  retry and issuance fencing. Operator reconciliation/hold resolution remains separate.
* Reuse `order_delivery_contracts`, `commerce_private.contract_context`, `asset_versions`,
  `order_asset_entitlements`, `order_receipts`, fulfillment jobs and `can_deliver`.
  Existing TEST designations allow only explicitly approved synthetic assets. Real
  masters must remain denied in ordinary TEST flows.

## Dependency-ordered local work

| Slice | Scope and ownership | Acceptance evidence |
|---|---|---|
| PK08-A manifest | One schema owner extends the frozen contract with accepted purchase hash and included asset-version manifest per license. Preserve master/instrumental/stem eligibility, object version/hash/size and historical purchases on replacement. | Native SQL: missing/wrong track, asset, license, version and price cannot reserve/activate; replacement never changes an old manifest. |
| PK08-B authorization | New server delivery broker uses canonical Buyer and RLS order scope before privileged access. Check purchase acceptance, exact license manifest, paid state, rights validity, holds, asset state and entitlement on every authorization. Admin exceptions require explicit capability and reasoned audit. | Buyer B, Artist, logged-out, stale session/role, forged entitlement/order/path and invalid review all denied before Storage access. |
| PK08-C delivery | Explicit same-origin POST authorizes access; GET/HEAD/prefetch inspect only. Derive private path from frozen manifest. Stream and hash-check bytes or issue short-lived signed links after the same checks. Use private/no-store headers. | Exact hash/size/MIME, encoded traversal, redirects, cross-origin POST and provider errors; zero writes on probes and denied requests. |
| PK08-D audit/recovery | Append authorization decision, actor, order, entitlement, asset version, purchase hash, reason and server timestamp. Record authorization separately from observed transfer. Retry the same entitlement; never re-charge or regenerate a legal artifact. | Audit failure blocks delivery; replay/idempotency, signing outage, network interruption, expired link renewal and interrupted workers. |
| PK08-E acceptance | Buyer purchases UI distinguishes agreement, historical acceptance, receipt and licensed files. Use explicit downloads; legal history remains inspectable after refund while exploitation delivery is blocked. | Actual approved browser/device/accessibility checks plus separately authorized private Storage HTTP and provider TEST verification. |

## Link and revocation contract

Recommend a 60-second maximum signed URL lifetime for the controlled cohort,
subject to explicit founder/security acceptance. A signed URL is a bearer credential;
revocation cannot reliably invalidate one already issued before expiration. For
immediate revocation requirements use authenticated server streaming with rechecks,
or a revocable broker token, rather than promising instant revocation of Storage URLs.
Never persist tokens in analytics, ordinary logs or public caches. Rate-limit both
authorization and renewal; derive all paths server-side. Range requests must preserve
authorization and bounded resource use. Verify hash before publishing/sealing an asset
and verify brokered download bytes against the frozen SHA-256.

Refunds, disputes, revoked evidence, rights changes and security holds must deny new
asset authorizations and activation. Preserve receipts, agreements and acceptance
history; delivery suspension is not automatic legal termination. Full refunds revoke
entitlements; partial-refund and dispute policy stays conservative until approved.
Concurrent adverse events and delivery authorization need real independent-connection
tests and documented semantics for already-issued URLs/in-flight streams.

## Likely files and integration boundary

New `services/delivery/` broker and explicit `app/api/orders/[orderId]/assets/` POST
routes; `services/buyer/purchases.ts`, `lib/purchases/contract.ts` and purchase cards
consume read-only availability DTOs. Preserve `services/agreements/access.ts` deliberate
POST behavior and 60-second agreement link. Add exact-byte validation using the new
recorded artifact hashes; historical agreements are not exploitation entitlements.
Extend `services/purchase-completion/server.ts` through existing worker contracts.
One migration integrator owns manifest/authorization-audit RPCs; the media owner owns
asset versions. Do not run conflicting Storage or Auth/PostHog migrations concurrently.

## Promotion and rollback

Require exact-head code/schema review, negative authorization tests, native PostgreSQL
contention proof, byte integrity evidence, private Storage policy/grant verification,
Safari/Chrome/Firefox plus mobile checks, keyboard/screen-reader acceptance, recovery
tests and human acceptance for the exact candidate. Hosted inspection/integration
requires a separately approved coordinated window. No feature flag or public bucket
is enabled as part of local development. Roll back by disabling delivery and retaining
immutable manifests, evidence, artifacts and audit history; do not delete purchases.

## Private Beta critical path

1. Recover outstanding founder sources; confirm actual parties, legal text, mandates,
   outside-clearance responsibilities, economics/rounding and evidence-review standard.
2. Review and integrate compatible PK03/PK06/PK07 candidates in an authorized isolated
   window coordinated with Auth/PostHog. Keep commerce capabilities off until approval.
3. Complete PK04 immutable bytes and PK08-A through D; prove role/storage/byte boundaries.
4. Complete minimum contributor/ledger operational evidence and reconciliation cases,
   source real cleared inventory, and close required support/privacy/security controls.
5. Execute formal checkout/rights/agreement/delivery QA for trusted testers. Local test
   totals do not mark formal scenarios passed. Obtain founder Private Beta approval.
6. Real money requires the additional Controlled Live legal/payment/accounting/payout,
   incident/reconciliation and founder transition gates. No market-readiness inference.
