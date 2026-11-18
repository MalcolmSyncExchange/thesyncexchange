# Founder acceptance and open evidence exception

Recorded at: `2026-10-14T23:19:55Z` (UTC recording time; not an independently
verified timestamp of the founder's message).
Decision authority: **Founder**, as identified in the explicit directive in this
conversation. No additional personal identity is inferred.
Accepted closeout: `2e9b44b0160362f7b057a2e75468a981e22dffb4`.

## Milestone register

| Milestone / gate | Status | Scope |
|---|---|---|
| PostHog Phase 2 Core Integration | ACCEPTED WITH OPEN EVIDENCE EXCEPTION | Verified core staging event pipeline only |
| Full Phase 2 staging acceptance | UNRESOLVED | Separate gate; not accepted by this directive |
| Production readiness | UNRESOLVED | Separate gate; production analytics activation not authorized |

The accepted demonstration is event `f7d9bd71-58ce-4770-a970-725c7b11ac6a`:
successful single-use grant consumption, one delivered outbox event, one matching
PostHog event in project `657650`, correct properties and test classification,
and exclusion from standard SEC marketplace metrics. The closeout matrix retains
its independent verification classifications, including limitations and failures.
Governance acceptance is not a retroactive preservation verification.

## Evidence exception register

| Field | Recorded disposition |
|---|---|
| Identifier | `PH2-CORE-EVIDENCE-001` |
| Status | **OPEN — acknowledged and accepted for core milestone scope only** |
| Limitation | Complete execution-time preservation could not be established because the original fingerprint baseline and per-run key were not retained |
| Related collection failure | Read-only management database role lacked permission for the delivery-health RPC; callback failed before the postflight collection |
| Incomplete historical evidence | Full Auth identities/session history, exact authorized login deltas, full RLS/privilege/security comparison and other complete-baseline comparisons described in the closeout |
| Evidence retained | Original failed execution/coordinator receipts, successful independent checks, subsequent current-snapshot audit and scoped older-baseline comparisons |
| Disposition | Do not mark PASS, silently close, reconstruct a historical baseline from current data or erase the original failure |
| Future handling | Preserve the exception; implement separately reviewed collector permissions and durable baseline custody for future operations. Future checks cannot retroactively establish the missing historical comparison |

No unexpected mutation was established in the verifiable subsets; that does not
prove preservation in the unverified historical domains. The 62 passing later
snapshot comparisons establish stability during that later audit interval only.
A future closure or disposition change requires an explicit, evidence-backed
record; this acceptance leaves the exception open.

## Safeguards and authorization boundary

Existing evidence is preserved unchanged. Existing staging safeguards remain in
force: global analytics disabled, six purchase capabilities OFF, historical grants
and event history preserved, consumed authorization not reusable, no automatic
retry or scheduled worker activation, and general staging QA held.
These are retained dated findings and operating constraints, not a new continuous
monitoring claim or clearance of external writers.

This directive does **not** authorize production analytics activation, general
staging QA, additional event generation, migrations, deployments or changes to
payment capabilities. This recording performs local documentation changes only;
it does not change application behavior or hosted systems.

## Evidence and follow-up references

- [Closeout and verification matrix](README.md)
- [Unchanged evidence manifest](evidence/manifest.json)
- [Future improvements and production requirements](future-readiness.md)

The future improvements remain pending. SEC synthetic-event dashboard visibility
is not promoted to PASS by acceptance of the separately verified marketplace
exclusion. Neither full staging acceptance nor production readiness is closed.
