# Failed bounded invocation diagnosis

Deployment `6acf04804fc1689f7d9acecd`, source
`41d809f2222639d8d62bc9a9cf2d2ce86f75625f`.

Confirmed defects: application POST runtime configuration assembly and harness
response evidence loss. Classification C (runtime mismatch caused by application
assembly), plus E (diagnostic harness defect). No authentication relaxation,
grant/schema repair or transport retry is justified.

The Admin readiness GET returned HTTP 200 with every check true. One grant was
armed at 2026-10-14T04:35:05.922444Z, expiring exactly five minutes later. The
single POST response object was returned to the harness, but JSON parsing threw
before the HTTP status was saved. That object is no longer retained. The receipt's
`http:200` describes readiness, not the event POST. Historical POST status cannot
be recovered from the saved browser artifact.

Supabase gateway logs at 04:35:07.612Z and .642Z show `/auth/v1/user` and
`/rest/v1/user_profiles` HTTP 200 for the approved Admin session. The tightly
bounded log window contains no capability/claim RPC; Netlify function logs show
no exception. Those observations support execution reaching the authorization
phase, but lack a per-request trace linking every server checkpoint. Do not turn
log absence into proof of an RPC never executing. The grant remained unconsumed,
with no event UUID; outbox and PostHog counts remained unchanged.

The deployed compiled POST assembles configuration with only `...process.env`
and demo mode. Readiness explicitly adds the build-time site stamp and public
Supabase/application values. Next config embeds the non-secret stamp at build
time; direct `process.env.TSE_BUILD_NETLIFY_SITE_ID` references are inlined, while
spreading the runtime object does not acquire it. The stamp is not a stored
Functions variable. A local fixture reproduces config=null for the old spread
and successful traversal to the claim boundary with the explicit compiled stamp.
The POST's config-null branch returns empty HTTP 503. This is a reproduced and
evidence-supported failure path; HTTP 503 is inferred, not a recovered historical
status. The independently confirmed last successful checkpoint is the Admin
readiness response; gateway logs additionally confirm approved-session Auth and
profile reads after arming.

Correction: POST uses the same explicit environment assembly as readiness.
All origin, canonical role, body, payment, project, token routing and expiry gates
remain unchanged. No SQL or transport implementation changes. Failure responses
now contain fixed categories and claim outcomes only. Before authorization,
denials remain generic and expose no configuration. After authorization, claim
errors stay `unknown`, never presumed safe to resend. Provider messages are never
returned.

The dependency-injected diagnostic harness has no live entrypoint or grant API.
It issues at most one request, persists status before parsing, records fixed
acknowledgment/claim categories, filters arbitrary response data, aborts timeouts,
and saves terminal and bounded cleanup results. Callers must retain the browser
until completion and supply an atomic, private artifact writer. The adapter must
pass its timeout and honor AbortSignal when supported. No automatic retry exists.

The expired, unconsumed singleton audit grant is preserved. It cannot be reused,
extended, reset or replaced under the existing contract. Another attempt requires
separately reviewed authorization/audit lifecycle handling; no deletion or
migration is proposed or authorized here. A diagnostic fix-forward deployment is
also required before hosted verification. No new request, grant or event was
executed during this task.
