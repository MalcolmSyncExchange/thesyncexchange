# PK09 next implementation assignment — local-first, synthetic only

2026-10-22. Prepared from the October 21 accepted package/COM-086 and the actual
PK07/03/06/08/04 candidate. No hosted financial operations, payouts, migrations,
business-default commission policy or payment-provider changes are authorized.

## Verified starting point and gaps

- `lib/commerce/alpha-financial-simulation.mjs` / seven existing tests provide an
  in-memory balanced synthetic journal, deterministic contributor allocation,
  partial/full cumulative refunds, adverse-event handling and discrepancy checks.
  It is NOT a durable application ledger or provider reconciliation system.
- `commerce_private.payment_events`, checkout recovery verified/adverse inboxes,
  order states/history and fulfillment jobs provide durable TEST payment facts.
  Their event IDs/scopes, amount/currency and payload hashes must be preserved.
- `licensing_private.acceptances` freezes actual accepted commission BPS, policy
  version, fee minor units, payee IDs and allocations; PK04 adds exact source trace.
  `order_delivery_contracts`, generated licenses and entitlements share the order
  and original purchase hash. Downloads never post earnings.
- `artist_transaction_records` and the transaction-projection worker are TEST
  reporting projections, not authoritative earnings, payable obligations or
  withdrawable balances. `services/artist/finance.ts` returns protected payout
  settings only. Receipts remain separate from invoices and accounting journals.
- No verified durable balanced journal/accounts/lines, payables maturity, payout
  batches, settlement reconciliation, controlled corrections or accountant
  acceptance exists in this candidate. Do not mark PK09 complete from simulation.

## Frozen integration contract before implementation

One finance owner defines a versioned event envelope containing source provider
account/mode/event identity/hash, order ID, original purchase/source hashes,
verified status, currency, gross, cumulative refund, actual provider fee/tax,
provider occurrence/receipt timestamps and correction/reversal linkage. Derive
all amounts/parties from trusted proof + accepted snapshot; no client amounts,
analytics, active catalog prices or mutable subscription policy after purchase.

PK07 retains provider verification/retry/fencing and adverse state authority;
PK03/06/04 retains rights/parties/fees/splits/source snapshots; PK08 retains access
revocation. Finance posts obligations, never independently grants a license or
removes a payment/rights hold. Freeze the API before touching shared webhooks.

## Dependency-ordered work packages

| Package | Local scope / owned files and DB | Tests and acceptance |
| --- | --- | --- |
| PK09-A policy contract | New `lib/finance/` pure minor-unit calculation/rounding; versioned allocation/fee/tax DTOs | Accepted schedule validates completely; no floating point; sums conserve every cent, identical inputs reorder deterministically; currency partitions never mix |
| PK09-B durable journal | New private accounts, journal headers/lines, event inbox/posting cursor, immutable policy/allocation references; single migration integrator | Balanced journals enforced at DB transaction commit; one economic event/order transition posts once under concurrent sessions; conflicting duplicate payload rejected; crash/retry atomic |
| PK09-C liabilities/adjustments | Separate rightsholder/seller liabilities, platform revenue, processor receivable/clearing, fees/tax liabilities and reserves; no generic writable balance | Allocations sum to net; configurable maturity/holds; held/disputed earnings excluded from available; accounting party IDs reconcile to accepted legal parties |
| PK09-D refunds/disputes | Append proportional/final-residual reversals linked to original lines; dispute reserve, actual fee, outcome/recovery facts; no original deletion | Partial/full/cumulative/out-of-order events, over-refund, duplicate chargeback, won/lost dispute and already-paid-party recovery; no double reversal or negative unsupported balance; access remains PK07/08-controlled |
| PK09-E reconciliation | Local deterministic provider/ledger/contract comparator, discrepancy cases/resolution history, finance-only read DTOs | Gross, fees, refunds, disputes, settlements, payables and payout obligations reconcile per currency/account/mode; missing/extra/mismatched events visible; totals cannot hide offsetting errors |
| PK09-F corrections/ops | Named canonical Admin command with recorded reason/evidence, original/reversing/replacement linkage and idempotency; approval separation | No backdated silent rewrite or direct balance setter; unauthorized Artist/Buyer/service call denied; reviewer identity and approval audit required for sensitive corrections |
| PK09-G connected Alpha simulation | Real disposable PG17 journal + current canonical source/rights/assent/checkout/payment/license/delivery lifecycle, using deterministic synthetic events only | Every journal balanced, replay/concurrency/crash safe, snapshot hashes exact, liabilities and access match event state; formal hosted QA still Not Run |

Proposed names are design scope, not existing tables. PK09-A may proceed locally
while the hosted rehearsal waits, using explicitly labelled synthetic policies.
B depends on reviewed A/envelope and shared schema contract. C/D follow B; E and
finance read UI may proceed on the frozen DTO after B. F requires the operator
approval model; G integrates all before Alpha/Private acceptance. One DDL owner
serializes migrations; no concurrent uncontrolled shared-infrastructure changes.

## Founder/accountant controlled inputs

Recover the original economics selections, commission basis (gross versus net
processor fees), subscription effective date, payment fees/taxes responsibility,
per-rights-pool distribution, rounding/residual ordering, refund fee recovery,
dispute costs/outcomes, reserves/maturity, payout threshold/cadence/minimums,
negative-balance recovery, correction approval separation and retention rules.
Counsel/accountant must review commercial treatment before live. No illustrative
percentage is a production default. Explicit synthetic cases may proceed without
inventing approvals; mark unresolved real policy Needs Verification.

The accepted blueprint includes the Pro example $1,000 gross / $30 fee → TSE $135 /
rightsholders $835. Preserve it as a source-labelled reconciliation fixture after
verifying original fee precedence; do not silently replace the current synthetic
engine's gross commission formula. PK03 quote rounding uses nearest fee plus final
payee residual; the existing simulation uses floor commission and largest remainder
allocation. That discrepancy MUST be reconciled explicitly. Production posting must
use accepted frozen minor-unit allocations, not recalculate them under another
engine. New quote policy revisions require approval/versioning, not historical edits.

## Codex branch and integration boundary

Start isolated `codex/financial-reconciliation` from the final integrated PK04
commit. Own new `lib/finance/`, `services/finance/`, finance tests/docs and additive
private finance migrations. Preserve Auth/PostHog, source/media, existing checkout
and download adapters. Freeze the posting/read DTO with those owners; use one
small adapter change at integration. Likely merge conflicts: package scripts,
DB type generation, migration inventory, webhook orchestration and admin orders.
Never integrate each stream's separate migration assumptions simultaneously.

## Evidence and Definition of Done

Run existing unit/security/typecheck/lint/build, original checkout/delivery/source
native contention suites plus new non-superuser/role/RLS/accounting/concurrency
regressions. Add deterministic/property tests across amounts, currency precision,
fee boundaries, every contributor ordering and cumulative refund boundary. Show
failure before commit, after provider event persistence, after posting but before
acknowledgment, during payout reservation and on correction retry. No real bank or
provider call. Preserve seven current pure simulation assertions and clearly
separate them from the connected durable simulation result.

Required artifact: exact committed source/migration hashes, schema/grant review,
scenario → event → journal → payable → license/entitlement → discrepancy trace;
zero unexplained imbalance/over-refund/duplicate payable; synthetic reconciliation
fixtures and independent finance/security review. No Artist amount called payable
or withdrawable without this authority. Full payouts, tax invoices, live settlements
and hosted acceptance remain separately authorized later packages.

Rollback stops new posting/payout admission, retains original evidence and uses
reviewed reversing entries to correct erroneous journals. Never reset balances,
drop the ledger, delete events or silently restate issued licenses. Private Beta
still needs COM-086's connected simulation plus approved human/release gates.
