# Phase 2B threat model

## Protected assets

- immutable purchase facts and rights snapshots
- Stripe event identity and TEST/live classification
- private master asset versions and receipt artifacts
- buyer entitlement ownership
- seller transaction privacy
- service-role and Stripe credentials

## Trust boundaries

1. Browser to authenticated checkout API.
2. Stripe to raw-body webhook verifier.
3. Application Functions to Supabase through the server-only modern secret key.
4. Public PostgREST schema to the unexposed `commerce_private` schema.
5. Worker lease holder to private Storage and immutable artifact records.

## Principal threats and controls

| Threat | Control |
| --- | --- |
| Forged paid event | Stripe raw-body signature check precedes event mapping and database RPC |
| Live event in TEST rollout | Runtime `livemode=false` assertion plus database TEST-only constraints |
| Wrong order/buyer/session | Canonical buyer authorization; immutable contract; stored session/intent and order relationship checks |
| Client-controlled price/currency | Trusted catalog pricing plus Stripe and database equality checks |
| Duplicate or concurrent webhook | Provider-event uniqueness, row locks, immutable replay comparison, logical job uniqueness |
| Cross-order event reuse | RPC derives contract from order; private function checks stored session, intent, buyer, track, license, amount, and currency |
| Real-catalog master leakage | No entitlement without exact asset/buyer deployment-owner QA designation |
| Mutable/latest asset selection | Immutable Storage object/version and SHA-256-bound asset version |
| Capability typo enabling work | Exact `true` only; missing/invalid is OFF; database flags default OFF |
| Worker replay/stale completion | Lease token, expiry, bounded attempts, stale-worker fence |
| Refund/dispute restores access | Monotone order state; entitlement suspension/revocation; immutable history |
| Buyer billing data leaks to artist | Seller projection schema excludes buyer/billing fields |
| Public invocation of privileged RPC | Explicit role check and EXECUTE grants only to `service_role` |
| Secret exposure | Server-only environment, no raw payload/signature storage, no client variable |

## Residual risks before later phases

- Receipt PDF rendering/upload orchestration is not user-facing and must remain behind the receipt worker flag.
- Asset copying and activation remain disabled until their own reviewed worker implementations are complete.
- No production capability may be enabled in Phase 2B implementation or review.
- Hosted validation must use only an explicitly designated synthetic QA asset/buyer pair.
