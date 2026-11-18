# Complete staging preservation collector

Approved local baseline: `727ff177e1b06a54ecd5f132e3ad7b098287176c`.
Staging project: `oppijylbkcbiqfuvckgj`. This change adds local tooling only.
No application endpoint, schema, RLS, hosted setting or event contract changes.

## Explicit modes

Every collection and comparison must explicitly name a mode; no default or
inference exists. Unknown/missing mode fails closed.

- `READ_ONLY_NO_LOGIN`: expectedNewSessions must be zero, no login-window or
  approved-session fields. Auth users/identities/timestamps and existing sessions
  must all remain identical. Any added session fails.
- `AUTHENTICATED_REHEARSAL`: expectedNewSessions exactly one; approved Admin UUID,
  independently verified new-session UUID and a bounded login interval required.
  Only that Admin's last_sign_in_at/updated_at timestamps can change, monotonically
  within the interval. Existing sessions and all other Auth fields remain strict.

Both modes reject missing or changed protected records, additional grants/events,
changed canonical roles, onboarding data, Storage, policies, grants, RLS flags,
migration history or effective environment metadata. Snapshot ordering/completeness
and source fingerprints are independent assertions; failures are never interpreted
as empty data. Old temporary aggregate/rehearsal scripts must not be reused.

## Secure read-only transport

`createSecureStagingReader` verifies the existing staging service-role credential
using the reviewed provider (`getStagingPublicationCredential`), including project/
role claims and the read-only six-OFF capability RPC. It retrieves/rotates no new
keys, writes no secrets, logs no credentials and uses no Auth login API.

Auth sessions and authorization catalogs are not exposed Data API tables. The
collector additionally needs existing Supabase CLI management access from macOS
Keychain, held in memory. It confirms the management project ID/name and submits
only its fixed aggregate SELECT to that exact project's database/query API with
read_only=true. No arbitrary query argument, migration, grant, helper RPC creation
or RLS change is accepted. Insufficient management permissions block collection;
service-role possession alone does not authorize bypassing this requirement.
The returned database role must have superuser/BYPASSRLS read capability, so an
RLS-filtered subset cannot be reported as complete. This is privileged operator
read access, not new privileges granted to application clients.

Netlify environment metadata uses the existing local CLI authentication, fixed
staging site/team and GET-only supported APIs. Site identity/name is rechecked.
No secret or environment value is written to a plaintext file or diagnostic.
The optional injected readers/credential functions are test seams and trusted
operator adapters, not browser or public API inputs.

## Coverage

Each source provides collection success/failure, full count, completeness,
read timestamp and a private stable fingerprint. Safe diagnostic artifacts contain
source status, counts, timestamps and fingerprintPresent, never fingerprint values,
row IDs, raw data, cookies, credentials or secret-bearing provider responses.

| Source | Protected content |
| --- | --- |
| auth.users | Full user record; authenticated-mode timestamp exceptions only |
| auth.identities | Full linked identity record |
| auth.sessions | Existing session contents and stable session identities |
| public.user_profiles | Canonical roles, onboarding and account state |
| public.artist_profiles | Full Artist profile |
| public.buyer_profiles | Full Buyer profile |
| onboarding_records | Canonical onboarding timestamps, step and payload |
| storage.objects | Object identities, paths and full metadata |
| storage.buckets | Bucket metadata |
| staging_analytics_validation | Every historical grant field |
| staging_analytics_validation_slot | Active-slot binding |
| analytics_outbox | Every event field, payload and delivery state |
| purchase_capabilities | Six flags and singleton contents |
| existing_policies | Public/storage/Auth/private-schema policy definitions |
| authorization_grants | Relation/schema/routine/column ACLs, defaults, role flags and memberships; routine security/body metadata |
| table_security | Relation identities, owner and RLS/FORCE RLS flags |
| migration_history | Version, name and stored SQL statements |
| environment_configuration | Site-wide variable/context/scope/secret-classification/value metadata and provider update version |

17 database sources are read by one aggregate PostgreSQL statement using one MVCC
snapshot, with server transaction/snapshot identity and read times. No pagination
or independent table queries can silently yield mixed database snapshots. Every
row gets a stable ID and server-side SHA-256 of its full JSONB content. Raw row
content, passwords and tokens do not leave PostgreSQL. The synthetic row-number
field is explicitly excluded so inserting the approved session cannot shift
existing row fingerprints. Policies and privilege sets have stable catalog IDs;
ACL entries are sorted before fingerprinting.

Inside the local process these opaque fingerprints are wrapped in HMAC using one
fresh, private per-run key. Reuse the same collector instance/key for the snapshot
pair; unrelated keys cannot be compared. Object-key and source-record ordering
are canonicalized; array order is preserved where semantically meaningful.
Netlify scopes/context records are normalized as sets before hashing. The returned
private snapshot/privateCoverage fields are non-enumerable to prevent accidental
JSON logging; diagnostics expose no raw or secret-derived fingerprint values.
Never deliberately log or persist those private fields or the HMAC key.

The SQL source cap is 20,000 rows per source, and the transport rejects payloads
above 8 MiB. A capped, partial, duplicate-ID, malformed, missing or count-mismatched
source produces no usable snapshot. Per-request cancellation is 15 seconds; it
is not proof that the provider's SQL backend has already stopped. Collection
failure or cleanup/artifact failure prevents clearance and preserves fixed,
source-specific terminal categories where evidence is available.

## Reviewed no-login rehearsal procedure (separate authorization required)

1. Verify exact approved tooling/source and staging identities. Recheck 40 expected
   migration records/checksums, both immutable expired grants, five historical
   delivered rows/fingerprints, zero pending/leased rows, analytics false and six
   OFF capabilities. Do not replace the reviewed baseline with current data.
2. Construct one collector instance. Call collect twice, sequentially, with
   approvedAdminId and explicit mode READ_ONLY_NO_LOGIN. Save only each diagnostic.
   Never authenticate, fabricate a login interval or create a dummy session.
3. Require passed status, complete=true and verified fingerprints for every source
   on both observations. Compare result.snapshot with the approved verifier using
   mode READ_ONLY_NO_LOGIN, expectedNewSessions=0 and exact staging environment ID.
   Emit each sanitized assertion independently; retain exact firstFailedAssertion.
4. Recheck quiet state, immutable historical rows and disabled analytics/payments.
   Stop on any discrepancy, incomplete read, timeout, artifact failure or unknown
   coverage. Preserve evidence; do not retry, arm or execute an event automatically.
5. Close the collector and discard private in-memory snapshots/credentials/key.
   Report GO/NO-GO for preparing a separately authorized event package only.

This is an execution-ready local library/reader, not an auto-running hosted job.
The operator must supply the sanctioned preflight and safe artifact writer and
invoke the explicit two-collection sequence; no scheduled process is installed.

## Limits

Environment metadata is collected separately from the database and extends the
observation window; no distributed atomic snapshot or absence of transient writes
is claimed. Masked provider secrets are checked by presence, scope/context,
classification and update/version metadata; effective runtime equality and
secret-to-PostHog-project binding cannot be independently proven by this collector.
Storage coverage is object/bucket metadata, not binary file integrity. These scope
limits are explicit and must not be reported as verified secret contents or bytes.
The exact older historical assertion remains unrecoverable; new diagnostics do
not rewrite those receipts. Hosted compatibility is not claimed until the next
separately authorized read-only rehearsal passes.

## Local validation

Mocks/fixtures cover no-login and authenticated modes, unexpected Auth activity,
missing/partial reads, stable ordering, grant/event/Storage/role mutations,
credential and project rejection, provider failure, unsafe coverage, privacy and
cleanup. A fresh Unix-socket-only PostgreSQL fixture applies all 40 source
migrations and executes the actual aggregate SQL. Two unchanged no-login snapshots
pass; a synthetic approved one-session comparison passes; a synthetic profile
mutation fails. No hosted credential, database URL, login, event or session is used.
Initial fixture-only bookkeeping/version and profile-guard failures were corrected;
the final fixture cluster is stopped and removed in all terminal paths.

Catalog ACL semantics were checked against
[PostgreSQL documentation](https://www.postgresql.org/docs/current/functions-info.html).
All required broad tests, typecheck, lint and build are run locally; results are
recorded in the final report. Lint retains one pre-existing React Hook Form warning.

Final local results: preservation/collector tests 62/62; combined diagnostic tests
100/100; analytics 384/384; unit 1058/1058; security 252/252. Typecheck, lint,
build, syntax and diff checks PASS. Native PostgreSQL: four complete snapshots,
zero-session and approved one-session comparisons PASS; injected profile change
rejected. All 40 migration files were applied to the fixture; its bookkeeping uses
synthetic unique execution labels and does not modify or claim hosted mappings.
No hosted access or staging authentication occurred during implementation/testing.
