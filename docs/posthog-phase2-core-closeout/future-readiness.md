# Follow-up plan and production activation gates

This plan preserves the delivered event and consumed grant. It does not require
another live event to close the core integration evidence exception.

## Correct permission context and isolate collection

The protected database snapshot SELECTs already worked under the management
read-only principal. The permission defect was the SEC health-function call.
Use the existing supported service-role read-only RPC after canonical Admin
authorization and exact staging project verification, or a reviewed equivalent
pure SELECT compatible with the read-only principal. Keep the credential in memory
through the approved secure provider. Do not broadly grant privileged RPC access
to supabase_read_only_user, PUBLIC, anon or authenticated to avoid the error.

Separate optional SEC diagnostics from the mandatory collectAfter return path.
Use independent try/finally boundaries so a health/reporting failure cannot prevent
snapshot capture, preservation comparison, terminal evidence or browser cleanup.
Keep distinct assertion IDs and categories for SEC permission denial, collection
failure, comparison failure and cleanup failure. Never convert an incomplete read
into an empty successful source.

Local acceptance tests: permission denial with successful snapshot capture;
successful scoped read-only health access; readiness/POST timeout; malformed health
JSON; artifact writer failure; collector failure; cleanup failure; no additional
event POST on any path. Any implementation requires separate local-work approval.

## Durable fingerprint evidence

Before any future authorized write, atomically persist and verify an authenticated,
encrypted baseline bundle containing the private stable record identities,
fingerprints, per-run comparison key, complete source coverage, snapshot/read times,
source/tree, project/deployment identity and exact operation authorization.
Use a narrowly scoped Keychain/approved secure-provider key reference. Never place
the key, tokens, raw private rows or plaintext fingerprints in Git, public reports
or persistent plaintext environment files. Public receipts should record only
non-sensitive evidence identifiers and completion/availability attestations.

Persist postflight evidence independently of optional reporting, including on
failure. Verify decryptability and completeness before arming, and fail closed if
the bundle or secure key is unavailable. Define retention, restricted access,
backup/recovery and eventual disposal before adopting the storage mechanism.
Do not silently change fingerprint algorithms or schemas between snapshots.

Local tests must exercise crash recovery after each checkpoint, missing/corrupt
bundles, wrong key/project/operator, partial reads, ordering changes, altered
historical grants/events, extra sessions and unauthorized policy/privilege changes.
Recovery loads evidence and reads state; it must never arm, renew or replay an event.
Encrypting future evidence cannot reconstruct the lost historical baseline.

## SEC Event Health verification

Keep standard marketplace/activity/conversion reports excluding is_test=true and
internal events. The current standard Event Health view uses the same filtered
source and therefore cannot establish visibility of this synthetic event.
The separate delivery-health RPC already provides the delivery-state evidence.

Plan a separately reviewed, canonical-Admin-only diagnostic view/read model that
can display labelled test delivery state without including tests in marketplace
metrics. It should remain read-only when global capture/delivery are disabled,
state its environment and coverage limits, bound queries and redact private payloads.
Never enable analytics or workers merely to read health.

Use existing staging records for any separately authorized read-only dashboard
verification: the approved UUID, delivered state/attempt count, failure/held states
from local fixtures, correct test labelling, authorized/unauthorized route behavior,
and unchanged marketplace exclusion. Do not generate another event for this task.

## Production analytics activation checklist

Every item below is an unmet production gate until supported by fresh evidence.
This checklist authorizes no production operation.

1. Resolve the actual production Netlify site, application origin, deployment
   context, Supabase project and PostHog project independently. Do not reuse staging
   identities or infer them from an environment label. Review an exact source SHA,
   tree, clean release worktree and source integration against active workstreams.
2. Verify production uses its separate POSTHOG_PRODUCTION_TOKEN and correct
   ingestion host, with independently established secret provenance. Verify preview
   routing cannot override actual production selection, no shared staging token and
   no credential fallback. Verify effective runtime settings, not presence alone.
3. Review production migration history/checksums, schema compatibility, service-role
   and function permissions, RLS boundaries, immutable claims/acknowledgments,
   preserved outbox history and compatibility with active capture/delivery. Require
   explicit authorization for every necessary hosted migration/configuration change.
4. Establish recoverable backups and a reviewed fix-forward incident procedure.
   Disable capture/delivery without deleting history, resetting consumed grants,
   replaying delivered events or reverting to incompatible acknowledgment code.
5. Obtain explicit operator/workstream maintenance acknowledgments, inventory
   automated clients/schedules/webhooks and verify writer quiescence repeatedly.
   Idle chats and one quiet database snapshot do not establish clearance.
6. Validate privacy/event contracts, server canonical-role authorization, deduplication,
   concurrency, expiry, failure/held behavior and no automatic unsafe replay. Ensure
   the bounded staging validation capability remains unavailable in actual production.
7. Validate production-sized reporting fixtures and hosted read-only performance:
   aggregation ≤2 seconds, DTO ≤2 MB and whole-report deadline ≤10 seconds, with
   justified indexes, bounded pagination/sorting and explicit partial/unavailable
   states. Do not lower budgets or silently truncate results to claim readiness.
8. Adopt and test durable encrypted preflight/postflight evidence and correct health
   permissions. Verify complete preservation coverage and reporting authorization;
   the staging historical-evidence exception is not a production waiver.
9. Review production Auth/onboarding/payment integration compatibility separately.
   Staging TEST mode and six OFF purchase flags are not evidence of production
   payment readiness. Analytics activation must not change payment capabilities.
10. Prepare a bounded activation/monitoring plan, destination visibility queries,
    dashboard coverage/health expectations, stop conditions and named incident owner.
    Obtain explicit founder production-activation authorization before changing any
    switch, publishing, scheduling delivery or initiating production capture.

After separately approved activation, require fresh effective-runtime evidence,
independent destination visibility and complete preserved baseline comparisons.
Stop on wrong destination, unexpected volume, privacy/authorization failure,
delivery ambiguity or unapproved data changes. Never treat this core staging
closeout as permission to enable production analytics or payments.
