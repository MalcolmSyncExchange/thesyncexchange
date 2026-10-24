# System 10 — local acceptance report

Status: **locally complete — not live**. Implementation `32e63b61f3ef7e2fdb9c737533afe7a8db89c9d5` on `codex/system10-financial-accounting`, based on System09 `659bd0eb6d1be2def6c5cd866d59b7d8820c1487`. Systems01–09 and the original workspace are preserved. **Stop before System11. Private Beta remains NO-GO.** No push, merge, deployment, hosted migration, shared infrastructure change, capability activation, real financial transaction or payout occurred.

## Reviewed and preserved

PK09 `3e9d194`, PK07 `d1724da` / `b7f0146` / `0435cff`, PK08 `64aacff` and independent fixes `fd6ef37` / `6bea154` are verified ancestors. The existing immutable balanced ledger, original accepted allocations, provider signature/account checks, durable queue/leases/retries/dead letters, source/legal/rights fences, payment verification, generated licenses, secure delivery, adverse-payment restrictions and independent correction controls remain in place. Auth and PostHog source and workstreams were not changed. Existing commission/ledger/provider recovery were working; Artist accounting, explicit contributor account attribution, payout request histories and consolidated oversight were missing or partial.

## Implemented

- `/artist/earnings`: authenticated account-scoped gross managed sales, fees/net, explicit own versus contributor allocations, pending/owed/held/reserved amounts, refund/loss adjustments, simulated completion/recovery and original payout histories. Page totals partition currencies; Buyer legal/acceptance/provider evidence is excluded. Unbound ownership does not imply earnings attribution.
- `/admin/accounting`: canonical active Admin MFA, currency/account/mode reports, original journal/reconciliation issues, identity and financial-policy review histories, monthly payout preparation and auditable actions. Existing `/admin/finance` worker/retry/alerts/independent correction interface is preserved and linked. Navigation additions are limited to financial accounting.
- Versioned commission/tier/fee-override policies and explicit contributor basis points; no business rate is invented. Supported executable pricing remains gross-basis USD. Changes create new immutable offers and require fresh source/deliverable/catalog approval. Existing accepted amounts and policies never reprice. Tier configuration is explicit manual review; automatic subscription billing/entitlement-linked discounts are not activated.
- MFA-reviewed legal-payee to Artist bindings with compare-and-swap, idempotency and append-only correction/revocation. Binding authority follows insertion sequence, so backward/tied wall clocks cannot select an older binding. Original request recipient/history stays frozen.
- Held preparation → reservation/schedule → failure/hold/retry → due **simulated** completion → exact retained reversal/cancel. Order locking, revision checks and request identities prevent duplicate financial effects. Transaction rollback recovers both journal and history together. Current payment, license, rights/source, identity, maturity and reserve holds prevent progression. Authenticated provider books cannot accept simulation facts.
- Reconciliation checks original transaction/provider/licensing/delivery evidence plus payout facts, per-payee reserved amounts, outbound clearing and exact reversal links. Balanced wrong-account records remain discrepancies. Owed amounts retain simulated outbound obligations; simulated completion cannot falsely report the Artist as paid.

## Database, API and security

One additive migration: `supabase/migrations/20261024175837_system10_financial_accounting.sql`; **63 total**, with **62 byte-identical predecessors**. New private tables: `finance_private.payee_bindings`, `payout_requests`, `payout_events`, `policy_actions`, with FORCE RLS, owner policy, immutable triggers and no direct API-role grants. Six new public accounting RPCs: `accounting_bind_payee`, `accounting_prepare_payout`, `accounting_act_payout`, `accounting_configure_policy`, `accounting_artist_earnings`, `accounting_admin_report`. New private helpers derive legal payee names/current bindings, enforce payout holds, build scoped reports and inspect payout discrepancies. The existing `inspect_order` is extended with drift checks while preserving its identity/permissions. The existing immutable simulation maturity-policy RPC is exposed through the same authorized financial interface.

`POST /api/accounting` uses authenticated SSR only, canonical role checks, repeated SQL session/MFA checks, configured same-origin JSON, an **8192-byte / five-second** reader, strict bounded validation, exact string minor amounts, private no-store headers and redacted errors. No privileged client or live provider mutation API is introduced. Negative tests cover Buyer/Artist/service/anonymous access, cross-account earnings, expired sessions, MFA downgrade, direct table access and unauthorized mutations. No known critical local financial defect remains in the exercised scope; independent security and professional accounting review remain unexecuted.

**Actual paid, available for withdrawal and withdrawable funds remain zero.** The adapter is synthetic only. Reserving or simulating a payout never establishes a bank disbursement. The monthly date is explicitly reviewed; no live scheduler, monthly day, bank/KYC/tax workflow, verified payout adapter, FX or multi-currency checkout is invented. Ledger arithmetic/partition/display tests cover USD/EUR/JPY/KWD; checkout retains USD-only licensing. See `system10-accounting-contract.md` for state transitions, policy, privacy, rollback and release boundaries.

## Final automated validation

| Command / scope | Verified result |
| --- | --- |
| `npm run test:unit -- --test-concurrency=8` | **1,722 pass**, zero failures/skips; includes prior Systems01–09 |
| `npm run test:accounting` | **35 pass**, overlapping unit suite |
| `npm run test:accounting:native` | **67 pass**, including all61 predecessor native regressions; real PG17 crypto, provider-owned Auth/Storage, non-superuser installer, independent concurrent connections |
| `npm run test:security-pr2` / `npm run test:artist-security:gate` | **300 + 5 pass** |
| `npm run test:release-replay` | All **63 exact migrations** replay; default dormant flags preserved |
| Ten available browser suites | **98 Chromium groups pass**, zero runtime exceptions; Accounting8,Delivery8,Payments9,Licensing8,Marketplace15,Catalog12,Rights10,Uploads11,Artist9,Auth8 |
| Final `npm run test:accounting:browser` | Same8 accounting groups pass again after final binding/display/navigation refinements; counts above are not doubled |
| `npm run typecheck`, `npm run lint` | Pass; one inherited React Hook Form memoization warning in `submit-music-form.tsx` |
| `npm run build` | Pass on committed implementation, 7.214 seconds; synthetic loopback configuration and disabled commerce. Final documentation HEAD build evidence is recorded separately in the output directory |
| `git diff --check` / exact source inventory | Pass; task files only; no predecessor migration changes |
| `npm audit --json` | Expected exit1: **0 critical / 3 high / 3 moderate**, unchanged from baseline; no lockfile or dependency versions changed |

The35 focused tests include commission half-up rounding and final-payee residuals, large exact balances, multiple currencies, binding/privacy/CAS, clock reversal, original policy/contract snapshots, pending/unpaid earnings, partial/full refunds, payment failures/disputes, payout lifecycle/interruption/overdraw, contractual revocation, provider-versus-simulation separation and wrong-account reconciliation. The native tests add duplicate bindings/actions, competing reservations, refund-before-queued-completion, interrupted completion/reversal, signed duplicate capture/exclusive worker lease/concurrent posting and actual Auth expiry/MFA checks. Existing ingestion/payment regressions retain failed-refund, chargeback, provider fee, out-of-order evidence and interrupted worker recovery coverage.

Execution environment: **Darwin ARM64, Node24.14.1, PostgreSQL17.11**, private Unix sockets, pinned Supautils SHA256 `ad18bd34a2f76a9b586484e35f41d591b19c07c7fbaef9ed140cc4d5e8ac94b7`, synthetic fixtures only. This is not native Linux evidence. Firefox/WebKit are unavailable locally. Mobile Chromium layout, focus and screenshots were checked; real devices, assistive technology and independent accessibility acceptance remain open. Inherited loopback fixture logs retain unsupported observer/mutation denials; protected accounting RPCs execute the actual repository SQL/RLS, not success mocks. Browser runtime error arrays are empty.

Earlier failures were diagnosed and retained where captured: initial Artist fixtures omitted active Artist sessions and used an invalid provider event ID; a fresh contract fixture omitted the private rights-evidence bucket; a native race fixture attempted a privileged order lock from the unprivileged Admin role. Fixture setup was corrected without weakening application authorization. Initial TypeScript failures were corrected (payload index signature and target-compatible BigInt comparison). Added final binding-sequence and clear Artist hold labels were revalidated. Earlier successful validation snapshots and final logs are separate evidence.

## Dependencies and remaining approval gates

Unresolved advisories: high `brace-expansion`, `source-map-js`, `zod`; moderate `postcss-selector-parser`, `postcss-nested`, `tailwindcss`. Build-tool paths and global Zod compatibility need separate qualification. The new accounting endpoint rejects oversized input before Zod and bounds every array; this constrains the documented oversized-collection issue for this endpoint and **does not clear the dependency advisory or unrelated routes**. Primary reference: [GitHub Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). No broad Auth/UI Zod major migration was introduced.

Stripe pending/available balance and bank disbursement are separate evidence states; a paid charge or simulated clearing entry is insufficient to assert paid Artist funds. See [Stripe balances and settlement](https://docs.stripe.com/payments/balances). The read-only verified-provider contract is preserved; real payouts require a separately implemented, authenticated and reconciled adapter.

Founder/commercial: BET-008 remains **Needs Verification** for one approved beta commission rate and tier precedence; source approval, contributor revenue agreements, fee/refund/rounding/reserve/maturity policy, monthly dates, tax/identity/destination and CPA approval remain open. Synthetic rates and fixtures approve no commercial economics. Commercial policy approval is distinct from noncommercial test qualification.

Hosted: isolated migration/RLS/Auth/MFA/provider-shape acceptance, dedicated test credentials, worker scheduling/retry/dead-letter external alerts, provider statements, backup/recovery and incident drills; verified payout/bank reconciliation; independent accounting/security review; native Linux AMD64 and PhaseA custody/quota/budget holds. No hosted rehearsal or live operation is authorized by this report. Rollback disables exposed simulation/worker capabilities and reverts the app while retaining immutable evidence; do not delete financial history.

Private Beta critical path: founder-authorized Systems11–14 → integrated reproducible candidate/replay/regression → separately authorized isolated platform/hosted rehearsal and required independent reviews → actual formal QA → explicit founder stage approval. Existing System10 local capability is not formal stage acceptance. Do not start System11 automatically.

## Command Center and custody of evidence

Updated the existing native workbook in place: **133 cells verified**, **706 preservation checks**, zero discrepancies. Engineering row42, Payments row22, Blueprint810–818 plus targeted Payments/Master/Security/QA/Risk evidence. Existing task IDs/status distinctions remain; BET-008's commercial state is unchanged. **All25 formal QA remain Not Run**, all53 qualification stage records and previous System09 Blueprint rows are preserved, as are the Founder QUERY and four charts. No formulas or charts were written. Native validation/format/wrapping checks passed; CUA returned no usable state, so Google-rendered fit was not independently inspected.

Local evidence: `output/system10-financial-accounting-2026-10-24/` in the original workspace, excluded from commits. Exact implementation stage list/stat, lineage, migration hashes, validation/browser results, audit before/after, Command Center readback and preservation reports are retained. Ten original workspaces and all25 pre-existing tracked dirty hashes are unchanged. Generated build files, node_modules, fixtures/screenshots/logs and CLI markers are excluded. The final completion record binds both local commits and final clean status.

## Exact task file inventory

**25 implementation/contract files** in `32e63b61f3ef7e2fdb9c737533afe7a8db89c9d5`, plus this acceptance report (**26 total**). `implementation-staged-files.json` and `implementation-git-show-stat.txt` record the exact staged paths and `git show --stat --oneline` output; no unrelated file was staged.

- `app/(app)/admin/accounting/page.tsx`
- `app/(app)/admin/finance/page.tsx`
- `app/(app)/artist/earnings/page.tsx`
- `app/api/accounting/route.ts`
- `components/admin-v2/admin-shell.tsx`
- `components/artist/artist-workspace-shell.tsx`
- `components/finance/accounting-action.tsx`
- `components/finance/earnings-report.tsx`
- `docs/finance/system10-accounting-contract.md`
- `lib/finance/accounting.d.mts`
- `lib/finance/accounting.mjs`
- `package.json`
- `scripts/test-accounting-browser.mjs`
- `scripts/test-accounting-native.mjs`
- `services/finance/accounting.ts`
- `services/finance/reports.ts`
- `supabase/migrations/20261024175837_system10_financial_accounting.sql`
- `tests/accounting-system-api.test.mjs`
- `tests/accounting-system-db.test.mjs`
- `tests/accounting-system-money.test.mjs`
- `tests/accounting-system-native.test.mjs`
- `tests/helpers/accounting-fixture.mjs`
- `tests/helpers/buyer-marketplace-provider-fixture.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `docs/finance/system10-local-acceptance.md`
