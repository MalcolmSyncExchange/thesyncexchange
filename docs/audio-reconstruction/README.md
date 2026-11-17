# Internal audio reconstruction — local candidate

This is a replacement baseline derived from retained application/worker commit
`78b763e5`, under founder authorization following `273866ab`. It is **not** claimed
identical to published commit `1c6bbe00`. The published application remains
unchanged. Clean Media Recovery and its controller remain on HOLD.

## Implemented

- Existing source validation still queues the waveform. The additive migration
  queues a default AAC preview when the current master's waveform becomes ready.
  It respects an existing artist-selected region, uses the existing profile,
  reuses existing outputs, and leaves acceptance and SEC publication explicit.
- Preview creation uses a separate owner quota lock in both automatic and manual
  paths, avoiding inversion with existing upload-reservation locks. The existing
  20-preview/hour limit, job attempts and transient retry policy remain in place.
  If quota is exhausted, automatic enqueue is suppressed; the existing manual
  request reports the limit. No automatic loop circumvents the limit.
- Buyer waveform delivery is authenticated, session-bound and service-mediated.
  It checks current approved master/preview identity, private buckets, object
  versions, source digest and waveform digest; authorization is repeated after
  reading bytes. Buyers receive only a bounded, preview-relative envelope.
- A playback descriptor binds audio and waveform requests to one preview asset.
  Stale/replaced identities fail instead of mixing revisions. No original file,
  private Storage path, source identifier, token or hash reaches this DTO.
- Shared waveform parsing checks the version, encoding, count, size and sample
  bounds. Display bins aggregate peaks instead of skipping narrow transients.
  The preview uses its selected source region and measured encoded duration;
  trailing encoder padding is represented as silence. Seek/progress still uses
  the audio element's actual duration.
- Existing private original/stem upload, rights, licensing, authentication,
  marketplace and payment code remains in the retained baseline; no production
  records, queues, holds or permits were changed. FFmpeg/parser algorithms and
  security controls were not modified.
- Next.js/eslint-config-next were patched from 16.4.1 to 16.4.6 after the build's
  security gate rejected the retained release. The allowed transitive `qs`
  dependency was updated. The lockfile and security-version tests match.

## Reproduce local checks

Use the isolated feature worktree and its exact committed lockfile:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:audio-reconstruction
npm run test:unit
npm run typecheck
npm run lint
npm run build
git diff --check
```

The database fixtures are disposable PGlite databases, not production queries.
Loopback delivery/build-guard tests need localhost/process-inspection permissions.
No live database, payment, email or Storage acceptance is implied by these tests.
Local build uses no production environment file; it is not a verified Netlify
production-context release. Existing middleware/font-tracing and Hook Form
warnings must not be confused with a failed compiler or an executed hosted test.

The synthetic decoder integration script is
`tests/media-worker/reconstructed-waveform-integration.mjs`. Run only in the
existing image, with network none, no capabilities, non-root UID, read-only root,
bounded memory/PIDs/CPU and a disposable `/work` tmpfs. It imports the image's
existing media engine and the new renderer contract. It never contacts brokers
or receives credentials. ARM64 Linux image
`sha256:f90e9bf6c403b08810d88fc09732c4d119901d62ab962008cbd02cd4347b36c6`
passed: 32,000 source frames, 16 kHz mono, 200 waveform points, AAC-LC 44.1 kHz
preview, 600 display bins, cleanup complete. Synthetic source SHA-256:
`291caab458530e94fd3db1a867a017b0b35b851f86a00448be134c98272c710e`.
This is a new local synthetic fixture, not a claim about the prior approved WAV.
The AMD64-emulated image stopped at tool verification (`audio_unreadable`),
with cleanup complete. Its underlying cause is not established; no relaxation
was used. Neither result is new hosted native AMD64 evidence.

## Recorded local results

- Complete unit/regression suite: 1,995 passed, zero failed/skipped.
- Focused audio/access/rollback suite: 27 passed.
- TypeScript check passed; ESLint has zero errors and the retained Hook Form warning.
- Optimized local build passed with Next.js 16.4.6.
- Production dependency audit: zero reported vulnerabilities.
- Native ARM64 Linux integration passed; AMD64 emulation failed tool verification.
- Production deployment/processing/rollback acceptance: NOT RUN.

## Release and rollback gates

The source can be frozen with `git archive --format=tar <candidate-commit>` and a
SHA-256 receipt. The lockfile pins installation; source and built-file hashes
must be retained separately. Never include `.env`, CLI configuration, tokens,
untracked output or credentials in an uploaded release. The current local build
and source archive are not permission to skip the remaining gates.

`rollback.sql` was tested against this reconstructed local schema: it removes
the new trigger/locator and restores the retained manual-preview function while
preserving jobs, attempts, assets and capability flags. It is **not** a captured
production rollback. Before any production migration, capture and compare the
actual target function definition, grants and dependencies; preserve all seven
later production migration versions and provider Storage protections documented
by DB-001/DB-002. Do not replay the historical migration chain or substitute this
retained rollback for a target-specific one. Stop dispatch before any future
rollback; never delete queued work or reset accounting to undo an installation.

The original production deployment is still the unchanged recovery reference.
A complete replacement-release rollback, production compatibility of the new
SQL against the later hosted functions, and the later published ownership/
structured-rights/technical-review UI reconstruction are **not yet certified**.
Passing retained-baseline regressions does not establish those missing checks.

## Material runtime stop

Do not deploy the processing path on Netlify yet. No hosted proof establishes
the required Landlock/seccomp, filesystem/process limits and parser credential
boundary there. Site Functions-scope variables are available to serverless
functions; merely adding another function does not prove isolation. The local
Linux container pass is not a claim that the Netlify kernel supports the same
controls. Supabase hosted Edge's 256 MB/2-second CPU envelope is not a drop-in
host for the existing native worker. No hosted canary or new service was created.

Smallest next runtime decision: identify an existing isolated, credential-free
Netlify test target for a bounded native capability test, or obtain provider
proof sufficient to qualify that boundary. If unavailable or unsupported, a
TSE-controlled Linux worker is the viable architecture; using held infrastructure
or a new paid host requires a separate founder decision. Do not remove sandbox
controls, reuse the credential-bearing Next handler for decoding, or claim a
working hosted pipeline based on these local results.

References:
- https://docs.netlify.com/build/functions/environment-variables/
- https://docs.netlify.com/build/functions/background-functions/
- https://supabase.com/docs/guides/functions/limits
