# Live Fix #003 — processing activation decision and execution boundaries

Status: **local processing verified; hosted activation NOT AUTHORIZED / NOT EXECUTED**.
Baseline application: `41b773acf873070ab23ea02fdbcbf174f8be0133`.
Existing Netlify site: `e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5`, team `69dd559baa411c224e5e8507`.
Existing Supabase: `sgpubcpldfxcuhjjdcau`.

## What is already working

The existing processor fully decodes WAV/AIFF/AIFF-C PCM and FLAC; verifies frames, duration, channels and hashes; generates a version-bound min/max waveform and AAC-LC/M4A preview; and uses durable leased jobs with fencing and create-only derivative writes. Private playback checks the canonical session/role, owner, exact object version and hash before and after reading. Submission creates a pending THE SEC review, not approval or a license.

Production has the three correct private buckets, reads/reservations enabled, one queued source-validation job at attempt zero, and worker/activation disabled. No production mutation is part of this preparation.

The new synthetic integration test executes the actual `runOne` worker and FFmpeg engine with a sequential SQL-emulator broker and local object adapter. A 6,720,044-byte, 35-second, 96 kHz mono WAV reaches validated source, a 3,500-point waveform, a playable 30-second AAC preview, explicit Artist acceptance and a pending THE SEC review. Importantly, **`activation_enabled` stays false throughout**. Native SQL concurrency/ownership tests are separate; the emulator test is not presented as native DB or hosted Storage qualification.

## Why flipping a flag does not finish deployment

Current broker, remote worker, dispatcher, Storage URL construction, secret names and identity validation explicitly reject production and bind to `xgbiypruultmzbwhhjrx` / `tse-security-staging-media`. The database execution-name CHECK is also staging-specific. The dispatcher implements a manually nominated exact-job invocation, not an automatic production queue scheduler. No production broker login or runtime identity has been established.

Preserve those staging controls. Do not remove the production rejection, point staging secrets at production, grant the worker service-role access, enable a generic zero-argument claim, or change the execution-name CHECK without a separately reviewed production binding.

## Minimum hosting assessment

| Existing platform | Finding | Decision |
|---|---|---|
| Supabase DB and private Storage | Correct location for durable jobs, immutable identity, rights, review and files | Preserve and reuse |
| Supabase Edge Functions | Documented 256 MB memory / 2-second CPU budget; incompatible with the existing native Python/FFmpeg pipeline | Do not move decoding here |
| Netlify Background Functions | Up to 15 minutes; potentially suitable for bounded processing, but native binaries, Python, seccomp/Landlock and read-only scratch have not been qualified | Test prerequisites before buying another service |
| Netlify as the unchanged streaming broker | Documented streamed response ceiling is 20 MB; the existing broker streams originals up to the current 50 MB admission ceiling | Cannot simply deploy the unchanged broker here; would need a separately tested bounded transport design |
| Separate controlled Linux container service | Can package the existing runtime and preserve a broker/parser boundary, subject to actual native kernel tests | Conditional fallback only; no service/provider provisioned or spending approved |

Netlify's duration alone does not establish suitability. Kernel features require an actual hosted observation. Likewise, a missing system Python does not prove that bundling a compatible runtime is impossible. A separate service is **not yet proven necessary**. No recurring service is recommended for purchase until the small existing-platform probe resolves this question.

## Exact next approval: existing-site compatibility probe only

Prepared source: `scripts/media/netlify-runtime-probe.mjs`, deliberately outside `netlify/functions`, so ordinary application builds cannot activate it. A local Netlify `zip-it-and-ship-it` bundle is retained with hashes in the local evidence manifest.

1. Reconfirm existing site/team identity, live published deployment `6aded2ca28006086cbcd03c7`, and team-only protection for **all** non-production deployment URLs.
2. Check current credit balance and background-function eligibility in the existing team. No upgrade, credit purchase or recharge setting change. Abort if these cannot be verified or if less than one credit of safe existing allowance is available.
3. Create exactly **one unpublished draft deploy on the existing site**, containing only the prepared runtime-probe function and a static placeholder page. No Git push, production unlock, production publish, app build, new site, app environment copying, migration or capability change.
4. Independently verify anonymous access denial on that draft URL before invoking anything. Keep team protection unchanged. Do not create a public bypass link.
5. Invoke one authenticated `POST /_qualification/media-runtime` against the protected draft. The function also independently requires the exact site, `published=false`, and context `dev` or `deploy-preview`; production/published/foreign/branch contexts return 404 before a child is launched.
6. Fixed system-Python kernel probe: four-second child deadline, 2 KB child output, sanitized child environment, no shell, media, network, database, Storage or application credentials. Return only Node/OS/kernel and confinement prerequisite facts with no-store caching. Never enumerate environment variables.
7. Capture response, deployment identity, hashes, actual duration/usage and protection evidence. Confirm production deployment and all production flags unchanged. Leave the unpublished deploy protected; no destructive cleanup.
8. Stop. A successful prerequisite probe is **not** full hosted worker qualification and does not authorize production activation. Failure requires no loosening of parser isolation.

### Cost of this approval request

No new infrastructure subscription or recurring service. Draft/preview publication is not a production deployment. Netlify documents 10 credits/GB-hour for function compute; one 1 GB invocation lasting ten seconds is approximately **0.028 compute credits**, plus minimal request/response usage. Proposed total allowance: **at most one existing Netlify credit**, no purchased credits or recharge. This is an operator execution allowance, not a claimed provider-enforced per-job spending cap. Independently check team allowance before execution to avoid affecting the production team's credits.

## Subsequent production activation — separate exact manifest required

Once the host is identified, prepare and validate the exact runtime package, TLS broker origin and identity subjects, immutable image/function digest and transport. At that point bind the following items in a new approval manifest; unresolved identifiers are blockers, not placeholders accepted for execution:

- Production broker runtime profile distinct from staging; fixed Supabase target and exact runtime identity/audience. No arbitrary environment-based destination.
- Dedicated broker DB login: NOINHERIT, NOSUPERUSER, NOBYPASSRLS, no table/Auth/Storage privileges or membership in the legacy broker role. Eleven existing explicit RPC grants only; any automatic candidate-selection RPC must be separately scoped/tested.
- Server-side Storage authority held only by the broker; never in the parser, browser, logs or public bundle. Source reads recheck canonical object/version; derivative writes remain create-only and independently hashed. No bucket or policy weakening.
- Reviewed additive migration for production execution-identity binding and durable admission/spending limits, if required by the selected runtime. No migration is proposed for immediate application in this package.
- Bounded dispatcher that nominates exact eligible jobs, persists intent before invocation, reconciles uncertain invocation without blind re-execution, and drives source/waveform/preview jobs automatically. Existing manual staging dispatcher is not sufficient for ongoing use.
- Initial synthetic cohort only, one global execution and one running job per Artist; source admission stays 50,000,000 bytes; no sweep of unrelated retained media.
- Only `worker_enabled: false → true` after every gate. Keep `activation_enabled=false`, reads/reservations true. Worker enablement does not approve rights or catalog publication. No need to enable activation to submit to THE SEC, as demonstrated locally.
- No production application redeploy unless the chosen transport requires it; any such commit and Netlify deploy must be explicitly identified and reviewed first.

### Processing, retry and spending limits

Preserve source bounds: mono/stereo, 8–192 kHz, 1 second–15 minutes, 1 MB metadata, 4,096 container headers; source admission 50 MB. Preview 15–60 seconds (whole recording when shorter), AAC-LC at 44.1 kHz/256 kbps, maximum 4 MB. Waveform 100 min/max points per second, maximum 90,000 points / 2 MB.

Preserve parser CPU limit 480 seconds, address-space limit 805,306,368 bytes, no sockets/group escape, read-only input, bounded scratch, five-minute leases with 30-second heartbeat, 540-second worker deadline and three attempts. Current DB transient retries use **30-second availability delay**, not exponential backoff. Unsupported/corrupt inputs fail without retry; ambiguous output is retained and reconciled, never overwritten. The host scheduler must not multiply platform retries with duplicate job effects. Spending admission must be durable and atomically reserve worst-case work before invocation; a billing alert alone is not a hard cap. The approval must set the synthetic job count and monetary/credit ceiling after host costs are known.

### Monitoring and stop conditions

Record job/asset/profile/attempt, queued age, active lease age, completed/failed state, safe error code, duration, bytes and heartbeat failures. THE SEC `/admin/media` is the existing MFA-protected read-only processing view. Alert on expired leases, retries exhausted, source/version mismatch, derivative conflicts, unexpected queue growth and budget admission refusal. No credential, signed URL, storage path, raw parser error or private metadata in logs. Scheduler/alert wiring is outstanding, not claimed active.

Stop on private-data exposure, production target or source-version mismatch, unauthorized execution identity, failed native isolation, incompatible migration, unbounded work, spent allowance, missing recovery checkpoint or rights/catalog bypass.

### Hosted synthetic acceptance and rollback

Before broader admission, run the existing authorized synthetic draft through actual hosted source validation, waveform, preview selection/generation/playback, explicit acceptance, complete metadata/rights declarations, and THE SEC pending review. Confirm exact bytes/hashes and source versions; owner playback succeeds, foreign/anonymous access fails. Exercise corrupt audio, failed storage, stale lease, interrupted output and retry recovery. Confirm three ready assets and one pending review with no automatic rights approval, catalog publication, order or license.

On failure stop dispatcher admission and disable worker only; let bounded running jobs stop safely or expire, retaining evidence/private objects. Keep uploads/drafts available where safe. Do not delete buckets, weaken policies, reset attempts, erase permits or restore an old database over new writes. Application rollback, if needed, uses the prior published deployment; hosted SQL corrections require separate authorization.

Stripe TEST; commerce, public registration, outbound email and production analytics remain disabled throughout.

## Current documentation sources

- https://supabase.com/docs/guides/functions/limits
- https://docs.netlify.com/build/functions/background-functions/
- https://docs.netlify.com/build/functions/configuration/
- https://docs.netlify.com/build/functions/usage-and-billing/
- https://www.netlify.com/knowledge-base/publish-and-update-sites-with-the-netlify-cli/

No claim is made that the cached local ARM64 Node24 codec-test container is an approved production image; it is a test-tool environment only. Native AMD64, current immutable production runtime, hosted TLS/identity, transport, scheduler and independent review still require evidence.
