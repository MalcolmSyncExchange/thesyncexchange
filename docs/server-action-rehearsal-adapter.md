# Server-action dormant rehearsal adapter

Local-only repair from diagnostic baseline 982e8507e0b5a395c04c4479f7e6ff830a976c3a.
No application, migration, credential provider or preservation comparator changes.

The failed runtime runner in `/private/tmp/tse-final-runtime-rebinding/run.mjs`
awaited a browser response from `/auth/v1/token`. The login form posts to Next.js
`loginAction`, which performs `signInWithPassword` on the server. That browser
response cannot prove completion. The retained receipt stopped at `admin_login`,
`operation_failed`, HTTP status unobserved. Login success is historically unresolved.
The previously successful seven-step runner used an injected Supabase SDK login,
then independently verified its session, getUser and canonical role. Earlier browser
verification used login-form submission plus an Admin route transition. This repair
reuses the route/session verification mechanism, adding actual server-action POST
observation rather than requiring a browser-visible Supabase token request.

Use `createServerActionRehearsalDriver` with an already isolated Playwright page,
context/browser, approved in-memory credential provider and staging anon binding.
No executable hosted entrypoint exists. `runServerActionDormantRehearsal` fixes the
approved Admin, server-action flow and dormant expectation. Direct-login harness
callers retain their existing seven checkpoints; the server-action path has eight:
login_submission, server_action_outcome, session_establishment, auth_get_user,
canonical_admin_role, readiness_get_submission, readiness_http_response,
readiness_json_validation. Artifacts contain fixed labels/categories and HTTP
statuses only. A server-action 200 or 303 plus Admin route is not session proof:
session parsing, server Auth getUser and canonical role checks remain independent.

Capture a complete collector baseline before login and another after completion.
Privately pass `driver.preservationAuthorization()` to the unchanged comparator.
It identifies exactly one approved session and a bounded login interval. Never
serialize this accessor, session cookies or raw provider responses. Existing
sessions, roles, profiles, grants, analytics, Storage and policies remain strict.
The collector and comparator still reject partial reads and timing ambiguity.

No retry occurs after failure. Cleanup closes context and browser without signing
out/revoking hosted sessions. The harness saves terminal evidence before cleanup
and its outcome afterward. A future staging rehearsal requires separate founder
authorization, fresh safety checks and preserved snapshots even if login fails.
Absent grants yield dormant 503 with false binding flags; they do not establish
exact runtime authorization equality. Do not arm a grant to repair diagnostics.

## Local validation

- `npm run test:server-action-rehearsal`: 109/109.
- `npm run test:analytics`: 393/393.
- `npm run test:unit`: 1,067/1,067.
- `npm run test:security-pr2`: 261/261.
- `npm run typecheck`, `npm run lint`, module syntax and `git diff --check`: PASS.
- `npm run build`: PASS with required local execution permissions.

Lint retains one existing React Hook Form warning. The first build attempt
rejected the isolated worktree's dependency symlink; it was replaced by a local
dependency copy. The subsequent sandboxed build stalled and only this task's
build processes were terminated. The permitted local build passed. No source
safety checks were disabled. All tests used mocks/fixtures; no hosted calls,
login, session creation, grant, event, deployment or migration occurred.

GO for one separately authorized read-only rehearsal using this adapter and
fresh strict preservation snapshots. This is not event execution acceptance.
