# Artist signup diagnostics — Phase 1

This is diagnostic infrastructure only. No application source, Auth configuration,
analytics instrumentation, deployment, or database migration changes are required.
Live execution requires separate founder authorization. There is deliberately no
live CLI entrypoint, credential loader, browser launcher, database client, event
sender, session export, screenshot, or raw-trace recorder in these helpers.

## Root cause of missing evidence

The recovered original helper caught every exception and printed only
`Signup validation stopped; details suppressed.` unless the message contained
`gate`. It discarded the exception type, failing operation, and intermediate
state. Its only result write occurred after navigation, all fills, Submit,
`networkidle`, profile queries, and a session export. Any earlier failure therefore
left no result artifact. The temporary original file is no longer present; this
version-controlled replacement was reconstructed from the retained execution.

## Files and validation

- `scripts/diagnostics/artist-signup-harness.mjs`: bounded checkpoint runner,
  closed-schema diagnostics, atomic private artifact writer.
- `scripts/diagnostics/artist-signup-browser-driver.mjs`: injected Playwright page
  adapter with visible/editable form checks, bounded fills/click/response waits,
  explicit outcomes, and network restrictions.
- `scripts/diagnostics/signup-diagnostic.schema.json`: JSON Schema for artifacts.
- `tests/signup-diagnostic-harness.test.mjs`: entirely in-memory browser/observer
  mocks; artifact tests use temporary local files with no real identifiers.

Run locally:

```sh
node --test tests/signup-diagnostic-harness.test.mjs
npm run test:unit
npm run lint
```

The existing `package.json` already has unrelated local changes. It is deliberately
not edited: the focused suite is run explicitly and is not added to `test:unit`.

## Diagnostic contract

The runner takes an injected driver and a required artifact sink. It writes an
initial snapshot, a started/completed snapshot at each step, and a final snapshot
before cleanup. All operations have a per-action timeout and share an overall
deadline. A stalled operation therefore produces a final failure without waiting
for the browser to settle. The supplied writer uses a mode-0600 temporary file and
atomic rename; newly created artifact directories are mode 0700. Use a private,
unique artifact path per run. Never use a shared or untrusted output directory.

Checkpoints:

1. Browser initialization
2. Navigation started
3. Signup page loaded
4. Form located
5. Form ready
6. Test fields populated
7. Submit initiated
8. Submit completed
9. Auth request observed
10. Auth response observed
11. Navigation or confirmation outcome observed
12. Profile reconciliation verified
13. Final result recorded

`last_completed_step` retains the last completed workflow step, excluding the
final artifact checkpoint. `failed_step` identifies the operation that failed,
even if an outcome such as awaiting confirmation was already observed.
`submit_initiated` means the runner reached the click stage;
`submission_occurred` requires observing the actual form POST. A click or an HTTP
200 page load does not establish an Auth request or successful signup.

The browser adapter installs its response waiter before clicking, waits for
`domcontentloaded`, checks form uniqueness/visibility/editability and artist role,
checks native field validity, and waits for an explicit confirmation/error or
onboarding route. It requires a separate session probe to classify an authenticated
session, and a profile probe to verify a persisted canonical artist role.

## Auth visibility and integration boundary

This application calls Supabase Auth inside a Next.js server action. Browser
request interception cannot see the server-to-server `/auth/v1/signup` request.
Without an injected trusted server observer, both Auth checkpoints are explicitly
`not_observable`, both observation booleans remain false, and `auth_visibility` is
`server_side_unobservable`. A browser form POST is never relabeled as Auth.

A future trusted observer must correlate read-only Auth evidence to the exact
authorized run and supply only observation booleans and HTTP status. Its `start`
method runs before clicking, and receives sanitized observation callbacks so
partial evidence survives a subsequent submission timeout. Missing expected
observable evidence is an `auth_timeout`; a status of 400 or above is an
`auth_http_failure`. No live observer or database/session probe is provided in
Phase 1. Mocks exercise all of these contracts.

## Privacy

Artifacts are constructed from a fixed schema, never spread from driver results.
Exception messages/stacks, console text, network error text, request bodies,
headers, cookie/session state, field values, and query parameters are never copied
to artifacts. Route values are reduced to a fixed list of known application
paths; unknown paths become `other_route`. HTTP statuses must be integers from
100 to 599. Console/network categories and all results/steps are allowlisted.
Fields remain solely in the injected browser adapter; its fill results are not
returned. Neither module logs raw failures.

Tests inject secret-like canaries into exceptions, URLs, observer payloads, console
errors, and network failures and verify their absence from every saved snapshot.
This protects the supplied artifact sink. It does not sanitize an external custom
driver's own logging, arbitrary future probes, or third-party browser logging.
Those must obey the same restrictions before a live run is approved.

## Remaining limits and next gate

- Original failure step remains unknown; this repair does not retroactively
  recover discarded evidence.
- Browser behavior is validated with mocks, not a live signup or real browser.
- There is no automatic retry. Late signals cannot mutate a finalized result;
  driver cleanup is bounded, and a late page factory result is closed on abort.
- A hard process kill, power loss, hung filesystem, or unwritable destination
  cannot guarantee a final artifact. Previously written atomic snapshots retain
  the started step. Sink errors are rethrown as a fixed diagnostic error and
  cleanup still runs.
- Staging callback allowlist, password/rate-limit policy, live observer access,
  and safe session/profile probes remain prerequisites for a controlled signup.
- The network guard blocks browser analytics only. It cannot suppress the app's
  server-side signup analytics. Any future live signup must explicitly authorize
  its expected server-side events; Phase 1 never instantiates a live browser.

Phase 1 can be reviewed independently. A controlled signup remains NO-GO until
those prerequisites are verified and the founder separately authorizes the run.
