# Candidate 91bb92af: bounded production gate review

Observed 2026-11-17, approximately 23:36 UTC. Decision: **BLOCKED, not deployed**.
No production migration, upload, processing, capability change, or publication
was performed. Clean Media Recovery remains held; no billing investigation was
reopened and no paid infrastructure was added.

## Target-specific database progress

Read-only inspection of production `sgpubcpldfxcuhjjdcau` captured 117 relevant
procedure definitions/owners/ACLs, 578 public/media columns, media triggers,
Storage/media policies and migration identities in `production-schema-evidence.json`.
This is schema metadata, not a user-data or database backup.

- All candidate columns in submissions, assets, jobs, operations, capabilities
  and master_reviews exist with matching PostgreSQL types.
- Required processing/authorization procedures exist. The new automatic-preview
  trigger function and waveform locator are absent, as expected before migration.
- Eleven targeted function-definition checks matched the captured target.
  `production-preflight.sql` repeats that **read-only** drift gate. All results
  must be true immediately before any future reviewed installation.
- The captured original `media_request_preview` has postgres ownership. The
  candidate changes its lock order, not its owner/ACL.
- `production-rollback.sql` restores the actual captured target function and
  removes only candidate-added trigger/functions. It does not delete assets,
  jobs, attempts, permits or accounting records. It is local and was not applied.
- Two local PGlite tests passed: referenced target schema shape; forward/rollback
  of the captured preview definition with owner/ACL/state preserved. These do
  not establish production-wide replay, concurrency, or hosted worker acceptance.
- Production source/derived audio buckets are private. Legacy track-previews
  remains public; no policy or bucket visibility was changed.
- Production has two queued jobs at attempt zero. worker_enabled=false and
  activation_enabled=false; reservations/foundation reads=true. Preserved.

Future SQL sequence: stop dispatch and confirm no running leases; capture fresh
target definitions and grants; verify all drift gates; review additive migration
against later schema dependencies; install only the candidate migration in a
transaction; verify authorization and unchanged data/flags. On failure stop
dispatch, verify the target-specific rollback and execute it transactionally.
Do not replay the retained historical migration chain. Full target acceptance
and migration execution remain NOT RUN while the runtime gate is closed.

## Runtime gate: not qualified

The existing team-protected Netlify site is
`c91c881b-15ec-4342-82c1-381bc3cec86a` (`tse-media-runtime-rehearsal-003`).
Its current existence and all-deploy SSO protection were rechecked read-only.
It is not an established credential-free media execution environment.

Retained evidence under the original workspace's
`output/live-fix-003-audio-processing-2026-10-25/` shows:

- `execution/probe-result.txt`: Linux AMD64 kernel
  `5.10.255-268-309.1092.amzn2.x86_64`, Python unavailable, qualified=false.
- `runtime-transport/temporary-site-provisioning/protected-execution/runtime-result.json`:
  STOP_ENVIRONMENT_ISOLATION, qualified=false.
- `runtime-transport/environment-guard-remediation/diagnostic-execution-2026-10-26/observed-names.json`:
  platform credential/token and AI credential names injected. No values are
  needed or copied for this decision. This is historical evidence, not a fresh
  invocation or proof of current credential contents.

Automatic approval review rejected the env-list connector action because it
could retrieve secret values before filtering. No workaround, raw-token read,
environment update or media invocation followed. A provider-supported names-only
view or verified credential-denying child boundary is needed instead.

The existing parser requires non-root execution, no capabilities, Landlock
ABI>=3, seccomp and its existing CPU/address-space/file/process limits. Linux
introduced Landlock in 5.13; the historical 5.10 result cannot qualify this
boundary (nor prove what Netlify runs today). Background execution duration is
not proof of sandbox support. No secure hosted parser target is established.

Smallest viable architecture remains the existing broker + credential-free
Linux parser on an **already available TSE-controlled host outside the held
recovery infrastructure**. It needs verified Landlock ABI>=3/seccomp and the
pinned image for its architecture, private broker custody, bounded outbound job
claims and current admission/accounting controls. No such alternative production
host has been identified through the connected infrastructure. Selecting one
requires the host identity/access; purchasing one or unholding recovery is a
separate founder decision. Do not silently run codecs in the credential-bearing
Next handler or remove sandbox guards.

## Release verification

- 77 focused regressions passed: auth flow, checkout security, generated licenses,
  moderation/approval, catalog discovery and buyer waveform access.
- The prior exact candidate suite remains 1,995 passed, focused audio 27 passed,
  typecheck/build passed; no implementation edits invalidate it here.
- Production deploy `6ae2de199268b0a019a24568` is still ready, locked, published
  and unexpired, with its server handler retained. It was not replaced.
- Provider rollback availability is observed; an actual republish/rollback and
  target-specific post-migration application rollback were NOT exercised.
- Candidate source/build receipts remain in the original workspace at
  `output/audio-production-reconstruction/receipt.json`. No equivalence claim to
  the missing published source is made. Later ownership/structured-rights/
  technical-review feature compatibility is still unqualified; this review did
  not repeat source recovery or certify its preservation.
- Native ARM64 synthetic processing remains local evidence. AMD64 emulation's
  tool-verification gap is unresolved. Neither is new hosted runtime evidence.

Because the runtime gate fails, no production deployment or founder audio upload
was attempted. The website remains unchanged. The next useful action is choosing
an eligible non-held Linux worker host, not another source search or billing audit.

Official references:
- https://docs.kernel.org/userspace-api/landlock.html
- https://docs.netlify.com/build/functions/environment-variables/
- https://docs.netlify.com/build/functions/background-functions/
