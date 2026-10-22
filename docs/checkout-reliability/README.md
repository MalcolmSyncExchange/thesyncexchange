# PK07 checkout reliability and Alpha financial simulations

Local implementation following the accepted October 21, 2026 reconciliation.
PK07-A is preserved in local commit `d1724da`. This package does not authorize
push, merge, deployment, hosted SQL, provider transactions or capability changes.

## Implemented behavior

- A service-only PostgreSQL reservation serializes Buyer/track/license selection.
  Concurrent form submissions reuse one pending order, including orders whose
  provider response was lost. Price and eligibility come from database records.
  Multiple ambiguous legacy orders and already purchased configurations stop for
  review. Intentional repeat licensing needs a separate explicit scope/intent flow.
  Ordinary checkout cannot adopt a Gate D acceptance order or create a competing
  attempt for it; database guards serialize the two reservation paths.
- The shared Stripe creation adapter persists the request, UUID idempotency key,
  credential fingerprint, first-attempt time and lease before any provider POST.
  The form and API use this adapter. Retries preserve original parameters across
  process interruptions; concurrent claims stop at the database boundary.
- A known session is retrieved rather than recreated. Unknown attempts can retry
  the same key only inside 23 hours, below Stripe's documented minimum 24-hour
  retention. Older ambiguity never automatically gets a new POST/key.
  A frozen provider expiration at 23.5 hours also rejects a delayed
  dispatch from a suspended process after the provider has forgotten its key.
  Key rotation stops recovery for explicit reconciliation rather than risking another charge.
  The credential fingerprint is conservative isolation, not Stripe Connect account
  verification. Recoverable creation and evidence processing are TEST-only.
- A verified expired, unpaid session closes its pending order. Cancellation or
  visiting a return page is not proof of failed payment. Expiration webhooks and
  authenticated retry retrieval can close known attempts. A fresh reservation is
  allowed after a known closure; unknown outcomes remain retained.
- A Checkout response, session retrieval, completed-unpaid event or success-page
  visit does not fulfill a purchase. The raw signed webhook supplies evidence.
  Restricted, append-only event records reject conflicting replays, mismatched
  amount/currency/intent/session/mode and changed credential scope.
- Failed payments, refunds and disputes durably hold issuance. Existing TEST
  fulfillment contracts receive a security hold, and full refunds revoke their
  entitlements, even if the ordinary adapter capability is disabled. Adverse
  evidence and its hold commit together. Late paid events cannot clear a hold;
  stale writes cannot regress fulfilled/refunded projections.
  An append-only adverse-event inbox retains refunds/disputes before their
  PaymentIntent can be mapped. Intent-level locks serialize that receipt with
  later paid binding; a late paid event inherits the hold before issuance.
- Replaying a paid event resumes interrupted agreement generation even when an
  earlier activity entry exists. One leased job per order fences concurrent and
  expired workers. Each worker uploads to its own token-specific object without
  overwrite; an atomic database operation publishes one license and order
  projection. An interrupted/stale worker cannot replace the winning artifact or
  regress refund state through failure cleanup. Existing generated agreements
  remain immutable; amendments require the separate PK06 workflow.

## Migration and security boundary

Candidate: `supabase/migrations/20261022053950_checkout_recovery.sql`, created with
the installed Supabase CLI. Applied only in disposable local fixtures.

The migration adds `orders.checkout_closed_at`, `orders.checkout_hold`, a private
baseline watermark, attempts, verified events and agreement jobs, order/event
guards and nine public service-only RPCs. Private tables have RLS enabled and
deny browser and direct service-role table access; SECURITY DEFINER wrappers use
an empty search path, explicit service-role checks and restricted EXECUTE grants.
Order reservation independently checks the canonical persisted Buyer role.
Existing API/action authentication, ownership, rate limiting and eligibility
checks stay in place before privileged workflows.

No existing rows are backfilled or deleted. A pre-migration order lacking a known
session is not automatically adopted as a new provider operation. Duplicate legacy
orders stop rather than being silently collapsed. Existing financial references
cannot cascade through these recovery tables. The migration deliberately fails
closed on duplicate application/schema drift. Do not replay it or historical
bootstrap bundles as a migration-history repair.

Before any authorized integration: compare actual hosted columns/grants, migration
ordering, duplicate pending orders, existing agreement paths and active owners.
Review the new RPC signatures and Data API schema cache; deploy code and schema
as an approved compatible candidate. Missing RPCs cause checkout to fail closed.
Do not roll out this code alone against the unchanged hosted schema.

## Deterministic Alpha financial simulation

`lib/commerce/alpha-financial-simulation.mjs` has no provider, database, environment,
payout or production entitlement adapter. Inputs explicitly supply integer minor
units, currency, commission basis points, payee allocation schedule and policy
version. Rates and shares in tests are synthetic; none becomes a business default.
Payee allocation is not evidence of master/composition ownership or authority.

The suite covers successful/failed purchases, same and distinct duplicate paid
events, conflicting event replays, cumulative partial/full refunds, stale refunds,
adverse-before-paid ordering, disputes, exact commission/payee conservation,
deterministic residual-cent allocation, balanced immutable journal entries,
reconciliation discrepancies and synthetic entitlement suspension/revocation.
Two integration cases connect this model to the existing actual PostgreSQL TEST
contract/worker/entitlement logic, proving activation prerequisites and revocation
without commercial rights. SQL flags are enabled only in disposable fixtures.

This is an executable Alpha simulation, not the production financial ledger.
Provider fees, taxes, payee onboarding, payouts, production journal storage,
negative-balance recovery, approved economics and contributor invitation/consent
acceptance remain separate work. A dispute does not itself invent a refund amount.

## Validation

- `npm run test:unit`: core suite plus recovery and simulation regressions. The
  obsolete import-position dedupe assertion is replaced by real handler replay tests.
- `npm run test:checkout-recovery`: focused adapter, SQL, signature and model tests.
- `npm run test:purchase-foundation`: existing fulfillment boundaries, plus the two
  connected Alpha simulations included in its foundation test file.
- `npm run test:checkout-concurrency`: actual independent PostgreSQL 17 connections,
  observed lock waits, duplicate-event serialization and stale-worker fencing.
  Requires installed PostgreSQL 17 executables on PATH. Creates a private temporary
  cluster and Unix socket, disables TCP and cleans up only that owned cluster.
  No hosted URL, existing cluster or external credentials are accepted.
- `npm run test:security-pr2`, `npm run test:artist-security:gate`, typecheck, lint,
  build with inert CI placeholders and `git diff --check`.

Recorded command outputs and exact commit references accompany the completion
report. Local shims/mocks do not prove hosted PostgREST, Storage HTTP, real emails,
provider delivery or browser acceptance. Independent native PostgreSQL tests cover
connection contention separately from PGlite's single-connection execution.

## Remaining gates and recovery operations

1. Hosted migration, integration and Stripe sandbox tests require a separately
   approved isolated window. No valid provider credentials or transactions are
   used by this local suite; all production/staging commerce switches stay OFF.
2. Unknown outcomes past the retry window, changed credentials, ambiguous legacy
   orders and adverse payment holds need an operator reconciliation case. There
   is no self-service hold release, automatic provider search, or approved repeat-
   purchase intent UI. Verify provider facts before any separately reviewed repair;
   never delete references, rotate to a fresh key or clear holds to force a retry.
3. A missing webhook must be recovered through verified event replay and trusted
   reconciliation, never by authorizing a license from the browser return page.
4. Legal facts still need purchase-time versioning: independent master/composition
   authority, real parties, approved text/assent, usage scope and immutable legal
   snapshots. This package protects publication concurrency; it does not complete
   PK03/PK06 or make the current legal defaults commercially acceptable.
5. Hosted byte upload/download, orphan worker-object retention, private Storage
   policies, exact-candidate Buyer/Artist/Admin journeys and human acceptance are
   still required. Token-specific losing objects are not automatically deleted.
6. Live payments/Connect, production accounting, payout/refund approvals, legal
   review and founder stage certificates remain PK09/PK15 dependencies.

Rollback before deployment is a local code revert. After any future approved
rollout, retain attempts, evidence, job history and artifacts; use forward recovery
with capabilities disabled. Dropping tables or unfreezing financial references is
not an authorized rollback. Auth and PostHog workstreams are unchanged.

Recommended next package: PK03/PK06 purchase-time rights, legal-party and assent
snapshots, integrated with these payment/issuance boundaries; then PK08 exact-byte
delivery and authorized end-to-end acceptance. Private Beta remains NO-GO.
