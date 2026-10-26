# Live Fix 003: environment-name guard review

Status: local hardening complete; observed runtime inventory and hosted qualification blocked. No hosted action is authorized by this report.

## What failed

The approved 238-entry ZIP `0c96d494b56ae26eca09782c668798331e7b0405c7bba155893ed1fd3a22b3d1` ran once on private unpublished deployment `6adefe8070202d1f8992e936`. Request `01M5VH90QRJJT6X8HXZQ5JMRNM` returned HTTP 409, `STOP_ENVIRONMENT_ISOLATION`, `unexpectedCount:33` before Python, kernel probes, FFmpeg, media or scratch creation.

The guard compared `Object.keys(process.env)` with 35 exact names. It returned only the number outside that set. Consequently **none of the actual 33 names is available for individual classification**. The count establishes an allowlist mismatch, not 33 credentials. A count cannot recover the missing identifiers. Existing result, request and function-log evidence contain no key inventory.

Configured Netlify variables and injected process variables are different inventories. No supported live-process names-only read was found in the available Netlify tools or official OpenAPI. Environment/configuration APIs that return values must not be called and filtered afterwards. No environment values were retrieved during this investigation. No new hosted call, deployment, configuration or infrastructure change was made.

## Documented candidate classifications

These are candidate identifiers reviewed from the old guard and official documentation, **not observed variables from the stopped invocation**. Actual 33: Needs Verification.

| Category | Exact reviewed candidates | Policy |
| --- | --- | --- |
| Required runtime metadata | `_HANDLER`, `AWS_DEFAULT_REGION`, `AWS_REGION`, `AWS_EXECUTION_ENV`, `AWS_LAMBDA_FUNCTION_NAME`, `AWS_LAMBDA_FUNCTION_MEMORY_SIZE`, `AWS_LAMBDA_FUNCTION_VERSION`, `AWS_LAMBDA_INITIALIZATION_TYPE`, `AWS_LAMBDA_LOG_GROUP_NAME`, `AWS_LAMBDA_LOG_STREAM_NAME`, `LAMBDA_TASK_ROOT`, `LAMBDA_RUNTIME_DIR` | Permit these 12 exact names |
| Harmless platform configuration | `LANG`, `PATH`, `TZ`, `URL`, `SITE_NAME`, `SITE_ID` | Permit these 6 exact names |
| Potential credential or sensitive configuration | `_X_AMZN_TRACE_ID`, `AWS_ACCESS_KEY`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_LAMBDA_METADATA_TOKEN`, `AWS_LAMBDA_METADATA_API`, `AWS_LAMBDA_RUNTIME_API`, `LD_LIBRARY_PATH`, `LD_PRELOAD`, `NODE_PATH`, `NODE_OPTIONS`, `PYTHONPATH`, `SUPABASE_SERVICE_ROLE_KEY`, `NETLIFY_AI_GATEWAY_KEY`, `NETLIFY_AI_GATEWAY_URL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `TYPESAFE_API_KEY` | Deny, including documented automatic credentials and mutable loader configuration |
| Unknown for this hosted capsule / not needed by the application handler | `CONTEXT`, `DEPLOY_ID`, `DEPLOY_PRIME_URL`, `DEPLOY_URL`, `HOME`, `LC_ALL`, `NETLIFY`, `NETLIFY_DEV`, `NETLIFY_DEV_MODE`, `NETLIFY_LOCAL`, `NODE_ENV`, `PWD`, `TEMP`, `TMP`, `TMPDIR` | Deny pending observed inventory and specific provenance review; this category does not imply a credential |

Other AI base-URL names and loader settings are explicitly classified sensitive in code. Every unlisted name fails closed. No AWS or Netlify prefix is broadly approved.

Official evidence, reviewed 2026-10-26:

- [Netlify Functions environment variables](https://docs.netlify.com/build/functions/environment-variables/) documents the runtime site identifiers, Functions-scoped configuration, reserved AWS variables and automatic AI injection.
- [AWS runtime variables](https://docs.aws.amazon.com/lambda/latest/dg/configuration-envvars.html#configuration-envvars-runtime) distinguishes reserved metadata from execution-role access keys/session token, metadata token, and mutable library/search paths. Provider injection does not make a credential harmless.
- [Netlify AI Gateway variables](https://docs.netlify.com/build/ai-gateway/overview/#managing-environment-variables) documents provider API keys and gateway key/URL injection. Whether these names were present in this specific run is unverified.
- [Official Netlify OpenAPI](https://open-api.netlify.com/) does not document a live process key-name projection. Do not use AWS configuration retrieval as a workaround; it returns values and the underlying AWS account is provider-owned.

## Guard remediation and remaining limits

The pure classifier consumes a bounded array of names only, classifies each name, rejects credentials case-insensitively, permits only the 18 exact reviewed names, and denies unknown names. Malformed, duplicate, non-ASCII and oversized inventories stop without echoing input. Mutable Node/library configuration and internal endpoints no longer pass merely because the old guard allowed them. The media response contains counts only. There is no logging of names or values.

The dedicated-site fence requires `c91c881b-15ec-4342-82c1-381bc3cec86a`, unpublished `deploy-preview`, POST and a per-process attempt fence before any dependency work. The guard is not a provider-level credential exclusion control. Provider bootstrap may consume its own runtime configuration before the handler. `Netlify.env` or other provider credential channels are not proven empty by a `process.env` name check.

Unknown renames, credential suffix/prefix spoofs and future platform names are rejected. **A name-only guard cannot detect a secret hidden under an already approved name such as `PATH`.** Trusted configuration provenance is still required. Media subprocesses keep their explicit environment and absolute packaged executable paths; they never inherit `process.env`. No parent credentials are deleted, renamed or suppressed to obtain a pass.

The media algorithms, transport, rights checks, SQL, production app, 50 MB limit and approved old ZIP are unchanged. All 230 `portable-runtime/` ZIP files, including its manifest, remain byte-identical; only the bundled rehearsal handler entry differs. No package is approved for deployment by this local remediation.

## Narrow missing-evidence step

A separate offline diagnostic package has been prepared. It is not the media rehearsal: no Python/FFmpeg/runtime payload, application imports, file access or custom network calls. Its handler uses only `Object.keys(process.env)`, returns bounded names/categories in a protected non-cacheable response, logs nothing, and always stops with HTTP 409 / `qualified:false`. Malformed inventories return no names. Netlify's pinned standard bootstrap/telemetry remains provider code; it is not modified or represented as credential-free.

Separate founder authorization is required before any upload/invocation. Proposed target: existing private site only, unpublished deploy-preview, route `POST /_qualification/environment-names`, exactly one operator invocation, at most 1 GB / 60 seconds / one existing credit, no purchase, no configuration/Storage/database changes. Independently verify team protection on root and function URLs before invoking. Do not read deployment environment values. Preserve the original result and publish no inventory publicly. A new process/deploy does not prove the historical 33-name inventory; compare the new names and count honestly.

The per-process attempt fence is not durable global exactly-once enforcement. The single-invocation limit must additionally be enforced by the operator execution manifest; do not retry, reload/resubmit a POST, probe function URLs with authenticated execution, or assume cold-start state persists. No automatic media execution follows the diagnostic.

After an authorized names-only capture, classify each observed identifier with provenance; stop on any credential, unknown or unverified alternative provider credential channel. Do not relax the guard for platform credentials. Only after that isolation gate passes should one final protected synthetic runtime rehearsal be proposed under separate authorization. Production activation remains NO-GO.

## Reproduction and evidence

Run `npm run test:media-environment` (guard, diagnostic, packaging and direct-transfer regressions), `npm run test:unit`, `npm run typecheck`, `npm run lint`, and `git diff --check`. Native media tests require the existing network-disabled Linux codec container; never infer a native pass from JavaScript contract tests.

Offline builders: `scripts/media/bundle-runtime-rehearsal.mjs <unchanged-runtime> <new-output> <pinned-zisi-path>` and `scripts/media/bundle-environment-diagnostic.mjs <new-output> <pinned-zisi-path>`. Pin `@netlify/zip-it-and-ship-it` 16.3.0. Use fresh output folders, preserve old ZIPs, inspect generated receipts, and recalculate SHA-256. These builders never deploy. Validation logs, exact checksums, candidate classifications and inventory gap are retained under `output/live-fix-003-audio-processing-2026-10-25/runtime-transport/environment-guard-remediation/` in the primary workspace.
