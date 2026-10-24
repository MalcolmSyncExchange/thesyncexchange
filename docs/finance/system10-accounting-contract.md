# System 10 accounting contract

Local test accounting; commercial signoff, hosted integration, independent accounting/security review and real payout authorization remain separate gates. This package does not activate any capability or start System 11.

## Preserved foundation

PK09 books retain the buyer-accepted financial schedule, legal/source hashes, provider account, payment mode and currency. Journals and lines are append-only, admitted in the creating transaction, protected by deferred balanced double-entry constraints and composite same-currency foreign keys. Positive amounts are debits; negative amounts are credits. Financial SQL uses NUMERIC/BIGINT, and JavaScript financial arithmetic uses BigInt. Aggregate amounts cross the API as decimal strings.

PK07 paid evidence, original acceptance, valid rights/source, generated license and PK08 entitlements remain authoritative. The signed Stripe ingress and durable provider queue retain original IDs, account context, conflicts, retries, exclusive leases, exponential backoff, dead letters, correction reviews and reconciliation history. No client claim, success URL, new report or payout preparation can create earnings, verify payment or issue a license. Existing independently reviewed fixes remain ancestors of this branch.

## Commission and allocation policy

`accounting_configure_policy` requires active canonical Admin MFA, the exact current offer ID, an idempotency UUID, a new version, tier, currency, gross-basis commission, explicit contributor basis points, synthetic/approved mode, fee-override decision and approval reference. There is no default rate, tier rate table, subscription activation or inferred ownership allocation. The Admin must review the seller tier and authority for each configuration; no subscription billing/entitlement integration is introduced here. Synthetic references must begin SYNTHETIC.

The new offer preserves rights/source identity and immutable predecessors. Existing System07 contracts receive the same version/tier/rate; the original quote trigger calculates commission half-up and floors each explicit net allocation in declared order, assigning the residual to the final declared payee. Fresh source/deliverable/catalog approval is mandatory for the new offer. Old accepted evidence is never repriced. A fee override is explicitly reviewed and frozen in the policy evidence, never a client amount override.

Provider fees remain separately evidenced platform expenses. They do not silently reduce accepted contributor allocations. Gross-basis pricing is the supported execution policy; the existing synthetic maturity policy's `net_processor_fee` label is retained for compatibility and does not recalculate frozen commissions. Commercial net-fee policies require separate accounting/product approval and implementation.

Accounting books and reports partition currencies and provider account/mode. Exact arithmetic/formatting is tested for USD, EUR, JPY and KWD. Checkout remains USD-only under its approved existing contract; this package does not enable multi-currency sales, FX or cross-currency netting.

## Explicit legal-payee account bindings

A legal payee is taken from the original separate master/publishing evidence and accepted allocation. A current Artist account must be explicitly bound by MFA Admin with reason/reference, idempotency and compare-and-swap against the previous binding. Blank account revokes the binding. Binding authority follows a database insertion sequence, independent of wall-clock ties or backward changes. Corrections append records; they do not modify the purchase, allocations or past payout recipient. Bindings are per order and legal party, not inferred from ownership percentages, emails, mutable catalog membership or payout contact fields. The identity review reference must point to independently approved payee evidence; merely entering an account ID does not constitute KYC or tax approval.

Current bindings authorize allocation visibility and new payout preparation. Old payout records remain visible to their originally identified Artist for historical traceability. Correcting/revoking a binding dynamically holds previously prepared requests. A new binding cannot silently redirect an existing request. Canonical role changes and revoked/expired sessions fail closed.

## Artist earnings and privacy

`/artist/earnings` uses authenticated SSR and `accounting_artist_earnings`. The SQL derives identity; there is no caller-supplied account selector. Seller-managed sales may show gross, net, platform fees and all contractual allocations. This is distinct from the Artist's own allocations, which require explicit binding. Contributors see only their bound allocation and original payout history; they do not receive other payees, full sale values, Buyer identities/legal addresses, acceptance details, provider payloads, source locators or privileged credentials.

Page totals are explicitly labeled and currency-separated. Pending amounts are expectations before paid posting, not earned money. Owed amounts retain simulated outbound clearing obligations because simulations do not pay anyone. Held, reserved, simulation-eligible, refund/loss, recovery and simulated-completed amounts remain distinct. Actual paid, available for withdrawal and withdrawable funds are always zero. No test adapter can masquerade as a bank disbursement. Old simulated payment/recovery amounts must not be interpreted as an actual debt to or payment from an Artist.

## Payout obligation lifecycle

`accounting_prepare_payout` freezes legal-party/account binding, amount, book currency, explicit reviewed monthly date, actor and approval reference. It creates a held instruction; it does not create additional earnings or reserve cash. Dates are explicitly reviewed within one year; no unapproved monthly day or scheduler is invented.

`accounting_act_payout` serializes on the canonical order and uses a revision and unique request ID. Exact retry returns the original result; conflicting reuse or stale revisions fail. Histories and financial effects commit atomically.

| Command | Allowed current state | Financial effect / resulting state |
| --- | --- | --- |
| schedule | held, failed | Recheck authority/maturity/reserve policy; reserve exact existing payee obligation; scheduled |
| hold | held, failed, scheduled | Release any active reservation; held |
| fail | held, failed, scheduled | Release any active reservation; failed |
| simulate_complete | scheduled, due | Recheck original payment/rights/legal/binding and move reserved to simulated outbound clearing; simulated_completed |
| reverse | simulated_completed | Append exact linked clearing/payable reversal; reversed |
| cancel | held, failed, scheduled | Release any active reservation; canceled |

Completed/reversed/canceled histories are terminal except the one permitted completion reversal. A failed attempt can be scheduled again under a new revision. Different requests cannot reserve more than the remaining accepted obligation. Partial amounts are supported without rounding guesses. Completion is a **synthetic interface**, not a provider transfer. Authentic provider-imported books remain held for a future verified payout adapter and cannot accept simulated facts. No Stripe transfer, payout, refund or other mutation API is added.

Refunds/disputes, payment failure, missing generated license, contractual closure, revoked rights/source, identity changes, immature policy and capability disablement block scheduling/completion. Hold/failure/cancel can release an existing simulation reservation under adverse conditions. A completed simulation followed by a refund exposes recovery and can be reversed with retained evidence. The original proportional-floor-suspense refund policy is preserved; failed refund observations do not change posted earnings.

## Reconciliation and oversight

`/admin/accounting` and the private same-origin `/api/accounting` require canonical Admin MFA. The original `/admin/finance` queue/retry/alert/correction controls remain intact and linked. Read reports include currency/account partitions, gross, platform revenue, refunds, pending disputes, outstanding obligations (including simulated clearing), recovery, unresolved reconciliation, original journals, identity reviews and policy histories. Lists are bounded/paginated; audit previews explicitly show latest 100.

The existing comparator is extended, with prerequisite drift checks and retained function OID/grants, to recognize exact payout reversals and request/fact/journal mismatches. Existing provider/order/payment/license/delivery/commission/contributor findings are preserved. Acknowledgment is never reconciliation approval. Existing independent correction requires another current Admin and retains original/reversal/replacement; there is no arbitrary balance setter. Payout identity corrections and reversals append named evidence.

## Boundaries and local deployment sequence

Only additive migration `20261024175837_system10_financial_accounting.sql` follows 62 unchanged predecessors. Four new private tables use FORCE RLS, owner-only policy, immutable triggers and no direct anon/authenticated/service-role grants. Internal primitives have no API EXECUTE. Public RPCs repeat role/session/MFA validation. No Storage/Auth/provider infrastructure, scheduler, flags, secret, deployed environment or historical row is changed.

The new endpoint reads at most 8192 bytes with a five-second deadline, requires the configured origin and JSON, validates strict bounded fields/arrays, retains SSR identity and returns redacted errors with private no-store headers. Browser controls retain one request key after uncertain responses. A refresh reviews current revisions before the next action. No service-role client is acquired by the new reporting/mutation path.

Future hosted sequence, requiring separate authorization: preserve backup; verify exact candidate/migration hashes; replay all migrations in isolated environment; verify owner/RLS/grants/Auth expiry/MFA and dormant flags; configure only dedicated test provider credentials; rehearse original signed ingress/worker and reports; review explicit payee evidence/policy; independently review CPA/security findings; execute formal QA; obtain founder stage approval. Rollback stops worker/simulation capability and reverts application exposure while preserving all immutable books/events/journals. Do not drop tables, delete audit records or reverse production facts without a reviewed accounting procedure.

## Remaining release gates

Founder commercial rate/tier/fee-override and gross-vs-net decisions; contributor revenue agreements; fee/refund/rounding/reserve/maturity/monthly payout policy; verified payee identity, tax and payment-destination process; CPA approval; verified live payout/disbursement adapter and bank reconciliation; provider statements/worker scheduling/alerts; hosted permissions, backups and incident drills; independent security/accounting review; Firefox/WebKit/physical devices/accessibility acceptance; native Linux qualification and Phase A custody/quota/budget holds. All 25 formal QA scenarios remain Not Run. Private Beta remains NO-GO.
