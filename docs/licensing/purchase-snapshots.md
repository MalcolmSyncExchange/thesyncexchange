# PK03/PK06 purchase-time rights and legal acceptance

> System 07 update (2026-10-24): the active agreement worker now embeds pinned Unicode fonts, preserves international legal names and exact accepted receipts, and checks active sessions for legal reads/assent/downloads. The prior PDF limitation described below is historical; see `docs/licensing/system07-contract.md` and `docs/licensing/system07-local-acceptance.md`. Commercial legal approval and hosted/formal acceptance remain outstanding.


Local candidate based on PK07 commits d1724da, b7f0146 and 0435cff and the accepted
October 21 blueprint. No hosted change or commercial activation is authorized.

## Trust and data model

`20261022165929_purchase_legal_snapshots.sql` introduces an unexposed
`licensing_private` schema. No real rights, evidence, legal approval, fee policy,
offer or acceptance is seeded. Legacy catalog approval does not establish rights
clearance. Legacy pending orders without acceptance require reconciliation rather
than fabricated backfill. Existing issued artifacts remain historical records.

Six immutable record types and mutable pointers/revisions serve separate roles:

* `evidence`: a canonical Admin's explicit review reference, private Storage object
  identity/version/size, declared content SHA-256 and validity deadline. The reviewer
  must actually inspect the document and verify its hash and authority; metadata
  alone cannot prove a mandate. No public document URL is returned to a buyer.
* `offers`: separate master and composition ownership/control pools, identified
  parties, seller account, recording/work identifiers, evidence references,
  permitted uses, territory, dates, exclusions and outside-clearance responsibilities.
  Both ownership and documented control independently total 10,000 basis points per
  pool. Ownership is not payee allocation. Manual scope-specific review remains necessary.
* `status_events`: append-only irrevocable withdrawal/dispute of an offer or evidence.
  Restoring eligibility requires a new reviewed version; there is no clear-hold command.
* `quotes`: immutable transaction schedules containing identified Buyer party and
  representative/capacity, authenticated account email, project/use/territory/dates,
  seller/rightsholders, identifiers, review evidence hashes, exact legal text/version,
  gross cents/currency, included commission, explicit contributor allocation and
  approval/policy references. New quotes expire in 30 minutes.
* `acceptances`: one original quote/order association, server-observed time,
  authenticated Buyer, representative/capacity/intent, exact required consents,
  document and schedule hashes, optional Supabase session ID and complete snapshot.
  This is an authenticated click acceptance record, not KYC, a cryptographic signature,
  proof of scrolling/reading or a rightsholder countersignature. No IP fingerprint is collected.
* Existing generated licenses incorporate the exact purchase and hash. Completed
  artifacts cannot be updated/deleted; access timestamps may change. No amendment
  workflow or historical regeneration is introduced.

`offer_heads` controls versions available for new acceptance. `rights_revisions`
increases on legacy ownership/authority, seller, recording-source and moderation
changes. Reverting an edit does not restore a stale clearance. Reviewed evidence
Storage version/path/content metadata cannot be overwritten or deleted. A new review
must independently cover all necessary use-specific mandates and exclusions.

## Explicit review commands

`services/licensing/review.ts` requires the canonical Admin session before acquiring
a privileged client. Its service-only SQL commands independently verify the supplied
actor is still a persisted Admin. They register evidence, publish a fully explicit
reviewed offer, or append a reasoned withdrawal/dispute. These are callable server
commands for later SEC integration; no production approval UI or automation is activated.

Publishing requires a full legal document with version, exact body, declared platform
role, approval reference, acceptance deadline, issuance deadline and transaction-specific
required consent statements. No code assumes TSE is licensor, chooses a jurisdiction,
adopts a commission default or approves a draft. Qualified legal/founder approval and
real evidence must precede any commercial use. Scope has explicit responsibility
records for public performance, distribution, samples, performer/likeness and other
permissions. The reviewer owns correctness of those records.

Fee arithmetic is integer-only: included platform commission rounds half-up to cents;
payees receive floor allocations of the remaining amount, with the last declared payee
receiving the residual cents. This rule and the explicit allocation order are frozen.
It records an approved schedule; it does not implement a production ledger, taxes,
provider fees, payee consent, Connect/KYC or payout accounting. Founder approval of
the actual rounding/economics policy remains necessary before publishing real offers.

## Buyer and recovery workflow

1. Canonical Buyer enters a legal party, address/jurisdiction, company registration
   where applicable, representative/capacity and exact requested usage. Eligible
   use/territory codes are shown for each reviewed license. Server and database
   rate limits apply. The database derives the account, seller, terms and price.
2. Buyer sees the exact schedule, both rights pools, restrictions, outside clearances,
   included fee, versioned legal text and hashes. The complete schedule and allocations
   are available for inspection. Buyer confirms every specific consent, their name
   and the transaction-specific acceptance statement. There is no default consent.
3. Authenticated SQL creates the pending order and immutable acceptance atomically.
   The same accepted quote returns the same order; competing quotes cannot replace
   an open accepted transaction. The old PK07 Buyer/track/license lock is shared.
4. Provider creation requires original valid acceptance. PK07 retains its frozen
   provider request/key/lease and 23-hour unknown-outcome recovery. Prices and terms
   cannot silently change. Accepted orders are retained even on pre-provider failure.
5. Signed payment evidence remains the authority for payment. Legal acceptance or
   API success never marks a purchase paid. PK07 retains adverse events, retries,
   amount checks, immutable bindings and publication fences.
6. Agreement job claim, final license insertion, entitlement activation and existing
   delivery eligibility independently require accepted facts, verified paid evidence,
   no hold, valid scope/evidence and a compatible rights revision. The final database
   transaction locks the review and track, serializing ownership changes/revocation
   with publication. Refunds/disputes do not rewrite the acceptance or imply legal termination.

A superseded offer cannot receive new assent. An already accepted version can issue
under its original text if it remains valid, unwithdrawn and within its issuance
deadline. A new review with a changed rights schedule invalidates older pending
clearances even if the legacy ownership list is unchanged. A monotonic per-offer
rights generation prevents a later reversion from reviving an older acceptance;
recovery never rebases that acceptance.
Expired usage/terms/evidence, incompatible rights changes and adverse payment
states block issuance. No updated template or rights review substitutes for the original.
After a valid withdrawal the old record remains readable by its Buyer for history.
Recovering an invalid paid transaction needs a permissioned operator/counsel decision;
this package neither clears holds nor automatically refunds or creates amendments.

## Artifacts and permissions

Agreement generation uses `buildAcceptedPurchaseLicense`, never current catalog,
profile or generic legal presets. Exact Unicode legal text and full schedule are
retained in the HTML and JSON. The existing PDF renderer uses standard fonts: its
complete receipt appendix uses reversible JSON Unicode escapes, rather than dropping
non-ASCII source characters. Native typographic Unicode PDF output remains a documented
presentation limitation requiring acceptance before a broad market release. PDF and
HTML SHA-256 values are recorded separately from the accepted-content hashes; neither
is represented as a digital signature. PK08 must verify delivered bytes against them.

Private records deny direct browser and service-role table access. Narrow public
wrappers distinguish canonical Buyer commands from service-only review/issuance.
Buyer reads bind `auth.uid()` to ownership, including after invalidation. No metadata
role, client price, client actor ID or public Storage path establishes authorization.
RLS is enabled as defense in depth, and every SECURITY DEFINER function has an empty
search path and restricted EXECUTE. Evidence/acceptance foreign keys intentionally
prevent deleting retained transaction/legal history; account erasure and retention
policy need an approved operational process.

## Verification and integration

`npm run test:purchase-legal` covers eligibility, scope, parties, exact assent,
expiry/supersession, immutable history, cross-account denial, duplicate events,
refunds, disputes and frozen artifact creation. It is included in `test:unit`.
`test:checkout-concurrency` also exercises actual independent PostgreSQL connections
for same-quote acceptance and a rights writer contending with issuance. Existing
PK07 tests use explicit synthetic legal fixtures; one pre-provider cleanup expectation
is strengthened to retain an accepted order. No production acceptance bypass is added.

Before separately authorized integration, reconcile both PK07 and this migration with
the actual hosted schema, Auth/PostHog owners, private Storage effective permissions,
service RPC grants and schema cache. Missing RPCs fail closed. Do not deploy code alone,
apply a migration history repair, invent historical acceptance, regenerate old
agreements or drop legal/evidence tables as rollback. Keep commerce flags disabled.

Local automated PASS is not hosted/browser/provider acceptance, legal approval or a
stage certificate. Private Beta and Controlled Live remain NO-GO pending the critical
path and founder approval. See `pk08-secure-delivery-plan.md` for the next package.
