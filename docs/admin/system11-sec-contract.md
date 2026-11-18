# System 11 SEC operating contract

Baseline: System 10 `38c68e780da51d0667d15bf4362c7bacd1a45686`. Isolated branch `codex/system11-sec-admin`. No hosted changes or activation.

## Source discovery and decision coverage

The explicit System 11 founder directive is the implementation authority. Original workshop threads were recovered only for Commercial 71–90, QA 41–55, SEC 41–60 and Catalog 36–55. Earlier questions remain Needs Verification. Prior register summaries do not substitute for original options. Source thread identities and prior coverage are recorded in the local evidence directory. SEC 041/046/051–060 inform MFA, audit, privacy, access governance, safe degradation and founder-controlled releases. Proposed response targets, recovery objectives and commercial terms are not represented as approved operational capabilities. SEC 002 critical-action thresholds and actual founder appointments remain unverified.

## Modules and preserved authorities

| Surface | Authority and behavior |
| --- | --- |
| Dashboard | Canonical account eligibility, tracks, submissions, rights, publication, orders, generated licenses, payment exceptions and immutable accounting summary. Account eligibility is not recent activity. Missing external monitoring, scheduling, billing and archive evidence are null. |
| Account controls | Restrictions, suspension, reinstatement and private notes over canonical account IDs. New restrictions fence existing RLS, source workflows, purchase assertions and delivery sessions. Reinstatement never revives revoked sessions. |
| Permissions | Existing canonical Admins only; requested→approved→granted expiring capability appointments, review/revocation and immutable history. Requested changes preserve existing effective privileges until actual grant/revocation. No profile role promotion, self-grant or founder restriction. Initial binding has no UI and needs separate trusted provisioning approval. |
| Catalog / rights / media | Existing Systems 03–05 screens and versioned RPCs remain authoritative. Full operational Admin permission is required for legacy surfaces. |
| Licenses / transactions / finance / delivery | Existing Systems 07–10 evidence, lifecycle, recovery and correction contracts remain authoritative. No alternate paid state, issuance path, journal rewrite or real payout. |
| Integrity | Reviewable signals, investigations, evidence references, decisions and closure. No automatic sanctions. |
| Deals / conversations | Server-derived seller, identified Buyer, immutable track/parties; discovery→inquiry→quote→checkout→license with canonical acceptance and final verified license. Participant messages and attribution/introduction evidence; internal staff notes excluded from customer history. Approved fee references point to immutable System 10 policy actions, never rewrite an order. |
| Support | Buyer/Artist/licensing/payment/delivery/rights/security/account cases; assignment, states, private notes, explicit public replies and resolution/reopen history. Customer-owned references and participant-only access. |
| Subscriptions | Free/Pro/Teams observations, requested cancellation, reported renewal and expiring founder-approved complimentary entitlements. Provider billing remains unverified. Pro USD 19.99 and Teams USD 49.99 monthly remain proposals. No product creation or paid-billing assertion. |
| Organizations | Identified representatives and reviewed members with organization roles; no platform authority or inferred rights ownership. |
| Audit | Immutable events with actor, action, target, server time, before/after or source hashes, authorization/session hash, reason, correlation and outcome. Existing domain event bridges retain hashed references. Bounded manifests recompute SHA-256; external anchoring remains unverified. |
| Settings | Founder + fresh MFA. Checkout, issuance, delivery, catalog publication, signup, subscription changes, messaging and custom licensing pauses are effective deny-only fences. Other marketplace/license/commercial/security/notification/retention settings are versioned proposals, not runtime activation or deletion. |
| Incidents / reporting | Severity, acknowledgement, assignment, recovery evidence and resolution. Existing SEC Intelligence dates, comparisons, filters and hover values preserved. No new PostHog instrumentation. External alerts and rehearsed recovery remain hosted acceptance. |

## Security and recovery

Canonical `user_profiles.role`, provider session and AAL2 are required. Sensitive new actions additionally require signed TOTP/WebAuthn AMR within five minutes (engineering security window, not a founder business SLA). Admin sessions have an eight-hour ceiling where provider creation time is available. Legacy service-role Admin adapters require full operational permission; scoped SEC modules use authenticated SSR RPCs. Before founder binding, existing canonical Admin operational access is preserved; binding requires explicit appointments for other Admins. No account is silently designated founder.

Commands serialize entity revisions and actor/request IDs. Identical retries return the original receipt; conflicting request reuse and stale revisions fail. State, receipt and audit commit together. Separate redacted authenticated rejection reports follow failed API commands; these reports do not independently prove the preceding database denial. Unavailable rejection-report transport never turns denial into success. API origin/byte limits, strict schemas and a fixed authenticated 120/minute admission budget apply. Direct Data API access still requires RPC authorization/RLS; the admission endpoint is not a new privilege.

Private SEC tables force RLS and grant no direct API access. Business revisions, operation receipts, audit, founder binding and session revocations are append-only; only operational admission counters mutate. Restriction changes never overwrite accepted terms, rights, payment evidence or financial journals. Verified provider evidence continues posting during account holds. Storage policies and private credentials are unchanged.

## Hosted acceptance and rollout

Replay the complete 64-migration sequence only in a separately authorized isolated environment. Verify Auth AMR/session columns, real account/role provisioning, founder identity/approval references, provider MFA and session expiry, private Storage/broker controls, operational alerts/scheduling, independent audit custody/retention, backups and recovery. Provision existing Admin appointments before founder binding; verify scoped denial immediately afterward. No automated founder bootstrap is offered. Audit retention settings do not authorize evidence deletion.

Rollback: keep commerce disabled; place restrictive pauses if independently authorized; roll application back with data retained. Do not reverse immutable evidence or drop SEC tables. A forward correction migration is required for database defects. Older application code is not a safe fallback for scoped capability enforcement without independent review.

Local automated qualification is separate from independent security review, hosted integration and founder operational acceptance. All 25 formal QA scenarios remain Not Run. System 12 is not started.

Registration pause blocks the application signup action and canonical profile creation. Provider-direct Auth identity creation/email requires a separately configured and accepted Auth hook or provider control; no hosted Auth setting was changed.

The central SEC audit is authoritative and append-only. Legacy track-audit/note projections retain their existing deletion/cascade semantics for unused accounts; inserts, updates and deletion tombstones are captured centrally. Accepted license/financial/source evidence retains its existing non-deletion fences.
