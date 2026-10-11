# Controlled staging signup readiness — Phase 3

Prepared on 2026-10-11. **NO-GO. No real signup, email, configuration change,
deployment, migration, payment enablement, data deletion, or Git push occurred.**

## Auth change for separate approval

The before/after and rollback are saved in `staging-signup-auth-change.json`.
The staging project is `oppijylbkcbiqfuvckgj` (sync-exchange-posthog-staging),
organization `mrusvpfrejtelzxovdjv`. Its `main / PRODUCTION` dashboard badge names
the project's primary branch; it does not identify the production application project.
The exact Netlify site is `d8e851a6-ab37-4b0e-9403-9b2c1be65f13`, deploy
`6acb04b41c6d687bbab9c19f`, context deploy-preview, unpublished and ready.

The Auth URL Configuration dashboard currently shows Site URL
`http://localhost:3000` and no redirect entries. The proposed Site URL is the
exact deployment origin, and the single allowed callback is:

```
https://6acb04b41c6d687bbab9c19f--sync-exchange-posthog-staging.netlify.app/auth/confirm?next=%2Fonboarding
```

The approved source's `signupAction` and confirmation resend both call
`buildAuthCallbackRedirectUrl` with `/onboarding`; it builds `/auth/confirm` and
sets the `next` parameter with URLSearchParams. Existing runtime Auth health
reports the exact deployment origin. The actual confirmation email template
uses `{{ .ConfirmationURL }}`. Static link construction is compatible after the
proposed change, but no email has been rendered/sent to verify delivery.

Scope and affected behavior:

- Signup/confirmation resend, including artist and buyer signup in this staging
  project, gain the exact callback. No wildcard previews, production origins,
  or additional next destinations are added.
- All staging Auth flows that omit or supply an unapproved redirect fall back to
  the new Site URL. Templates using `.SiteURL` also receive the new default.
- Password recovery requests use a different redirect destination and are not
  enabled by this one-entry proposal; fallback behavior changes to staging root.
- OAuth providers are currently disabled; if later enabled, their default/fallback
  redirect uses this Site URL. Existing issued links are not rewritten by this work.
- No confirmation requirement, password policy, rate limit, SMTP setting,
  provider toggle, profile logic, or production project is changed.

Application procedure ONLY after separate approval: re-read project/deploy
identity and current values; stop if they differ from the captured before state.
Add the exact callback, save, then set/save the exact Site URL. Re-read both
values and the unchanged provider/confirmation settings. Verify redirect
construction with fixtures only; do not send or consume a confirmation link.
Rollback ONLY after separate approval: restore the old Site URL and remove only
the added callback after checking for drift. Do not overwrite another operator's
new entries. No database rollback or deployment is involved.

Reference: https://supabase.com/docs/guides/auth/redirect-urls

## Mailbox and quota

The founder-nominated mailbox was queried privately: zero matching staging Auth
users, identities, and canonical profiles (rechecked at 15:00:25 UTC).
The organization's filtered Team dashboard
shows no matching member (zero of one member). Custom SMTP is disabled. The
built-in service therefore cannot deliver to that recipient under current policy.
No mailbox address appears in this review document or diagnostic artifacts.

The configured email limit is two/hour/project. Remaining quota is **UNVERIFIED**:
the available dashboard and connector do not expose a remaining-quota counter.
Auth log traffic or persisted confirmation timestamps do not account for every
email-consuming operation and cannot substitute for that counter.

Alternatives requiring a founder decision: select an already-authorized exact
team address that has no staging Auth/profile match, or separately approve a
staging-only custom SMTP setup with confirmed recipient control and observable
provider quota. A new mailbox/alias alone does not make it eligible. Adding an
organization member expands access across a shared organization and is outside
this staging-only remediation; no invitation is prepared or sent.

Reference: https://supabase.com/docs/guides/auth/auth-smtp

## Privileged credential binding — PASS

The Netlify preview secret remains redacted and was not accessed, exported, or
tested as a placeholder in Phase 3. Source inspection established that existing
`GET /api/health/readiness` performs only storage list and database SELECT calls
using `createAdminSupabaseClient`. At 2026-10-11T14:40:56.276Z the exact deploy
reported serviceRoleReady=true, healthy PostgREST baseline access, and visible
canonical user_profiles. The overall readiness response was HTTP 503 because
broader marketplace dependencies are incomplete; this is not an Auth key failure.

Independent staging edge logs for 14:40:30–14:41:15 UTC recorded HTTP 200 GETs
to `/rest/v1/user_profiles` (2), `/rest/v1/tracks` (1), `/rest/v1/orders` (2),
`/rest/v1/order_activity_log` (1), `/rest/v1/generated_licenses` (1), and
`/storage/v1/bucket` (1). Both API and authorization roles were
service_role, with project and host `oppijylbkcbiqfuvckgj`.
Only project, host, path, method, role, status and counts were queried. No tokens,
signature prefixes, headers, body, query string, location, or user data were read.
The correlation window plus live readiness response establishes usable privileged
access to the intended staging project. It does not attest hidden unrelated
environment variables or permit any mutation.

## Deployment source attestation — UNVERIFIED

Intended commit: `79d1e01f5462fcfa91a4c4ce193abba8e8badd92`.
Git tree: `9fa0a47b67ae4f2e4df97d6a1e52599af5369f78`; 590 tracked files.
Netlify metadata has commit_ref=null, build_id=null, has_source_zip=false,
deploy_source=cli. The title is a claim, not proof.

The deploy API file manifest has 111 entries. All 53 Git-tracked public assets
match SHA-1 content hashes. Watermark.png is represented with a lowercase path
in the provider manifest, and its bytes also match. Generated Next.js manifests
identify build `0m-k9ccp-npsrvcx_bdc8` but contain no verified Git source binding.
Server handler artifact digest:
`0dbf2da171cec062ee8b2d88c5dd249bcb11916eba4e6ec4b9a8faa9419f9fbf`.
No retained independent build receipt ties that digest to the intended Git tree.
The prior temporary source/build validation directory is no longer available.
Public asset equality does not prove signup server-action source identity.

Minimum missing evidence: an independently verifiable original build/upload
manifest tying commit/tree and build inputs to that server-handler digest and
the exact deploy ID. Recover the original build package/receipt or provider
build provenance. Do not create a replacement deploy or assert a retrospective
title-based attestation.

## Prepared local diagnostic runner and observers

Phase 1 helpers at commit `c4bfc3c01409d5fca9a3a8187ee8ca70407dbc99` are unchanged.
New modules:

- `artist-signup-observers.mjs`: bounded read-only, project-pinned baseline,
  Auth/identity, canonical role/profile, confirmation, server-session, outbox and
  delivery observers. UUIDs remain private in memory; snapshots contain only
  counts, booleans and controlled statuses. Absent, unavailable and observed
  are distinct. Partial Auth evidence survives a later query failure.
- `signup-connector-bridge.mjs`: binds existing Supabase get_project/execute_sql
  and PostHog project-get/execute-sql tools. It parses their observed formats,
  drops unrelated fields, and fails closed on format or project drift. It has
  no key loader, analytics capture, write tool or configuration operation.
- `artist-signup-local-runner.mjs`: read-only preparation methods and a single-use
  guarded runOnce method. Preparation does not launch a browser. Execution
  requires explicit future founder authorization plus PASS for callback,
  recipient, quota, credential binding, source attestation and observer bridge.
  There is no executable live CLI or automatic retry.
- `signup-private-browser.mjs`: concrete isolated Playwright pageFactory and
  server-validated browserSession bridge. It imports installed dependencies only
  when invoked, uses no persistent browser profile/traces, blocks service workers
  and debugging log modes, and does not pass application secrets to the browser
  process. Session verification uses the public anon key and private in-memory
  cookies with Supabase SSR getUser; its fetch guard permits only staging
  GET /auth/v1/user and rejects refreshes, writes, query strings and redirects.

The eventual host binds authenticated connector callbacks and an isolated
Playwright pageFactory in memory. Application deployment stays unchanged.
Browser session evidence must come from a server-validated getUser result for
the same actor, staging origin and project; cookies, route changes and database
session rows alone are insufficient. The concrete session bridge is mock-validated;
a live authenticated session is deliberately UNVERIFIED because none may be
created in this phase. Bind the existing connector callbacks in the authorized
host before execution; no secret or session is exported to an artifact.
With required email confirmation, the initial test expects no session and does
not consume a confirmation link unless separately authorized.

No trusted HTTP Auth log adapter is asserted: without it the original harness
keeps server-to-server Auth request/response checkpoints unobservable. Persisted
identity creation is proven independently by SQL, never inferred from browser POST.
Read-only queries verified current observer schemas and existing fixture counts.
PostHog project 657650 has four preview/test records with four unique UUIDs.
Its signup_completed event is currently absent from taxonomy; the repository
defines the expected event. The verified SQL empty response is header-only,
with a taxonomy warning, not a transport error.

The runner writes the original workflow artifact before cleanup, then a separate
sanitized observer result. A passed browser workflow cannot establish total
success if independent event evidence is absent/unavailable/duplicated. The
observer artifact explicitly labels production impact unobservable from staging.
Production isolation also requires the source/credential/deployment gates;
the browser guard cannot constrain arbitrary server-side code.

PostHog deduplicated ingestion may hide transport retries; observer counts detect
persisted/visible duplicates, not every raw send attempt. A one-shot delivery
read can return absent before ingestion becomes visible. The authorized test
orchestrator may perform bounded read-only follow-up queries without submitting
again. No event retry/flush RPC may be called. Hard process kill or filesystem
failure can prevent final output; previous atomic workflow checkpoints survive.

Baseline at 2026-10-11T14:49:51Z: Auth users=3, canonical profiles=3,
outbox records=4, signup records=0, sessions=0. Refresh and check exact email
and identities immediately before any future authorized submission.
The final 15:00:25 UTC read reconfirmed users=3, profiles=3, outbox=4 and signup=0.

Focused validation: `node --test tests/signup-trusted-observers.test.mjs
tests/signup-diagnostic-harness.test.mjs`. Mocks include the complete local
runner, successful confirmation-pending signup, withheld delivery, profile-role
failure, duplicate records, project mismatch, timeout, response-format drift,
session identity mismatch, privacy canaries, and refusal to launch without gates.
All 39 focused tests passed. `npm run test:unit` passed all 217 tests.
`npm run lint` passed with the pre-existing React Hook Form warning at
components/forms/submit-music-form.tsx:178. `git diff --check` passed. The exact
callback proposal was also executed against a temporary copy of the immutable
source's auth-flow module and matched byte-for-byte. No browser was launched by
the tests. A read-only dependency check confirmed installed Chromium executable
and Supabase SSR createServerClient availability. Application typecheck/build were not run because only diagnostic MJS
and documentation were added; none of the existing application code was changed.

## Readiness matrix

| Requirement | Previous | Current | Evidence | Remaining blocker | Required founder approval |
| --- | --- | --- | --- | --- | --- |
| Exact Auth callback/Site URL | FAIL | FAIL | Captured live dashboard; minimum patch and rollback prepared | Settings unchanged | Apply the two staging Auth fields |
| Nominated recipient eligibility | UNVERIFIED | FAIL | Not a team member; built-in SMTP; zero existing staging rows | Ineligible address | Choose eligible unused address or separately authorize staging SMTP |
| Remaining email quota | UNVERIFIED | UNVERIFIED | Configured two/hour; no remaining counter | Capacity not independently observable | SMTP/provider alternative if required; approval cannot substitute for evidence |
| Privileged credential binding | UNVERIFIED | PASS | Runtime privileged reads plus staging service_role HTTP 200 logs | None for binding | None for verification |
| Exact application source attestation | UNVERIFIED | UNVERIFIED | 53 public byte matches, server digest; no build/source binding | Original immutable receipt/package missing | None to read existing proof; deployment remains prohibited |
| Prepared observer/runner logic | UNVERIFIED | PASS | Mock tests and live read schemas/baselines | Live host integration remains separate | None for local preparation |
| Concrete browser/session bridge preparation | UNVERIFIED | PASS | Mock-validated private pageFactory, GET-only server getUser proof, connector parser | Bind authenticated connector callbacks; live session deliberately untested | Separate controlled execution authorization |

**NO-GO** until confirmed defects and evidence gaps are resolved. Approval to
apply the Auth configuration is separate from permission to create the one test
account, emit its expected server-side signup event, confirm email, or clean up.
Cleanup requires separate scope/approval for only that future UUID and its verified
dependencies. Existing three fixture users/profiles and four analytics rows remain.
