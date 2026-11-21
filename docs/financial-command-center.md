# SEC Financial Command Center

`/admin/accounting` is the executive overview. Focused views preserve the same date, currency, payment status, source, account and mode filters. Existing reviewed policy, identity and synthetic payout-preparation controls remain at `/admin/accounting/controls`; provider recovery remains at `/admin/finance`.

## Reporting basis

This is **sales-cohort reporting**, not a cash-flow statement. A sale belongs to its first recorded paid date, or its opening date while unpaid. The selected end date is inclusive in the UI and exclusive at the following UTC midnight in SQL. Current financial status and ledger balances are evaluated through that cutoff. The preceding equal-length period uses its own cutoff; later refunds do not leak into that historical comparison.

- Gross marketplace volume: original amounts for verified paid orders, before refunds. Pending and failed orders do not contribute.
- TSE revenue: retained platform commission after recorded ledger reversals. It is not net profit or gross buyer payment volume.
- Artist earnings: net accruals across contributor payable, reserved and payout-clearing accounts, after reversals. Not withdrawable funds.
- Outstanding obligations: positive outstanding liabilities per retained payee/account, within the selected sale cohorts. Recovery receivables do not offset unrelated payees.
- Refunds: maximum cumulative recorded refund per order at the cutoff; duplicate observations are not summed.
- Dispute exposure: retained dispute receivable balance. An open dispute is not automatically a final chargeback loss.
- Payment success: orders with a recorded capture divided by recorded resolved orders (captured plus failed without capture). Refunded/disputed captures remain original successes; unresolved orders are excluded. This is not a provider-wide payment-attempt conversion rate.
- Reconciliation: a retained matched result at least as recent as the last selected journal. Missing or stale evidence is “Review needed,” not proof that money is missing.

All monetary aggregation happens in PostgreSQL using integer/numeric arithmetic, returned as exact decimal strings. Currency totals are never combined or converted. Chart geometry uses bounded ratios; labels and exports retain exact minor units. Zero intervals are filled only for an actually recorded currency within an available source. Unknown source coverage is not a zero line.

## Unavailable dependencies

Provider-backed recurring billing is not activated/verified, so subscriber counts, MRR, ARR, renewal failures, churn and cancellation history are unavailable. Real payouts and available cash require an operational payout adapter and reviewed maturity/identity controls; simulations are never displayed as real completed payments. Live-mode reporting is unavailable in the existing TEST-only financial foundation. This change enables none of those systems.

The revenue chart represents marketplace commission by sale cohort, after reversals at the selected cutoff. Revenue composition does not invent a subscription amount or claim a 100% marketplace share while subscription revenue is unavailable.

## Pagination and search

The new read-only RPC aggregates the complete filtered cohort before applying transaction search and a stable `(occurred_at DESC, order_id DESC)` page of 25 rows. Search narrows the explorer, not executive metrics. No 50-row lifetime cap or client-side full-history download is used. CSV export is explicitly the current page, in minor units, with spreadsheet-formula neutralization.

## Security and installation

Migration `20261121020629_sec_financial_command_center_read_model.sql` creates only two read functions. The private helper has no client grants. The public RPC permits only authenticated callers and invokes the existing full-admin/MFA/active-session database guard. It adds no table grants, policies, financial writes, triggers, backfills, provider calls or activation flags. The application authorizes before creating the authenticated SSR reader. Returned and thrown provider/database failures become a safe error state, never empty or successful history.

Apply the exact reviewed migration to production only after founder approval. Its complete SQL is the migration file; no other pending migrations should be applied as part of this release. The old application does not call the new RPC, so installation can precede the approved application publication. Existing financial functions and semantics remain unchanged.

## Validation limitations

The local native accounting runner requires `TSE_SUPAUTILS_LIBRARY`, a verified `TSE_SUPAUTILS_SHA256`, and pinned media tools. Without those it refuses to run; there is no storage-authority fallback. PGlite integration tests replay the exact migration with the repository's documented crypto fixture adapter. Native-platform verification must not be claimed from those tests.
