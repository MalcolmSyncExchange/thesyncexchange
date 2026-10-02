# Purchase completion — Phase 2A

Baseline: `4ed914912295e8a128e6c9fc9984f7ed7e497181` (PR #27 production release).
Branch: `codex/purchase-completion-foundation`.

This change adds dormant TEST-only database primitives. It does not connect them
to checkout, webhooks, confirmation pages, agreement generation, Storage delivery,
or Buyer/Artist UI. No production migration, payment, upload or deployment occurs.
No signed URLs, receipt renderer, invoice creation, earnings calculation or worker
daemon is included. These are deliberately later integration work.

## Reconciliation with the deployed contract

- Production has seven recorded migrations, plus historical bootstrap schema.
  Missing historical ledger entries are not instructions to replay old SQL.
  `tests/fixtures/purchase-completion/production-shape.json` captures the observed
  column/constraint/bucket/ledger facts without customer content.
- Existing `orders.status` remains pending/paid/fulfilled/refunded; fulfilled still
  describes agreement fulfillment. New payment/delivery state is separate.
- Existing payments can be reconciled by both signed webhooks and a server-side
  Stripe retrieval on the confirmation page. Neither path is changed. The new
  event boundary accepts only evidence from a future signature-verifying adapter.
- Existing agreements have an explicit Admin regeneration path. It is untouched.
  New receipt facts/artifacts are immutable, and existing agreements are not
  regenerated or converted into entitlement evidence by this migration.
- TEST-only is enforced by database constraints, including non-commercial rights.
  Live commerce requires a separately reviewed schema/policy change. It cannot be
  enabled by merely changing the new capability flags.
- Snapshot rights identities and provider references are private. Buyer-readable
  tables contain typed safe metadata instead of arbitrary private snapshot JSON.
- Historical orders have no immutable asset versions or normalized verified event
  ledger. The classifier cannot infer those from current catalog data or activity.
- New restrictive foreign keys preserve purchase records. Deleting an account,
  order or track with new foundation records requires a future retention workflow.
  Existing historical rows gain no references and retain their current behavior.

## Data contract

| Relation | Purpose |
|---|---|
| `commerce_private.asset_versions` | Exact source object/version and deterministic purchase object, SHA-256, bytes, MIME, approval and retirement |
| `public.order_delivery_contracts` | Immutable order, Buyer, seller at purchase, track/license titles, minor-unit price, currency, environment and policy version |
| `commerce_private.contract_context` | Immutable provider-account binding, rights identities and full license configuration |
| `public.order_asset_entitlements` | Exact contract/order/Buyer/asset binding; pending/active/suspended/revoked/failed |
| `commerce_private.payment_events` | Append-only verified provider evidence; no raw payload or billing details |
| `commerce_private.order_states` / `state_history` | Current lifecycle and append-only transitions, independent of legacy order status |
| `commerce_private.fulfillment_jobs` | Unique contract/task/revision, retries, leases, fencing and completion |
| `public.order_receipts` / private `receipt_artifacts` | Immutable TEST receipt facts and private deterministic PDF identity |
| `public.artist_transaction_records` | Seller-scoped gross/refund/status facts; no Buyer billing or payable earnings |
| Private `capabilities` / `qa_fixture_designations` | Deployment-owner controls; no application role may enable or designate |

Amounts are integer minor units. Current checkout currency remains USD. The schema
can retain three-letter currency facts, but freeze validates the existing trusted
USD pricing rule, including license-type fallback when the option has no override.

## Private procedure contract

All procedures are in the unexposed `commerce_private` schema. Only named worker
entry points grant EXECUTE to `service_role`. Trigger/internal helpers do not.
Service role has SELECT but no direct commerce-table DML privileges. Ordinary
clients have no private-schema USAGE. Do not expose this schema through PostgREST.

1. `reserve_asset(track_id)` derives and locks the source locator from an approved
   track and Storage record. It accepts no source path. It deduplicates exact
   track/source-object/source-version/asset-type identity.
2. A future trusted copy worker computes a SHA-256 over actual bytes and uploads
   without overwrite to `purchase-assets/<asset UUID>/master`.
   `seal_asset(asset_id, sha256, bytes, MIME)` verifies Storage metadata and seals
   the immutable identity. SQL cannot independently hash provider object bytes;
   this remains a required worker integration test before capability activation.
3. `freeze_contract(order_id, environment, provider_account)` runs before provider
   session creation. It locks the pending order/catalog, derives price and seller,
   snapshots rights/license configuration, and rejects already-started checkout.
4. `reserve_entitlement(contract_id, asset_id)` also precedes checkout. Both exact
   synthetic fixture and Buyer must have explicit deployment-owner designation.
   A designation never follows an email domain, title, price, role metadata or
   user-supplied checkout field. Real-catalog TEST purchases have no entitlement.
5. A future Stripe adapter verifies the raw-body signature, connected/platform
   account, livemode=false, session payment_status=paid for PAID, and authoritative
   session/order/payment-intent relationships. It supplies a SHA-256 of evidence
   to `record_payment_event`. That procedure rechecks stored identity, account,
   amount/currency, event/state compatibility and dedupe, then atomically stores
   evidence, transitions state and enqueues jobs. It does not verify cryptographic
   signatures itself and must never be called with unverified request fields.
6. `claim_job(task)` atomically claims one eligible row with SKIP LOCKED, a random
   fencing token and five-minute lease. It limits attempts to five. Failed retries
   wait at least one minute. Exhausted expired leases become non-retryable failures.
7. `prepare_receipt` derives immutable facts from the contract/event using a valid
   receipt-job lease. A future renderer uploads to
   `order-receipts/<receipt UUID>/receipt.pdf`; `seal_receipt` validates metadata.
   No tax invoice, Stripe invoice or Buyer billing snapshot is created.
8. `finish_job` checks the current lease and required artifact/result. Database-only
   activation and seller projection occur atomically with completion. Unique result
   keys make retries logically exactly-once; physical uploads may leave unreferenced
   objects after a crash, requiring a later reviewed orphan-cleanup procedure.
9. `can_deliver(entitlement_id, authenticated_buyer_id)` is a private boolean
   predicate, not a delivery endpoint. It rechecks canonical role, ownership,
   active entitlement, paid lifecycle, prepared asset, QA designation, agreement
   readiness/classification and enabled capabilities. A future server adapter must
   derive Buyer identity from the authenticated session and implement bounded
   signed delivery, rate limiting, audit events and cache rules separately.

Duplicate provider IDs with different evidence are rejected. Different event IDs
for an unchanged logical payment preserve evidence without duplicating jobs or
receipts. Stale PAID events cannot clear refund, dispute, failure or security holds.
Administrative hold release is intentionally absent; it needs explicit review.

## Lifecycle effects

| State | Entitlement | Receipt/agreement | Seller record |
|---|---|---|---|
| PAID | Pending until exact QA asset/agreement checks pass | TEST receipt job; existing agreement flow unchanged | TEST payment facts |
| FULFILLED | Active only for designated QA | Preserve artifacts | Preserve payment facts |
| PARTIALLY_REFUNDED | Suspend | Append TEST adjustment; preserve original receipt/agreement | Refund total and effective state |
| REFUNDED | Revoke permanently | Append TEST adjustment; preserve original artifacts | Full refund facts |
| DISPUTED | Suspend; no automatic restoration | Append TEST adjustment; preserve original artifacts | Dispute state |
| PAYMENT_FAILED | Suspend/deny | No payment receipt job | Failure facts; not revenue |
| SECURITY_HOLD | Suspend (revoked stays revoked) | Preserve artifacts | Hold projection when prior payment evidence exists |

Asset retirement or QA-designation revocation suspends associated access and
records a security hold. Existing byte identities remain protected. Receipt
supersession is modeled but no correction/regeneration workflow ships here.

## Capabilities and Storage

`foundation_enabled`, `asset_preparation_enabled`, `receipt_generation_enabled`,
`entitlement_activation_enabled`, and `transaction_projection_enabled` default
false. No environment-variable fallback enables them. Test fixtures enable them
only inside disposable in-memory PostgreSQL databases.

Both buckets are private. A restrictive Storage policy denies anon/authenticated
object operations even if a future broad permissive policy appears. An all-role
trigger preserves referenced source/copy/receipt versions, locators and metadata;
another prevents publishing/deleting the two buckets. The existing PR27 Storage
trigger remains unchanged. Metadata protection is deliberately stricter for these
retained objects and requires hosted Storage compatibility testing before rollout.

## Validation and integration limits

Run `npm run test:purchase-foundation`, `npm run test:unit`,
`npm run test:security-pr2`, `npm run test:artist-baseline`,
`npm run test:artist-security:gate`, `npm run verify:security-baseline`,
`npm run typecheck`, `npm run lint`, `npm run build`, and `git diff --check`.

The database rehearsal uses real PostgreSQL execution through PGlite, with local
Auth/Storage table shims and captured production shape checks. It does not emulate
the hosted Storage HTTP service, GoTrue, PostgREST schema cache, multiple PostgreSQL
connections, object bytes or Stripe signatures. Hosted rehearsal is a separate
pre-merge gate, using a disposable security project and synthetic records only.

Legacy dry-run: `node scripts/purchase-completion/legacy-dry-run.mjs <local-export.json>`.
It reads an explicitly supplied sanitized local export, prints per-order reasons,
and has no network, credential, SQL-write or backfill path. SAFE_TO_MAP is only a
manual mapping candidate; every output explicitly denies master entitlement.

Before later integration, review the webhook/confirmation coexistence, transaction
boundaries around Checkout session binding, agreement generation from frozen
contract facts, provider-account configuration, byte-copy/hash verification,
multi-connection contention, retention policy, credential isolation, delivery
audit/rate limits and refund/dispute provider mappings. Phase 2A does not claim
that this future integration has already passed hosted acceptance.

## Release constraint

Security review first. No merge, production migration, deployment or capability
activation is authorized by this change. Live payments remain disabled.
