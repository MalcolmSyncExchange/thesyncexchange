# PK09 financial ledger and reconciliation — local candidate

2026-10-22. Parent: `b161a2cc7b46d66b9cf417516a4566bb827e9d63`.
Branch: `codex/financial-reconciliation`. Synthetic accounting only. No hosted
migration, deployment, push, provider transaction, financial or commerce activation.

## Baseline and preserved boundaries

PK07 commits d1724da/b7f0146/0435cff retain checkout reservation, stable Stripe
idempotency, uncertain-response recovery, adverse inbox, payment proofs and fenced
license publication. PK03/06 8772e2b/b5af6ee freeze legal parties, master/composition
authority, accepted terms and allocations. PK08 64aacff and PK04 b161a2c preserve
exact approved source/variant evidence, license-specific manifests, download
identity/session/access checks, private byte integrity, revocation and audit.

The existing seven-case `alpha-financial-simulation.mjs` remains unchanged. It is a
separate earlier in-memory policy example; it is not the authoritative posting
engine. Existing `artist_transaction_records` is a TEST presentation projection.
`services/artist/finance.ts` still returns protected payout settings. Existing SEC
analytics sums remain order-value analytics, never available earnings.

No verified tier-specific commission authority exists in this candidate. The
workbook's Free/Pro/Teams entries are concepts, not executable approved policy.
PK09 does not add subscriptions or reprice historical orders.

## Accounting contract and schema

`20261022210225_financial_ledger_reconciliation.sql` follows PK04. It requires the
actual PK04 source table/function and `postgres` installer. Twelve private tables:

| Object | Purpose |
| --- | --- |
| capabilities | Synthetic posting defaults FALSE; no client write grant |
| books | One immutable original acceptance/source/allocation/currency/account/mode snapshot per order |
| accounts | Per-order, per-currency named accounting accounts |
| journals | Immutable economic event, unique `(order_id,economic_key)`, provenance and reversal link |
| lines | Signed BIGINT minor units, composite currency/order/account FKs |
| posted_events | Source payment-event acknowledgment committed with posting |
| simulation_facts | Explicit named-Admin synthetic fee/settlement/dispute/tax/payout evidence |
| simulation_policies | Explicit immutable synthetic tier, maturity and reserve contract |
| reconciliations | Immutable provider projection and discrepancy result |
| case_actions | Named operator investigation/retry/escalation/acknowledgment history |
| corrections | Reasoned restatement request, original journal and idempotency key |
| correction_approvals | Separate current Admin approval and reversal/replacement links |

All twelve tables have FORCE RLS with only the migration owner's policy, no API
role table/schema grants. All retained financial tables except the singleton
capability reject UPDATE/DELETE. The singleton is owner-controlled configuration;
there is no public enable RPC. Internal functions have empty search paths and no
API-role EXECUTE grant. Public functions explicitly revoke PUBLIC/anonymous access.

Positive lines are debits; negative lines are credits. Deferred constraint triggers
on both headers and lines enforce at least two nonzero lines and a zero exact sum
at transaction completion. Committed journals reject new lines using transaction
identity. All journal/order/currency/account relationships are composite foreign
keys. BIGINT amounts are bounded to the safe external integer range; multiplication
uses arbitrary-precision PostgreSQL NUMERIC and the pure contract uses BigInt.
No monetary float, currency conversion or cross-currency total exists.

`TSE-FINANCE-1` journal evidence binds provider account/mode, currency, original
purchase/source hashes, accepted allocation policy, refund policy and original
economic event. Purchase journals retain source payment ID, event ID/hash,
PaymentIntent, Session, provider occurrence time and receipt time. Retained FK
receipts connect subsequent cumulative refund evidence to original signed facts.

## Posting, interruption and recovery

1. The existing verified `commerce_private.payment_events` table is the durable
   source inbox. PK09 does not change the webhook, Stripe API version or signature
   processing, and introduces no independent network verifier.
2. Explicit `post_financial_order` is service-only, defaults disabled and locks the
   same order row used by payment/refund processing. It opens a book only from the
   exact original acceptance and matching contract context/hash.
3. A verified PAID fact posts gross processor receivable against the **accepted**
   platform fee and legal payee minor units. Failed, canceled/expired or pending
   purchases have no purchase journal. A success URL/order status is insufficient.
4. Event acknowledgment and journals commit together. Failure before commit leaves
   the signed source facts available; replay derives missing work. Failure after
   commit but before acknowledgment returns the same unique economic result.
5. Duplicate PAID IDs do not create another purchase journal. Out-of-order refund
   facts use maximum verified cumulative refund, not arrival order. Refund-before-
   PAID is retained and accounted when PAID proof eventually arrives, without
   restoring a license or access. Over-refunds are rejected upstream and economic
   reversals cannot exceed original gross.

`services/finance/posting.ts` provides a named-Admin-authorized server adapter to
the service RPC. No route, background scheduler or webhook activation calls it.
Pending events are recoverable by explicit retry. A later authorized integration
package must attach a bounded worker, monitoring and alerts; do not silently
enable it while merging this candidate.

## Original allocations and synthetic refund policy

Posting never recalculates commission BPS, subscription eligibility or contributor
rounding. It validates that the accepted fee plus unique identified legal payees
equals gross. The quote's nearest-fee/final-payee-residual amounts remain exact,
despite the older in-memory simulation's different floor/largest-remainder rule.

The **synthetic-only proposed** refund policy is
`proportional-floor-suspense-v1`: each original component's cumulative reversal is
`floor(original_component * cumulative_economic_loss / original_gross)`. Each
recipient reversal is monotonic; fractional-cent residuals are explicitly debited
to `refund_rounding`. At full refund all original recipients and rounding return
to zero. No unexplained cent is assigned to a different party. This policy needs
accountant/founder approval before commercial use; it is not an approved default.

Dispute creation holds access via PK07/08. It does not prove the exact provider
cash debit or fee. Explicit simulation facts separately record dispute debits,
returns (won), losses, actual processor fees/returns, settlements and tax accrual/
remittance. Losses reduce original economics once. Overlapping refund/chargeback
cash debits go to explicit `chargeback_expense`, never reverse a payee twice.
Tax fixtures model an explicitly simulated platform expense/liability, not a
decision that the platform bears actual tax or collects buyer tax in checkout.

## Obligations and payouts

Payee account balances are authoritative **synthetic** obligations linked to the
accepted legal party, not analytics estimates or live withdrawable funds. Every
reported withdrawable amount is zero and financial operations remain disabled.

Payout reservation requires an explicit immutable synthetic policy with accepted
policy version, tier label, maturity seconds, reserve BPS and approval reference;
there is no default. Maturity/reserve holds are checked under the order lock.
Current original rights/source/assent, verified payment, generated license and
existing adverse holds are rechecked. Reservation, release and simulated
settlement each append balanced journals. Related-fact identity/remaining amounts
prevent duplicate reservation consumption and cross-order correction.

Simulated settlement moves reserved liability to outbound `payout_clearing`.
It is not a bank transfer or proof of cash disbursement. This remaining liability
is included in outstanding obligations. Actual payout batching, bank settlement,
Connect onboarding, KYC, payout minimums/cadence, cross-order netting and recovery
collections remain a later authorized package. Refund after a simulated payout
records a positive payee recovery balance and explicit open discrepancy. Negative
party recovery is never hidden against other payees' outstanding obligations.

## Reconciliation and SEC operations

Nine explicitly scoped public RPCs: `post_financial_order` (service only),
`freeze_finance_simulation_policy`, `record_finance_simulation_fact`,
`reconcile_financial_order`, `record_finance_case_action`,
`propose_finance_restatement`, `approve_finance_restatement`,
`read_financial_order`, `read_financial_summary` (authenticated canonical Admin).

Each order comparator checks accepted hashes, all signed-event acknowledgments,
PAID journal presence, unpaid/pending/mismatched license evidence, active
entitlements under adverse payment conditions, every recipient/revenue allocation,
clearing, fee, settlement and dispute balances. It flags pending dispute outcomes
and party recovery. Provider account/mode/currency, gross, refunds, fees,
settlement and dispute-net-debit are compared separately; offsetting discrepancies
cannot disappear in a net total. Missing statement evidence is an explicit issue.

Synthetic projections are submitted by an identified Admin and retained; they are
not independently authenticated provider statements. The connected acceptance
tests supply independently specified synthetic projections. Actual Stripe balance
transaction import/statement authenticity and cutoff/currency/settlement reviews
remain hosted financial integration work and require separate authorization.

SEC order details now include a canonical-Admin-only financial evidence panel.
Summary DTOs partition account/mode/currency and expose gross, retained platform
revenue, refunds, unresolved disputes, outstanding obligations, party recovery and
unreconciled/unbooked orders. Raw identity/Storage credentials are not returned.
Operator actions retain reason/evidence; acknowledgment never resolves a finding.
Rerun with corrected source evidence to produce a new reconciliation result.

Corrections support independently approved **evidence restatement**: retain the
original, append its exact reversal and an exact original-evidence replacement,
then retain approver and both journal IDs. An Admin cannot approve their own
request. There is no arbitrary balance-edit/reallocation API; genuine commercial
reallocation requires a new reviewed policy/source evidence model. Every old
entry remains intact. Broader accountant adjustment classes are deliberately held.

## Validation and acceptance boundary

`test:finance` runs pure contract and connected disposable SQL scenarios. Property
coverage exhausts cumulative refunds for gross 1–124 and tests maximum safe integer
arithmetic. `test:finance-concurrency` uses real native PostgreSQL 17, real pgcrypto,
NOSUPER migration/definer owner, TCP disabled and independent sessions. It proves
precommit rollback/retry, lost acknowledgment, one purchase posting, competing
reservations, concurrent refund/posting, actual delivery denial and exact final
provider/ledger/license reconciliation. Existing source, delivery and checkout
native suites and all prior automated suites remain required.

PGlite tests use the pre-existing test-only repeated-MD5 hash shim; this is not
cryptographic verification. Native PostgreSQL uses unmodified SQL and actual
pgcrypto. Byte-copy/download fixtures and media technical results are synthetic,
not real decoder/maximum-file/browser/provider acceptance. Formal scenarios in
`pk09-qa-matrix.csv` remain Not Run. No accountant or independent security review
has been performed by running these tests.

## Integration, rollback and release sequence

1. Review the exact unpushed finance candidate and recover original commercial
   decisions: fee basis/precedence, tier effective dates, taxes/fees, rights-pool
   allocation, refund rounding/residual ownership, disputes, reserves/maturity,
   payout thresholds/cadence/negative recovery, correction and retention policy.
2. Coordinate Auth/PostHog/media owners. One migration integrator compares actual
   effective definitions, hashes and migration ancestry. Do not blindly replay
   older hosted media IDs. PK09 follows PK04, which follows the existing five
   canonical media migrations and PK07/03/06/08 dependencies.
3. Obtain explicit isolated hosted rehearsal authorization; execute PK08 H0–H5,
   private Storage/TLS/session/max-size/browser/accessibility and rollback checks.
4. Implement reviewed provider financial-proof ingestion, bounded posting worker,
   monitoring/alerts, named operator UI/recovery and independent accountant/security
   review. No real finance or provider activation is implied by this candidate.
5. Run formal rights/legal/catalog/identity, payment/ledger/delivery/recovery and
   support/incident acceptance on the exact integrated release. Invite only the
   approved cohort after explicit founder Private Beta approval.
6. Controlled Live Beta separately requires approved commercial/legal policy,
   actual provider settlement/payout handling, refund/support operations, live-key
   isolation and explicit founder authorization. Market Launch is a later gate.

Rollback: stop new posting and simulated payout admission; retain all originals,
source events, cases and journals. Use reviewed linked reversal/replacement or
source-specific correction facts. Never drop ledger tables, reset balances,
rewrite accepted economics or regenerate issued agreements. Financial posting
failure does not remove existing payment/rights holds. Existing PK08 authorization
remains the delivery authority throughout rollback.
