# Bounded validation authentication diagnostic repair

Baseline: `e22b9bb7f2500412094db0132878b80167ce06d9`, staging deployment
`6acf19cdbb101593794ceffb`. This change is local tooling only. No application
route, migration, analytics transport, payment gate or authorization is changed.

## Historical assessment

The stopped external runner `/private/tmp/tse-final-single-event/run.cjs` uses
native Fetch but evaluates `ready.status()` when preparing the readiness receipt.
Fetch exposes a numeric `status`; Playwright exposes a `status()` method. The
mismatch deterministically throws TypeError in the local reproduction after
parseable readiness JSON. The broad AUTHENTICATION phase and blanket catch
masked the actual checkpoint. This is a confirmed tooling defect and a plausible
trigger of the historical stop, not proof of the historical response status.
The old runner also failed to perform a separate session-based canonical role
query and persisted neither login, cookies, getUser nor HTTP headers checkpoints.
Do not reuse that external runner or rerun its arming operation.

Historical evidence distinguishes these facts:

| Checkpoint | Evidence |
| --- | --- |
| Admin login | Confirmed Auth last_sign_in_at and one new session at the authorized attempt time |
| Session cookies established | Not independently recorded; a database session does not prove cookie establishment |
| Auth server getUser | Not independently recorded |
| Canonical role | Admin verified in database preflight; no separate authenticated role checkpoint |
| Readiness GET submitted | Not independently recorded |
| Readiness reached Netlify | Two server-handler logs in the attempt window; neither identifies this route |
| Readiness HTTP/JSON | Status and validation unavailable in the historical receipt |
| Event POST | Zero attempts; outbox remains five unchanged delivered events |

Netlify historical logs were read with the supported CLI logs command, scoped to
this deployment and 06:20:20–06:20:45 UTC on 2026-10-14. Only fixed classifications
and timestamps were emitted. Raw logs, cookies, headers and response bodies were
not saved. Provider logs without route correlation cannot establish readiness.
See [official function log documentation](https://docs.netlify.com/build/functions/logs/).

## Replacement diagnostic contract

`runBoundedAuthReadinessDiagnostics` is a dependency-injected, read-only workflow.
It has no credentials, live runner, grant arming or event invocation entrypoint.
Supply an independently reviewed driver that implements:

- `login({signal})`: fixed `authenticated` boolean and numeric `httpStatus`;
  keep passwords and sessions private inside the driver.
- `inspectSession()`: fixed `established` and optional `expired` booleans;
  verify actual cookie/session establishment without returning cookie bytes.
- `getUser({signal})`: server-verified `userId`, `verified`, numeric `httpStatus`.
- `getCanonicalRole({signal})`: numeric `httpStatus` and role read from
  `public.user_profiles` for that authenticated, verified UUID, never metadata.
- `readinessGet({signal})`: exactly one authenticated GET Response from Fetch or
  Playwright, bound to the approved staging origin/deployment; no redirects or
  automatic retries. A submission checkpoint records driver invocation intent,
  not provider receipt of the request.
- `cleanup()`: close the owned browser/context and discard in-memory secrets;
  do not revoke hosted sessions or change grants.

The harness writes an initial safe artifact, a running checkpoint before each
operation, each completed checkpoint, observed HTTP status before parsing JSON,
and a terminal artifact after bounded cleanup. The artifact contains fixed step,
category, last confirmed checkpoint, status, request/response booleans and timeout
step only. Raw responses/errors, UUIDs, tokens, headers and cookies are discarded.
The default active-validation mode requires HTTP 200, `status=ready`, `ready=true`
and all nine checks true. The explicit dormant mode below has a separate strict
contract. Extra response fields are never persisted. No subsequent event call is automatic.
The caller must honor a failed terminal state. Artifact write failure prevents
new operations; cleanup is still attempted and artifact preservation is reported
honestly if the writer remains unavailable. Drivers must honor abort signals.

## Preservation and restart boundary

Read-only observation at 2026-10-14 06:27:29 UTC: both historical grants remain,
both expired/unconsumed, zero active grants, five unchanged delivered events,
zero pending events and leases. Global analytics remains false, six purchase
capabilities remain OFF. No diagnostic repair authenticates against staging.

The original event attempt did not establish destination visibility or SEC
acceptance. A future attempt needs a separately authorized new UUID, immutable
arming operation, effective runtime binding and independently verified readiness.
These expired grants cannot be reset, extended or reused. This document authorizes
no hosted change, deployment, login, event or grant operation.

## Validation results (baseline diagnostic repair)

- Focused authentication diagnostic tests: 21/21.
- `npm run test:unit`: 979/979.
- `npm run test:analytics`: 305/305.
- `npm run test:security-pr2`: 173/173.
- `npm run typecheck`: PASS.
- `npm run lint`: PASS, zero errors; one existing React Hook Form warning.
- `npm run build`: PASS. Initial local dependency symlink was rejected by
  Turbopack; replaced with a local copy. The subsequent sandboxed build stalled
  and was stopped; the same build command passed outside the sandbox.
- `node --check scripts/diagnostics/bounded-auth-readiness-harness.mjs`: PASS.
- `git diff --check`: PASS.

All new tests use mocks/local fixtures. No hosted authentication was repeated,
no new grant was created, and neither readiness nor event endpoints were invoked
by this remediation. Both expired grant IDs require preservation. The current
runtime UUID is expired; no next event attempt is runnable with that binding.

## Explicit dormant rehearsal mode

Use `runDormantReadinessRehearsal(options)` from
`scripts/diagnostics/bounded-dormant-rehearsal-adapter.mjs`, or explicitly select
`readinessExpectation: 'dormant'` in the harness. Default is `'ready'`; arbitrary
expectations are rejected before login. The adapter delegates JSON validation to
the harness, never rewrites HTTP status, never clones a response for later parsing
and never parses after cleanup. Retire the historical temporary adapter in
`/private/tmp/tse-auth-readonly-rehearsal`; preserve its receipts as evidence.

A successful dormant response must satisfy every condition:

- Actual HTTP status 503, captured and persisted before JSON parsing.
- JSON `status: 'not_ready'`, `ready: false`, `grantUsable: false`.
- `validationEnabled`, `stagingIdentityValid`, `globalAnalyticsDisabled`,
  `boundedConfigurationRecognized`, `paymentCapabilitiesOff` all exactly true.
- `authorizationMatches`, `artistMatches`, `operatorMatches` present as booleans.
  Each is recorded independently; true matches on an expired grant do not make
  that grant usable, and false matches with no grant do not fail dormancy.

Only this complete contract produces `status: 'passed'` with fixed
`readiness.category: 'EXPECTED_DORMANT'`. A raw 503 is never sufficient.
Configuration mismatch, invalid/missing flags, unavailable status, malformed JSON,
401/403/500, and unexpected 200 fail with fixed categories. Default `'ready'` mode
continues to reject 503 and demands all identity matches and usable grant on 200.

JSON is parsed inside the bounded operation before the response signal is aborted
and before driver cleanup. A JSON syntax failure, body abort and deadline timeout
receive distinct categories: `readiness_invalid_json`, `readiness_body_aborted`,
`step_timeout`. `failedStep` survives terminal cleanup. Safe readiness artifacts
contain only allowlisted category and boolean fields; raw JSON and additional
secret-bearing fields are discarded. Drivers retain secrets privately and must
use authenticated GET only, honor cancellation and disable automatic retries.

This local change does not authorize a rehearsal. One fresh read-only staging
rehearsal must be separately approved, with staging preflight and the existing
reviewed secure driver connected to this adapter. No grants or events are needed.
The application readiness route and all hosted configuration remain unchanged.

## Dormant diagnostic fix validation

- Focused diagnostic tests: 38/38, including a final native streamed-body fixture.
- Analytics tests: 321/321.
- Unit tests: 995/995.
- Security tests: 189/189.
- Typecheck, lint, build, module syntax and diff checks: PASS.
- Lint retains one existing React Hook Form warning and zero errors.

The broad suites ran before the final streamed-body test was added; the final
focused run includes that test. No runtime code changed after the broad checks.
All execution used local mocks/fixtures. No hosted read, login, readiness request,
grant write, event, migration or deployment occurred during this fix.
Recommendation: GO for a separately authorized single read-only rehearsal using
this adapter after a fresh staging preflight. Event execution remains unauthorized.
