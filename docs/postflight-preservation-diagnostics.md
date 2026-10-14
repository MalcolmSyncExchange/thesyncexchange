# Postflight preservation verifier

Baseline: `d2344e78272eb17c1df04d972610d27b678f6371`.
This is local diagnostic tooling. No application route, migration, Auth setting,
analytics transport or payment gate is modified.

## Historical finding

The exact historical failed assertion is **not recoverable from retained evidence**.
The original `/private/tmp/tse-final-dormant-rehearsal/run.cjs` stored only
`phase=PRESERVATION`, `failureCategory=VERIFICATION_ASSERTION_FAILED` and
`failedStep=PRESERVATION`. It kept both contemporaneous snapshots in process memory
and discarded the AssertionError identifier/message before terminating. There is
no retained preflight record map to replay. The seven authentication/readiness
checkpoints passed; this does not establish preservation.

Possible assertions in that phase were: grants unchanged, queue unchanged,
non-Auth domain snapshots unchanged, normalized Auth users, normalized Auth
identities, existing sessions, exactly one added session, added-session owner,
and raw provider configuration equality. Provider errors alone would not account
for the recorded AssertionError category. The record does not identify which
assertion fired. Original receipts and scripts have been preserved, not rewritten.

Later independent observations confirmed preservation against an older baseline;
they are not a replay of the lost before/after snapshots and cannot retrospectively
prove the exact assertion or exclude a transient change between observations.
Classify the historical root cause as **E: missing diagnostic evidence / F:
insufficient evidence**. Neither a genuine mutation (A), expected Auth activity
(B), snapshot timing (C), nor comparison logic (D) is established as that trigger.

Two implementation defects are independently confirmed:

1. The catch collapsed distinct assertion failures into one phase/category.
2. Existing-session equality used `JSON.stringify` on objects. Property ordering
   alone can change the string without changing the record. A local regression
   reproduces that false failure. Raw provider-array ordering is likewise not
   proof of a setting change. This confirms a comparison defect, not the cause of
   this historical failure.

## Replacement contract

Use `capturePreservationSnapshot` to capture every required domain from a complete
read-only baseline and postflight read; compare with `comparePreservationSnapshots`.
`runPostflightPreservation` records each fixed assertion and a sanitized terminal
state. It has no hosted entrypoint, credential lookup, authentication operation,
grant write or event invocation. Retire the old temporary aggregate runner; do not
rerun its authentication code merely to diagnose this assertion.

The private snapshots require stable string record identities, full canonical
fingerprints, domain completeness, read-only and consistent-read attestations,
transaction identity, staging project identity and bounded observation times.
Object keys and domain row order are canonicalized. Arrays *inside a record*
retain their order; callers must represent provider sets such as scopes/contexts
as normalized stable identities before capture. Never drop records, overwrite
duplicates or ignore unknown effective provider configuration fields. Capture all
settings, secret classification and token bindings privately; a value change
must remain detectable. Display/audit metadata is not an effective runtime value.

Required domains: Auth users, identities and sessions; canonical, Artist and Buyer
profiles; Storage objects and buckets; analytics outbox; both historical grants and
the active slot; policies; migration history; environment configuration. Missing or
partial domains, duplicate identities, invalid fingerprints, overlapping/stale
observation windows and wrong project/operator fail closed. Empty arrays are valid
only when the complete consistent read actually establishes an empty domain.

Collect database domains under one read-only repeatable-read transaction (or one
consistent aggregate query); obtain its snapshot/transaction identity from the
server. Verify successful full reads and any pagination completion. Environment
configuration requires a separate supported provider read; normalize sets and
record its observation interval. No distributed atomic snapshot or absence of
transient writes is claimed. A caller's attestation is not independent proof of
collection correctness: the live collector must be separately reviewed before use.

Only explicitly authorized changes are allowed:

- On the approved Admin's Auth user and associated identity records, only
  `last_sign_in_at` and `updated_at` may change. Each changed timestamp must be
  valid, monotonic and inside the supplied authorized login interval. All other
  fields are fingerprinted and preserved.
- Exactly one new Auth session, with the exact independently verified session UUID,
  approved Admin owner and creation time inside that login interval. Derive the
  session identity privately from the server-verified login/session; it is never
  emitted in diagnostics. Existing sessions cannot change or disappear.
- No new or changed grant, event, profile, Storage record, policy, migration or
  effective environment setting. Preserving timestamps cannot mask changed roles,
  credentials, email, ownership, payloads, delivered states or grant expiry.

Before observation must end before authorized login starts; after observation must
start after login ends. A timing failure is reported as inconclusive and blocks
clearance; it never silently waives a mutation failure. All domain assertions are
reported independently once snapshot identity, timing and completeness are valid.
No domain failure prevents recording failures in other domains.

Private fingerprints and input rows must remain in memory; never log or put them
in reports. Artifacts contain only fixed assertion names, booleans, fixed categories,
first failed assertion, phase and artifact-preservation state. A partial/provider
read is localized to read_before/read_after without raw exceptions. Artifact errors
stop further reads and terminal preservation is reported honestly.

## Remaining limitations

No hosted verification or replay occurred in this local repair. The historical
assertion remains unknown. A new, separately authorized read-only rehearsal with a
reviewed complete collector must validate the replacement on fresh before/after
snapshots. Do not reset/extend historical grants or generate an event to test this
verifier. A successful local fixture suite is not staging release acceptance.

A fresh preflight remains mandatory before capturing the baseline: verify the
approved historical event IDs/payloads/delivered timestamps, both immutable grant
rows, zero pending/leased events, global analytics disabled, six OFF capabilities,
source/deployment identity and exact migration history. This verifier compares
against that independently approved baseline; it does not legitimize a changed
baseline merely because the later snapshot matches it. Input records are JSON
records from the reviewed reader, with timestamps serialized as ISO strings.

## Local validation

- Preservation verifier tests: 36/36.
- Combined focused authentication/dormancy/preservation diagnostics: 74/74.
- Unit tests: 1032/1032.
- Analytics tests: 358/358.
- Security tests: 226/226.
- Typecheck, lint, build, module syntax and diff checks: PASS.
- Lint has zero errors and one pre-existing React Hook Form warning.

All test execution uses local mocks/fixtures. No hosted reads or writes, login,
readiness call, grant operation, event, migration or deployment were performed.
The broad test suites were repeated after localizing partial-read capture failures
by their fixed domain assertion. No subsequent runtime behavior change is made.
Recommendation: GO for preparing a reviewed, separately authorized read-only
rehearsal with the complete collector. NO-GO for an event-bearing execution until
fresh coherent snapshots pass; the exact historical failure remains unknown.
