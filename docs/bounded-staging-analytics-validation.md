# Bounded staging analytics validation

Baseline: `4f37c185766979a2f0f21b47860b5af8dc062fa3`. Local preparation only; this document authorizes no hosted operation.

## Architecture and boundaries

Ordinary `ANALYTICS_ENABLED` stays exactly `false` throughout. A new POST-only endpoint `/api/admin/analytics/validation` requires same-origin and canonical server-verified admin authority before opening a service-role client. It accepts **no request payload** (including adapter-represented empty streams; nonempty or stalled bodies fail closed after a bounded read). Artist ID, authorization UUID and the only permitted event (`submission_started`) cannot be supplied by callers. There is no browser SDK activation, scheduler, retry endpoint or new event contract.

The existing independent dedicated-staging contract binds platform site/build stamp, stable origin, staging Supabase project and credential role claims. The capability rejects other environments, missing/mismatched credentials, any production PostHog token, ordinary analytics enablement, payment modes other than test, enabled adapters, and Stripe credentials. Its separate private transport configuration selects `POSTHOG_PREVIEW_TOKEN`, US ingestion host and environment `preview`. No environment is mutated by that resolution. Actual production analytics behavior is untouched.

The endpoint also calls the existing read-only service-role purchase-capability RPC and requires all six flags OFF. The database RPC independently requires signed service-role request claims for project `oppijylbkcbiqfuvckgj` and locks/verifies the Artist's canonical `public.user_profiles.role`. The activation record is a singleton: one immutable Artist UUID, one event type, one authorization UUID, event limit exactly one and a fixed absolute expiry at most 15 minutes after creation. A new grant cannot be inserted while this permanent singleton audit record exists. Service-role delete permission is removed; identity/deadline/consumed/revoked/finalized audit data cannot be reset or extended.

The grant row is locked `FOR UPDATE`, consumed atomically, and the event is enqueued through existing `enqueue_analytics_event` with semantic dedupe key `bounded-validation:<authorization UUID>`. The DB generates the event UUID. Fixed properties are `{submission_attempt_id: authorization UUID, surface: submission_create}`. No track, profile or onboarding record is saved. The event is `is_test=true`, `is_internal=false`, environment `preview`; normal SEC SQL excludes it with `is_test=false` and `is_internal=false` filters. Synthetic activity must not be interpreted as a real submission attempt.

The new row remains **held** during its one delivery attempt, with one bounded lease and `attempt_count=1`. Ordinary `claim_analytics_event` workers cannot pick it up, including after a crash or lease expiration. Successful finalization uses the existing lease-compatible completion RPC and preserves UUID/time/deduplication. A rejection, timeout, unknown result or late acknowledgment leaves the row held, never schedules a retry and clears the lease when finalization succeeds. Duplicate/concurrent requests cannot send again. Transport timeout is bounded by both three seconds and the lease/grant deadline. An ambiguous ingestion/acknowledgment outcome must stop; it is never replayed automatically. HTTP200 means accepted and persisted as delivered; rejected authorization returns409; held delivery returns502.

## Required follow-on migration

`supabase/migrations/20261014024758_bounded_staging_analytics_validation.sql` adds the authorization table, immutable audit trigger and two service-role-only RPCs. Apply only to separately approved staging after verifying the already-applied reliability/onboarding source history and backups. Historical migration SQL, hosted version mappings and execution packs are unchanged. The exact 39-file manifest includes the new migration checksum; the previous 38 checksums remain unchanged. No existing outbox row is rewritten and no grant is armed by the migration. Review grants/RLS, migration checksum and timeouts before founder approval. Suggested manual transaction envelope: `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';` then the exact reviewed migration, then `COMMIT;`. No SQL in this task was applied to hosted Supabase.

## Future reviewed activation sequence

1. Obtain separate founder approval for the candidate commit/tree, migration, deployment, **specific existing canonical Artist UUID**, admin operator, authorization UUID and absolute UTC expiry. These live identifiers were not guessed or selected in this local task. Preserve baseline row fingerprints and establish applicable external QA/runner clearance; no quiet snapshot substitutes for acknowledgments.
2. Verify staging site `d8e851a6-ab37-4b0e-9403-9b2c1be65f13`, Supabase `oppijylbkcbiqfuvckgj` and PostHog project `657650`. Confirm token provenance and no production credential; all six purchase flags OFF; no scheduled retry workers; baseline five delivered events unchanged, no pending rows or active leases. SQL refuses a claim when any outbox row is undelivered or actively leased.
3. Apply the separately approved migration, then publish a separately approved replacement through the checked publication procedure. Keep `ANALYTICS_ENABLED=false`. Functions-only settings: `STAGING_ANALYTICS_VALIDATION_ENABLED=true`, `STAGING_ANALYTICS_VALIDATION_AUTHORIZATION=<approved UUID>`, `STAGING_ANALYTICS_VALIDATION_ARTIST=<approved Artist UUID>`. With no database grant, the capability is inert. Never assume a stored variable changed an existing runtime; this reviewed deployment must bind them. Do not navigate Artist submission/onboarding screens to produce the event.
4. Immediately before the approved invocation, create the singleton record with the exact reviewed identifiers and **fixed absolute** `expires_at`, no more than 15 minutes after DB creation time. This SQL arming operation requires separate authorization. Example template (placeholders are intentionally not executable):

   ```sql
   insert into public.staging_analytics_validation(id,artist_id,event,expires_at)
   values ('<APPROVED_AUTHORIZATION_UUID>', '<APPROVED_ARTIST_UUID>',
           'submission_started', '<APPROVED_ABSOLUTE_UTC_EXPIRY>'::timestamptz);
   ```

5. Use an already-approved admin session for one same-origin, body-free POST. No signup, confirmation link, new purchase or ordinary analytics activation is needed. Record the returned event UUID/status; query the audit/outbox independently. Verify exactly one added row, fixed properties/test flag, compatible delivered state and no pending or active lease. Independently query **PostHog project657650** by UUID: require exactly one matching event, timestamp and `is_test=true`. Ingestion acknowledgment alone is not destination visibility. Verify SEC exclusion independently. Stop on failures or unexpected rows; do not invoke again to retry.

## Effective shutdown and recovery

Consumption itself permanently disables further capture/transport for this grant, even if the Functions capability flag remains true. Expiry and revocation also reject new claims in the DB; ordinary capture/delivery stays disabled by `ANALYTICS_ENABLED=false`.

After the single invocation, under the separate operational authorization, revoke the audit grant without deleting it:

```sql
update public.staging_analytics_validation
set revoked_at=coalesce(revoked_at,clock_timestamp())
where id='<APPROVED_AUTHORIZATION_UUID>';
```

Revocation cannot recall a request already accepted by PostHog. Allow the bounded in-flight transport/DB acknowledgments to drain, then recheck state. A claimed/crashed grant remains spent, and its held event is excluded from generic retries. If finish is unresolved, a separately approved call to `finish_staging_analytics_validation` with the recorded lease and `p_accepted=false` can clear it into held state; first check destination independently and never resend. Held is an unresolved delivery state, not a claim of successful completion or zero undelivered rows. Preserve every audit/outbox record and delivered state. A restart or second event requires new founder review; the singleton is not reset by this capability.

The Functions flag can be set false later as defense in depth, but effective capture shutdown relies on permanent DB consumption/revocation/expiry, not a stored setting or a presumed environment refresh. Do not redeploy to disable under a one-event authorization unless explicitly approved. If no event was consumed, grant revocation is the authoritative shutdown. Before resuming any QA, require separate founder authorization.

## Validation and remaining limits

Mocks and in-memory PostgreSQL (PGlite) only; no hosted credentials, events, signups, payments, migrations or deployments. Focused tests cover successful event/ack, duplicate submissions, canonical role/Artist mismatch, unsupported event, missing labeling, expired/revoked grant, identity/production rejection, same-origin/admin/body restrictions, concurrent queued requests, crash recovery, stale leases, retry suppression, immutable authorization and five historical rows preserved on migration reapplication.

PGlite concurrent calls are queued on its single connection: this proves persisted single-use behavior across competing invocations, but not multi-connection PostgreSQL lock contention. Managed-staging privilege/claim mapping and true concurrent transactions remain rollout verification gates. PostHog secret-to-project/runtime binding and destination visibility remain separate live checks. A request already sent may be ingested despite a client timeout; never resend an ambiguous event. This is one durable event/at-most-one transport attempt, not a guarantee that the network delivers exactly once.

Recommendation: conditional GO for founder review of the local candidate and preparation of a separately authorized controlled rollout. NO-GO for execution until exact Artist/operator/grant/expiry, migration review, recoverability, runtime identity and QA clearance are approved. No permission to deploy or arm is implied by local test success.

Security reference reviewed: [Supabase RLS and grants](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function permissions](https://supabase.com/docs/guides/database/functions). The new RPCs use SECURITY INVOKER, explicit service-role-only execute grants and an empty search path.
