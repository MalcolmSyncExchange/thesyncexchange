# Bounded staging execution coordinator

Local diagnostic repair based on c9883a602fd51dce863c48c6c0a0e20812b21b04.
No application endpoint, transport, database migration, Auth behavior or payment
capability is changed. No hosted operation is performed by importing these tools.

## Exact execution contract

The coordinator fixes the approved Admin, Artist and authorization UUIDs:
6faee3df-7b4b-4d63-ba8d-1275139ccff5,
9e61c9ea-ed51-4328-8937-0b989dece2c9 and
a2926e46-df3b-4631-807e-4643e1f8c1f5. It has no grant-arming function.
A separately authorized operator must capture a complete baseline before arming,
record executionStartedAt after that capture, and use the existing immutable
arming RPC once. Capture the baseline with BOUNDED_EVENT_EXECUTION and the exact
executionAuthorization. The collector includes private same-MVCC-snapshot
projections for the target grant, matching dedupe event and singleton slot.
Historical rows expose only their private fingerprints. The target event's raw
properties are never returned: PostgreSQL compares them to the exact synthetic
submission_attempt_id/surface object and returns a boolean. Exact five-minute
expiry is also checked in PostgreSQL, retaining microsecond accuracy.

BOUNDED_EVENT_EXECUTION requires exactly one new grant, one consumed grant/event
relationship, one new submission_started event and the authorized slot transition.
Grant and event projections must have the exact reviewed schema. The grant binds
Admin/Artist/authorization, limit=1, database arming time and five-minute expiry.
The event binds the same UUIDs, preview environment, is_test=true, is_internal=false,
exact dedupe key bounded-validation:<authorization>, exact synthetic properties,
attempt_count=1, delivery_cycle=0 and no next_retry_at. Delivered/accepted and
held/unconfirmed states are distinguished. A held state can pass preservation
while execution acceptance fails: it is never destination visibility proof.
Historical grant/event fingerprints, other Auth identities/sessions, profiles,
Storage, RLS, privileges, environment and migration history remain strict.
Missing, partial, duplicate or malformed source coverage fails closed.

Approved login/session changes use the same unchanged timestamp normalization and
exact new-session identity rules as AUTHENTICATED_REHEARSAL. The login interval
must fall inside the execution interval; capture must bracket the entire operation.
READ_ONLY_NO_LOGIN and AUTHENTICATED_REHEARSAL retain their existing semantics.
No global allowance for new grants/events or slot mutations is introduced.

## Lifecycle

Create the concrete driver with createBoundedExecutionDriver using an isolated
browser/context/page and the approved secure in-memory credential provider.
The driver reuses the server-action adapter and adds only an empty same-origin
validation POST, guarded against duplicate calls. Create one coordinator with
that driver, the private pre-arm snapshot, executionStartedAt, collectAfter and a
sanitized artifact writer. Use the same collector instance for both snapshots.
The caller must complete fresh approved deployment/project, unused authorization,
quiet queue, historical data, canonical roles, token provenance, payments OFF and
no-retry-worker checks before any arming. The collector snapshot does not replace
those independent preflight checks.

The coordinator explicitly requires ready expectation: server-action login,
verified session, server getUser and canonical Admin role, then readiness HTTP 200,
ready=true, grantUsable=true and all identity/binding/safety flags true. It defers
inner harness cleanup; the authenticated context remains alive for the event POST.
Durable sanitized intent is saved before the single submission. HTTP status,
fixed category and event UUID are retained. No arbitrary actor/event/properties
are sent. After success, denial, timeout or ambiguous delivery it performs only
read-only postflight collection/comparison, then closes the browser/context once.
A second run on that coordinator, or a second POST on the concrete driver, is
rejected. There is no retry, renewal, replay or automatic second event.

If the response is ambiguous, the private snapshot may reconcile the event UUID
through the exact grant. Execution still fails; do not resend. If no event was
created, execution-mode preservation cannot claim the required one-event result.
It reports the individual assertions rather than waiving them. Failed/partial
postflight reads likewise block clearance. Terminal and cleanup evidence is saved;
artifact failures block submission or leave a terminal failure, never success.
Do not serialize private snapshots, projections, fingerprints, session accessor,
credentials, headers, cookies or raw provider errors. Artifacts contain fixed
checkpoints/categories, booleans, HTTP statuses and the approved resulting UUID.

## Acceptance and remaining gates

Local tests use mocks and fresh Unix-socket-only PostgreSQL clusters. They create
only synthetic local records; no hosted grants, events or sessions are authorized.
No new migration or deployment is needed for the diagnostic repair itself.
Before a separately authorized live execution, reverify deployment
6acfde50f68939d8d2e19252, source e22b9bb7f2500412094db0132878b80167ce06d9,
Supabase oppijylbkcbiqfuvckgj and PostHog project 657650. Independently verify token
provenance and approved runtime bindings. The absent-grant dormant response cannot
prove an exact authorization match; require all true readiness after authorized
arming. Maintain QA hold; verify external writers and schedules separately.
Destination verification is read-only and separate from ingestion acknowledgment:
query project 657650 by the database-generated event UUID alone, require one row,
then compare event, Artist, timestamp, test/preview label and authorization identity.
Verify SEC exclusions independently. On any ambiguity, preserve the held row and
require new founder authorization before any further operation.

## Validation receipt

- Focused coordinator/auth/preservation tests: 144/144.
- Analytics tests: 428/428.
- Unit tests: 1,102/1,102.
- Security tests: 296/296.
- Native execution fixture: 40 migrations; five preserved historical events and
  two expired historical grants; two independent claims create exactly one event
  with one recorded attempt. Held and accepted execution preservation both PASS.
- Existing native immutable renewal suite: expiry, wrong operator/Artist,
  concurrent arming/claims, reuse, historical immutability and production/role
  rejection PASS.
- Typecheck, lint, local build and diff checks PASS. Lint retains one pre-existing
  React Hook Form warning. The original fixture timing test failed because its
  postflight timestamp preceded the execution-finish marker; the local fixture
  clock sequence was corrected without changing verifier timing requirements.
- No hosted reads/writes, login, grant, event, migration, configuration change or
  deployment occurred. Native fixtures used disposable local clusters only.

Local tooling recommendation: GO for one separately authorized controlled event,
subject to the fresh runtime/preflight/destination gates above. No event execution
or staging acceptance is authorized or established by this local test receipt.
