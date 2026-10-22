# Verified financial ingestion and recovery — PK09 continuation

2026-10-22. Local engineering candidate based on
`3e9d1943ec9f7b1e5d63b2f039860fc1df0ec1c0` and the October 22 PK09 report.
No hosted migration, configuration, scheduler, financial operation or commerce
activation is authorized or performed. PK07/03/06/08/04/09 history is preserved.

## Source and authority boundaries

The existing Stripe webhook already verifies the original raw-body HMAC, deployment
mode and rejection of Connect events. Ordinary checkout/payment/adverse processing
remains authoritative for payment state and license issuance. The new optional
finance capture executes after those authenticity checks and before the switch.
Capture failure still permits the original PK07 payment/adverse handling, then
returns 500 so Stripe retries missing durable capture. Capabilities default OFF;
the old route does no new finance work without the explicit flag.

Financial capture independently rechecks the real Stripe SDK signature, 300-second
tolerance, TEST mode, platform scope, supported schema and bounded raw body. The
ingress does not trust a browser's order, price, amount or payment claim. The server
service client alone calls admission. The database checks registered credential
and signing-secret fingerprints; no secret or signature is stored or returned.
Original raw bodies, event IDs, economic summaries, endpoint identity and receipt
timestamps remain private and immutable.

An approved immutable endpoint registry identifies the expected Stripe account and
credential/signing scopes. No endpoint row is installed by the migration. Its only
mutable field is enabled. Credential rotation creates a new approved registry
identity; a new enabled same-account worker can recover old pending evidence while
the original ingress identity remains intact. Account/mode isolation still applies.

The worker authenticates read-only provider API requests using the existing pinned
Stripe SDK/API contract (`2024-06-20`), retrieves its account identity, retrieves the
original Event and compares its economic summary, then reads the associated
PaymentIntent, Charge, successful Refunds, Disputes and actual BalanceTransactions.
It validates object/source relationships, exact amount/fee/net arithmetic, currency,
pagination and absence of unsupported FX. No charge/refund/transfer/payout mutation
API is called. A successful API request alone never establishes a purchase.

## Supported scope and retained exceptions

Supported trigger events: `checkout.session.completed`,
`checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`,
`checkout.session.expired`, `charge.succeeded`, `charge.updated`, `charge.refunded`,
`charge.dispute.created`, `.updated`, `.closed`, `.funds_withdrawn` and
`.funds_reinstated`. Session/intent/charge identities resolve only existing canonical
order bindings. Metadata hints can veto a mismatch; they cannot create or select an
otherwise unbound order. Pending bindings/payment evidence retry, then dead-letter
for investigation if they remain unavailable.

The bounded provider profile supports same-currency Charge/Refund/Dispute cash
movements (`charge`, `refund`, `adjustment` balance types), actual fees and fee
credits, partial/full refunds and dispute debit/return/loss. Other payment-method
balance types, FX, failed refund reversals, Connect, LIVE, transfers, payouts, tax
collection and cross-order settlement allocation require separately reviewed
adapters. Unsupported signed event types remain recorded with an unsupported state
and alert, perform no posting and are safely acknowledged by the existing route;
malformed/authentication failures are rejected. Nothing is silently discarded.

Default limits: 256 KiB raw body, 200 KB provider proof, 1,000 balance rows, at most
1,000 successful refund records and 100 disputes per proof. Larger/incompatible
evidence is retained or dead-lettered for operator review; it is not truncated into
an apparently reconciled transaction. Published API-version/real-provider shape
compatibility remains a hosted rehearsal requirement.

## Additive database architecture

Migration `20261022213225_financial_ingestion_recovery.sql` follows the exact PK09
candidate. It adds ingestion/worker flags default FALSE, twelve private FORCE-RLS
tables, two private security-invoker views and six explicitly scoped public RPCs.
No Storage or hosted data changes, backfill or public table grants occur.

| Private object | Purpose |
| --- | --- |
| provider_endpoints | Approved immutable account/key/signing identity; OFF unless explicitly installed/enabled |
| provider_events | Original event ID/body/hash, semantic summary and signature-verification method |
| provider_deliveries | Retained distinct raw deliveries of the same economic event |
| provider_conflicts | Conflicting signed economic evidence, never an overwrite |
| provider_jobs | Durable pending/leased/retry/posted/dead/conflict/unsupported processing state |
| provider_attempts | Append-only claims, outcomes, lease expiry and safe error codes |
| provider_fetches | Immutable authenticated API evidence and proof hash |
| provider_balances | Immutable economic BalanceTransaction identity unique per account |
| provider_effects | Once-only fee/dispute accounting effects linked to proof |
| provider_reconciliations | Automatic immutable comparison and exception history |
| provider_alerts | Durable conflict/dead-letter/mismatch/unbalanced/reconciliation alerts |
| provider_operator_actions | Named canonical Admin actions with reason, evidence and idempotency |

All retained evidence rejects UPDATE/DELETE. Jobs and enabled/configuration flags
are mutable internal control state with no client grants. The private all-effects
and all-reconciliations views combine the earlier explicit simulation evidence and
the new authenticated evidence without exposing them. Provider-backed books reject
subsequent simulated facts, and the worker rejects earlier mixed simulated books.
There is no arbitrary amount or balance-edit RPC.

Six new RPCs: `ingest_financial_provider_event`, `claim_financial_provider_job`,
`finish_financial_provider_job`, `fail_financial_provider_job` (service only),
`act_on_financial_provider_job`, `read_financial_provider_operations`
(authenticated canonical Admin only). Existing PK09 posting/comparator/read and
simulation functions retain OIDs/guards with narrow evidence-source amendments.
PK04's original issuance guard gains an additional adverse-provider check.
Migration body markers fail closed if the expected predecessor definitions drift.

## Queue, atomic posting and recovery

1. Admission atomically persists original evidence and a durable job. Duplicate
   semantic events do not enqueue another job. Distinct serialization is retained
   as another raw delivery. Conflicting semantics retain both versions, quarantine
   the original job, alert and conservatively hold a known order.
2. Claims use `FOR UPDATE SKIP LOCKED`, a random token, 90-second expiry and at most
   eight attempts. An abandoned lease becomes retryable; an exhausted abandoned
   lease becomes dead with a retained alert. Successful old orders are periodically
   revisited after five minutes for later fulfillment changes.
3. The worker retrieves the full bounded provider evidence outside the transaction.
   Missing canonical payment or unmapped order evidence remains pending rather
   than fabricating an order/payment or granting access.
4. Completion rechecks active endpoint, account/mode, original event, lease/token,
   immutable acceptance/contract and canonical source proof. It serializes on the
   original event/job and the same order used by PK07.
5. Existing PK09 purchase/refund posting, once-only actual fee/dispute effects,
   provider evidence, reconciliation, attempt audit and posted status commit
   together. Deferred balance constraints are explicitly checked before success.
   Failed posting rolls back all economic writes and retains a retry/dead outcome.
6. Duplicate events cannot repeat purchase earnings, payee obligations or a fee.
   Balance IDs and source/sign economic identities cannot be reassigned. An API
   contradiction keeps original records and stores rejected proof privately.
7. Retry delay is 5 × 2^(attempt−1) seconds, capped at one hour; eight attempts are
   the default limit. Unknown acknowledgment is resolved by fenced replay/lease
   recovery, never by assuming an API call or response completed posting.

Current original accepted fee/payee amounts remain authoritative. Actual provider
fees/credits affect processor clearing/fee accounts; they do not reprice accepted
earnings. Refund and chargeback principal use original economic allocations once;
overlap is retained as explicit expense. Commercial fee/tax responsibility, original
tier policy and the synthetic refund-residual proposal still require approval.

Financial processing never creates a license, entitlement or payout. Signed adverse
finance evidence holds an already known order immediately. The retained original
event also fences issuance/delivery after an initially unknown intent becomes
bound, including when the ordinary dispute-created webhook has not arrived.
Accounting a won dispute never removes those holds. Unpaid or failed transactions
cannot create an authorized license through this path.

## Automatic reconciliation and THE SEC

The comparator checks original purchase/source hashes, order/payment bindings,
acknowledged proofs, gross/refunds/fees/disputes, each accepted payee and platform
allocation, clearing, outstanding obligations, generated license hash, adverse
entitlements and pending license-specific delivery activation. Provider totals are
derived from authenticated economic evidence, independently of journal balances.
Offsetting errors cannot disappear into a net total. Fees and disputes come from
actual provider evidence; settlements remain zero/unattributed in this adapter.

`/admin/finance` provides current pending/posted/retry/dead/conflict counts, queue
age, due/lease/attempt information, current reconciliation exceptions and retained
attempt/alert history. Dead/conflict/retry jobs receive review priority. Safe DTOs
exclude raw bodies, signing/key fingerprints, lease tokens, rejected proof and
Storage credentials. Role checks occur in both server services/actions and SQL.

Named Admin commands retain a required reason/reference and stable request ID.
Retry and reconciliation refresh reset admission state, never economic evidence.
A conflicting event cannot be silently retried as a chosen version. Acknowledgment
does not clear a finding or payment/rights hold. Existing independent-review
restatement commands are presented with proposal history; a different current
Admin must approve the retained exact reversal/replacement pair.

## Worker runtime and monitoring status

The unscheduled `POST /api/internal/finance/worker` requires a dedicated >=32-char
bearer secret before any processing. App flags, TEST server credentials, isolated
environment, an approved active database endpoint and database capabilities all
fail closed. A run is bounded to three claims / a 20-second read budget; provider
reads have a five-second per-request timeout and no SDK automatic retry. The
aggregate deadline stops processing after a slow read; a remaining read-only
request cannot later perform posting.

`npm run finance:worker:once` and `finance:worker:watch` call the authenticated
worker endpoint; watch polls every five seconds with failure backoff and stops after
three consecutive endpoint failures. They are not executed by this assignment.
Remote endpoints require HTTPS; loopback HTTP is supported for local tests. No
Netlify schedule, deployment or shared secret is installed. `.env.example` contains
only OFF/empty placeholders.

Implemented monitoring: durable database alerts, attempt history, current SEC
exceptions, queue age and redacted worker counts/failure signals. External alert
delivery, hosted scheduler liveness/queue SLOs, recipients and on-call ownership
are **not configured**. Do not describe a local alert table or `console.info` as a
working hosted paging service. An authorized rehearsal must test stopped workers,
revoked credentials, prolonged backlog, dead letters and alert acknowledgment.

## Test and review evidence

The new suites use the real Stripe SDK HMAC verifier with synthetic secrets and
injectable read-only provider API doubles, actual disposable SQL and native PG17
with real pgcrypto/NOSUPER definer owners. Native sessions prove duplicate capture,
exclusive lease, rollback, concurrent completion, stale-token rejection and exact
final accounting. Prior PK07/03/06/08/04/09 suites remain intact. PGlite's existing
digest shim is only a fixture; native tests verify raw SHA-256 against Node crypto.

Formal scenarios in `pk09-ingestion-qa-matrix.csv` remain Not Run. Local automated
success does not establish a real Stripe endpoint/account binding, hosted database
compatibility, production readiness or independent accounting/security approval.

## Remaining hosted integration and acceptance

1. Independent review of exact source/migration, canonical role/secret boundaries,
   append-only/accounting invariants and commercial policy. Retention and rejected
   evidence access require an approved policy; no automatic deletion is introduced.
2. One integrator compares the full eleven-file dependency/hash manifest with the
   actual isolated host. Do not replace effective functions based on migration IDs
   alone or copy ongoing Auth/PostHog changes.
3. Obtain explicit founder authorization for isolated hosted SQL/configuration,
   account/secret registration, deployment and TEST provider rehearsal. Use separate
   sandbox identities; preserve production/commerce OFF holds.
4. Configure and verify the exact endpoint secret/account/API version, worker
   identity/TLS, schedule, read-only API permissions, bounded concurrency and alerts.
   Exercise retries/out-of-order/unknown acknowledgment and stopped-worker recovery.
5. Complete exact-candidate PK08 Storage/broker/browser/accessibility rehearsal,
   rights/legal/catalog/contributor assent and operator/incident acceptance. Obtain
   founder stage approval separately. Private Beta is not Controlled Live or Market.
6. Later separately reviewed adapters cover FX/other balance types, actual bank
   settlement/payout allocation, tax/invoices and broader adjustments. No genuine
   financial operation is authorized by this candidate.

Rollback stops webhook finance admission/worker scheduling and disables new claims;
retain original evidence, queue states, attempts, alerts and journals. Existing PK07
payment/adverse handlers and PK08 access guards remain. Use independently reviewed
append-only corrections; never delete/rewrite proof, reset balances or automatically
release a held license. In-flight stale completion must fail its lease/capability
checks. Rehearse rollback and data continuity before enabling any hosted path.
