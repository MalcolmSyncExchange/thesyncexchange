# Gate D D1 security contract

## ACL and RLS matrix

| Object | `anon` | `authenticated` | `service_role` | Owner |
|---|---:|---:|---:|---:|
| `acceptance_grants` direct table access | none | none | none | retained administration only |
| `acceptance_grant_audit` direct table access | none | none | none | retained administration only |
| Gate D sequences | none exist | none exist | none exist | none exist |
| `gate_d_reserve_acceptance(uuid)` | none | EXECUTE | none | yes |
| service RPC set | none | none | EXECUTE | yes |
| private helpers/trigger functions | none | none | none | trigger/definer invocation only |

Both tables have RLS enabled with no permissive policies. Direct grants are explicitly revoked from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Every Gate D function is `SECURITY DEFINER`, has `SET search_path=''`, uses fully qualified names, and contains no dynamic SQL.

## Service RPC inventory and EXECUTE manifest

| RPC | Grantee | Purpose |
|---|---|---|
| `gate_d_reserve_acceptance(uuid)` | `authenticated` | exact QA Buyer reservation; browser supplies order only |
| `gate_d_prepare_checkout(uuid,uuid,bigint)` | `service_role` | revalidate trusted facts; freeze contract, pending entitlement, expiry and digest |
| `gate_d_bind_checkout(uuid,uuid,uuid,bigint,text,text,timestamptz)` | `service_role` | atomically bind exact TEST Session |
| `gate_d_record_checkout_failure(uuid,uuid,uuid,bigint,text,boolean)` | `service_role` | retry or reconciliation evidence |
| `gate_d_route_webhook(text,uuid,text,boolean,text)` | `service_role` | Session-only positive routing and negative order conflict |
| `gate_d_record_verified_payment(uuid,text,text,text,text,integer,text,text,timestamptz)` | `service_role` | retain signed TEST payment evidence and create four jobs |
| `gate_d_request_revocation(uuid,text)` | `service_role` | enter controlled revocation request |
| `gate_d_reconcile_revocation(uuid,text,text)` | `service_role` | reconcile provider outcome before expiry/revoke |
| `gate_d_apply_security_hold(uuid,text)` | `service_role` | suspend pending delivery after mismatch |
| `gate_d_claim_job(uuid,text)` | `service_role` | claim only the three approved jobs |
| `gate_d_prepare_receipt(uuid,uuid,uuid)` | `service_role` | freeze bounded TEST receipt snapshot |
| `gate_d_seal_receipt(uuid,uuid,uuid,text,bigint,text,boolean)` | `service_role` | bind exact private Storage identity/evidence |
| `gate_d_finish_job(uuid,uuid,uuid,boolean,boolean,text)` | `service_role` | complete an exact leased approved job |
| `gate_d_get_bound_checkout(uuid,uuid)` | `service_role` | recover an already-bound Session safely |
| `gate_d_consume_acceptance(uuid)` | `service_role` | atomic final invariant and consumption |

## Session validation proof

Reservation first requires `auth.role()='authenticated'`, then exact `auth.uid()` equal to `8ffc95e8-0e8f-428e-ac26-925d6bc98fcd`, then canonical `public.user_profiles.role='buyer'`. It extracts `auth.jwt()->>'session_id'`, validates UUID syntax before casting, and requires an `auth.sessions` row whose `id` and `user_id` match the authenticated user. Email and user/app metadata are never consulted. The session UUID becomes write-once on first reservation. Missing, malformed, deleted/revoked, mismatched-user, and different-session requests return the same generic unavailable result.

## Threat model

| Threat | Control |
|---|---|
| Buyer enumerates foreign orders | exact Buyer/order lookup under definer; generic unavailable response |
| Forged role or identity | canonical profile role plus `auth.uid`, `auth.role`, and live `auth.sessions` binding |
| Browser obtains worker secret | authenticated RPC never returns lease token |
| Two workers or stale retry race | grant row locks, epoch/token fences, true two-connection test |
| Stripe retry parameter drift | immutable canonical digest checked before dispatch |
| Duplicate Checkout | immutable attempt/idempotency key; exact same-key recovery |
| Unbound event falls into ordinary flow | retained-order negative conflict guard returns retryable failure |
| Connect event accepted | direct configured account required; `event.account` must be absent |
| Live payment accepted | existing runtime assertion plus Gate D TEST-only checks and `livemode=false` |
| Confused deputy RPC arguments | every RPC locks grant plus independently matches order/job/event/contract/session facts |
| Receipt overwrite or substitution | fixed path, private bucket, no upsert, readback hash/bytes/MIME, DB object ID/version seal, immutability trigger |
| Premature delivery | pending entitlement, activation never claimable, no signed URL, capabilities OFF, `can_deliver=false` |
| Late payment lost or fulfilled | immutable evidence retained, security hold, entitlement suspension, no reopen/consume |
| Audit secret leakage | closed scalar columns; no token, key, digest, metadata, or unrestricted JSON |

## Non-delivery proof

D1 creates no Storage read policy, signed-download API, entitlement activation worker, or Gate D receipt UI. The only possible entitlement remains `pending`, `commercial_rights_granted=false`, and `activated_at=null`. The activation job is `pending`, `attempts=0`, `lease_token=null`, and cannot be claimed by the Gate D RPC. The final invariant calls the existing `commerce_private.can_deliver` function and requires `false`; it also rechecks all six global capabilities are OFF.
