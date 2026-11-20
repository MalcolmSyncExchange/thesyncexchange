# Financial portal release — 2026-11-20

## Scope and current evidence

This release improves the read-only financial experience. It does not declare
marketplace payments, recurring subscriptions, or real payouts ready for use.
It starts from production commit `f3eb1cb2d228bdecd517cdbf600513cd46fecabc`
and preserves its Rights & Ownership workflow.

Read-only production inspection confirmed the existing authenticated accounting
and operations RPCs. Production has zero accounting books, journals, and payout
requests. Synthetic posting, financial ingestion, and the financial worker are
disabled in database capabilities. No zero cash balance or currency is inferred
from those absent records. The connected Stripe TEST sandbox has no active
recurring prices (complete list, `has_more=false`). Live Stripe was not queried.

## Application changes

- Artist Finances shows exact recorded net allocations, unposted expectations,
  holds, losses, recovery, commissions on managed sales, actual paid amounts, and
  available amounts by original currency. Only explicitly attributed allocations
  enter artist earnings. Managed-sale commission is not the artist's own earning.
- All-transaction totals use one database snapshot through the existing RPC,
  bounded at 50 transactions. Larger accounts see totals unavailable and retain
  paginated transaction and payout history. A dedicated aggregate RPC is needed
  before claiming scalable lifetime totals; summing changing pages is unsafe.
- Artist statements export the selected authorized transaction page, original
  currency minor units, and explicitly TEST accounting basis. Other contributors
  are excluded. CSV formulas are neutralized. Responses are private/no-store.
- Buyer Billing links to the existing authorized purchase/refund history and
  billing details, and displays invoices separately. Provider outages are visible
  and never rendered as empty invoice history. Unexpected authentication, database,
  session, ownership, and mapping errors remain failures with safe diagnostics.
- Invoice money respects currency exponents, Stripe ISK/UGX API exceptions, and safe integer amounts. Receipt
  links require HTTPS and an allowlisted Stripe hostname without URL credentials.
- THE SEC accounting links to failures, disputes, financial discrepancies,
  subscription oversight, transaction journals, and retained audit history.
  Historical gross volume and reversed commissions are distinguished from net
  marketplace profit. Subscription revenue remains unavailable rather than zero.
- Approved subscription prices are displayed as Pro USD 19.99/month and Teams
  USD 49.99/month. The portal cannot activate a recurring charge. Administrative
  grants do not establish provider billing or paid-subscription status.

## Execution gates

Production Checkout creation (API, shared legacy creator and Gate D acceptance)
and its UI default closed unless the server-only
`SYNC_EXCHANGE_MARKETPLACE_CHECKOUT_ENABLED` is exactly `true`. This flag is an
additional gate, not evidence that other release checks have passed. Do not set it
without separate payment release approval. Existing verified webhook delivery and
retry processing remain unchanged so historical obligations can still settle.

No migrations, commission rates, payout destinations, provider routing, Stripe
settings, subscription activations, or financial calculations are changed.
Real disbursements remain unsupported. Billing portal ownership and its existing
runtime gate are retained.

## Validation

- Full unit suite: 2,173 passed, zero failed, zero skipped; includes existing
  payment, duplicate-webhook, partial/full-refund, dispute, allocation, reporting,
  authorization, and multi-currency regressions.
- Focused portal/invoice/payment tests: passed, including actual loader and route
  execution for Auth HTTP 500, SQLSTATE 42501/XX000, revoked sessions, provider
  outages, missing provider configuration, empty history, and closed Checkout.
- Actual server-page rendering in Chromium with synthetic readers: Artist and
  Buyer screens, unavailable/empty invoice distinction, JPY exponent, statement
  link, and no horizontal overflow at 390/1280px passed.
- Typecheck and production build passed. Lint passed with the existing React Hook
  Form compiler warning in the unchanged Submit Music form. Diff checks passed.
- `npm run test:finance-concurrency` failed in pre-existing native fixture setup:
  a later migration requires CREATEROLE after the harness strips that privilege.
  It did not reach financial concurrency assertions. No schema or ledger posting
  code was changed to work around this. Embedded PostgreSQL accounting tests pass.

## Outstanding financial release blockers

1. Reconcile authoritative provider payments to the existing ledger and establish
   complete, verified ingestion before interpreting records as operational cash
   accounting. Existing capabilities remain disabled.
2. Establish an approved isolated TEST environment and prove end-to-end Checkout,
   webhook routing, fulfillment, refund, dispute, and duplicate delivery behavior
   there. This release generates no provider events or financial transactions.
3. Implement and qualify provider-backed recurring subscription lifecycle,
   approved price bindings, customer ownership, renewal/failure/cancellation and
   plan-change processing, and gated billing portal flows. The current SEC module
   stores administrative observations; it is not recurring billing. No live
   charge is authorized. Renewal, cancellation, and plan-change acceptance tests
   cannot truthfully pass against an unimplemented provider lifecycle.
4. Implement and independently qualify a real payout provider, reconciled payout
   statements, maturity/reserve controls, and payout reconciliation before enabling
   withdrawals or labeling simulated completion as payment.
5. Provide an aggregate artist summary RPC before accounts exceed the bounded
   single-snapshot report, and repair the independent native concurrency harness.

## Founder review routes

- `/artist/earnings` — artist account required.
- `/buyer/billing` — buyer account required.
- `/admin/accounting` — current authorized administrator with MFA required.
- `/admin/analytics/financial` and `/admin/finance` — existing reporting and audit.

Production publication requires passing CI for the exact feature revision and its
production merge. The deployment ID and hosted verification belong in the release
completion report; a local build is not a production deployment.
