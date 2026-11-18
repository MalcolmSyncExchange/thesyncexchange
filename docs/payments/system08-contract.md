# System 08 — Checkout and payments contract

Local implementation only. Parent: System 07 `566979cd332b8b2cf17f6e6856cba4634450279e`. No commerce, provider credentials, hosted schema or Storage configuration is activated by this package.

## Payment authority and recovery

A Checkout Session API response authorizes navigation only. An authenticated, correctly bound provider event establishes payment evidence. Current catalog prices and metadata are never substituted for the accepted transaction. `syncOrderFromStripeSession` verifies the signed session against immutable order identities, amount, currency and bound session, then retains PK07 evidence before rights-sensitive fulfillment. Agreement publication still passes the existing current rights/catalog/source checks, exact acceptance and hash, paid/unheld order, job lease and immutable-artifact fences. A later rights failure cannot erase the payment evidence or authorize a license.

The existing durable attempt, frozen parameters, credential scope, stable provider idempotency key and two-minute lease remain authoritative. Response loss preserves the original order. Known sessions are retrieved, not recreated. Completed/unpaid and completed/paid sessions cannot be used as a fresh payment authorization. Known unpaid expiry closes its original attempt. Unknown requests beyond the 23-hour replay window require investigation; no new provider key is manufactured. Credential rotation needs an explicit existing-attempt reconciliation plan.

Canceled return navigation is observational: it does not declare payment failure or close a possibly paid session. Buyers can resume the same open Checkout Session to correct declined payment details. Checkout navigation accepts only HTTPS `checkout.stripe.com` URLs without credentials or nondefault ports. The old unauthenticated, fixed-price `/api/create-checkout-session` helper now returns 410 outside production and retains its production 404 gate.

## Routes and authorization

| Surface | Contract |
| --- | --- |
| `POST /api/checkout` | Same configured origin, JSON, 8 KiB/5-second body bounds, strict UUID-only order input, verified Auth user, canonical active Buyer, SSR/RLS ownership, configuration and rate admission. Privileged reads follow authorization. Exact accepted amount/currency/parties/scope; no order repricing or duplicate session write. PK07 atomically binds the session. |
| `POST /api/payments` read | Active canonical owner Buyer or active MFA Admin. SSR RPC `checkout_order_state`. No privileged client for reads. |
| `POST /api/payments` list | Active MFA Admin. `checkout_operations`, page 1–10000, size 1–50. |
| `POST /api/payments` operate | Active MFA Admin; UUID request key, order, explicit action/reason/evidence reference. Audited SQL authorization precedes privileged agreement processing. |
| `GET /api/orders/:orderId` | Existing owner/Admin scope plus the active-session/MFA SQL payment gate; private no-store responses. |
| `/buyer/orders/:orderId`, confirmation | Independent payment, contractual, issuance and delivery states. No success banner from return parameters, paid flags alone, or an adverse hold. |
| `/admin/payments` | Bounded evidence list, exact-order deep links, signed evidence hashes, refund-attempt history, audited investigation and eligible fulfillment recovery; links to existing financial reconciliation. |

All new JSON responses hide provider/SQL diagnostics and use private no-store caching. Buyer projections omit provider payloads, credential scopes, frozen requests, idempotency keys, tokens and operator reasons/references. The existing purchase library verifies its active session before privileged scoped reads; unavailable payment evidence displays as unavailable. Artist and cross-account access is denied. Existing direct order writes remain restricted.

## Refunds, disputes and retained history

`charge.refunded` remains the authority for the PK07 full/partial refund hold and existing accounting flow. `refund.created`, `refund.updated` and `refund.failed` are immutable **observations**, including provider identifiers, amount, currency, status, provider time, receipt time and payload hash. They do not themselves create a financial reversal or completed-refund claim. Duplicate identical observations have one effect; conflicting bytes are rejected. Unmapped observations remain retained for later canonical intent association. The provider's timestamps are preserved on out-of-order delivery. Failed refunds leave original payment evidence intact.

All authenticated dispute lifecycle events (`created`, `updated`, `closed`, `funds_withdrawn`, `funds_reinstated`) retain their original event type and impose the existing adverse hold. A closed/won/reinstated event cannot silently restore access. Existing verified financial ingestion/worker reconciliation handles actual balance movements when separately configured; this package does not activate it or infer a ledger reversal from an observation.

Refund/dispute holds and contractual termination are distinct. Issued agreements, original accepted terms, journals and audit evidence remain retained. A hold blocks new issuance and licensed-asset access through existing gates; historical agreement access follows existing authorization. No automatic legal termination, release of a hold, refund initiation, chargeback reversal, payout or accounting correction is introduced.

## Local schema: migration 61

`supabase/migrations/20261024094011_system08_checkout_payments.sql` follows all 60 unchanged predecessors.

- Private, forced-RLS `checkout_recovery.refund_observations`: append-only provider evidence; no direct API or service table grants.
- Private, forced-RLS `checkout_recovery.operator_requests`: immutable request identity/actor/action/reason/reference/time; narrowly mutable lease/outcome; no direct API or service table grants.
- Owner/Admin read RPCs: `checkout_order_state(uuid)`, `checkout_operations(integer,integer)`.
- Authenticated MFA Admin RPC: `request_checkout_operation(uuid,uuid,text,text,text)`.
- Service-only RPCs: `record_checkout_refund_observation(text,jsonb)`, `finish_checkout_operation(uuid,uuid,boolean)`.
- Private projection/guard functions; additive, drift-checked extension of the two PK07 adverse-event allowlists. No prior migration file or financial journal is rewritten.

Operator actions are `annotate` and `retry_fulfillment` only. Requests serialize on the order; identical retries retain one command; changed payload/actor/order conflicts fail. A five-minute fenced operation lease prevents concurrent execution. Only an expired lease or recorded failure can be reacquired. SQL rechecks immutable acceptance, current rights and authenticated payment before granting fulfillment work; existing agreement fencing prevents duplicate publication. Outcomes and investigation audit rows commit atomically with their respective database transitions. An interrupted outcome response is resolved by the retained lease/request, not a new financial obligation.

## Operator procedure

1. Inspect the order, payment evidence, original accepted terms, source chain and existing reconciliation cases. Record a reason and evidence reference.
2. An uncertain session requires provider/account investigation using separately authorized test tooling. A browser return, manual status selector or operator assertion cannot replace signed payment evidence. Re-deliver the original authenticated provider event after addressing its actual failure; preserve its ID and bytes.
3. Retry eligible agreement fulfillment from Payment operations. Never regenerate a fulfilled agreement, change its terms, or clear a refund/dispute hold to make the retry pass. The legacy manual financial-status action is disabled.
4. Inspect financial exceptions in the existing finance workspace. Existing reviewed correction/restatement controls remain distinct from payment recovery. Any release of adverse holds requires a separately reviewed policy and engineering change; this interface offers no override.
5. Recheck the buyer's immutable record and audit outcome. A successful local retry does not qualify hosted acceptance.

## Dependency and release boundaries

Next.js/ESLint config are pinned to 16.4.1; Sharp to 0.35.5, with matching native lock entries. Stripe is a server external dependency alongside PDFKit; no client credentials are exposed. Test-only SDK transport replacement exists exclusively in `tests/helpers/payments-stripe-preload.mjs`, requires a loopback endpoint, patches both SDK module variants, and rejects external HTTPS. The application has no transport override endpoint or environment switch.

Before any hosted rehearsal: verify candidate hashes and dependency packaging on the actual Linux/Netlify target; review current migrations against the isolated environment; approve dedicated test account/webhook/key bindings and endpoint subscriptions, financial worker/retry/dead-letter monitoring, broker/Storage authorization, secrets, backups and rollback. Keep live commerce disabled. Require independent security/accounting/legal review and explicit founder stage approval. System 09 is not started by this package.
