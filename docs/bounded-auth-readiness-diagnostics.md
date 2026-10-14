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
The readiness JSON must have `status=ready`, `ready=true` and all nine checks true;
extra response fields are never persisted. No subsequent event call is automatic.
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

## Validation results

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
