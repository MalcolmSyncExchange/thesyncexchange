# Live Fix #003: portable media runtime and private file transport

Status: local implementation; no production activation or hosted rehearsal executed.
Baseline: a2c712a710826aa755249d9ce875064384e73b25, preserving the live 41b773acf873070ab23ea02fdbcbf174f8be0133 application. Isolated branch: codex/media-runtime-secure-transport.

## Implementation

The build-only extractor produces a self-contained Linux package with Python 3.14.8's required standard-library subset, FFmpeg/FFprobe 9.0.2, a private ELF loader/library closure and licenses. It excludes Node, pip, installation tools and application credentials. Node runs the reviewed interpreter with an explicit loader/library path and sanitized environment; neither system Python nor host glibc is assumed. Python remains justified by the existing resource/seccomp/Landlock launcher. A pure Node rewrite would still require a native confinement mechanism and provides no demonstrated benefit here.

Every package file is recorded by size/mode/SHA-256. Runtime loading verifies a separately pinned manifest digest, architecture, regular-file identity, path containment, hardlink/symlink denial and content hashes before launching tools. The application sandbox is part of the reviewed deployment ZIP beside portable-runtime; its path is explicit because Netlify relocates bundled JS modules. Binary files have read/execute-only permissions. No package is automatically added to the application deployment.

Existing parser protections remain mandatory: Landlock ABI >=3, seccomp denying sockets and process-group escape, no-new-privileges, 480-second CPU budget, 768 MiB address-space ceiling, file/output/open-descriptor bounds, one parser thread, fixed codec/protocol allowlists, read-only input, private per-job scratch and process-group termination before output verification. Version checks now have a ten-second per-tool deadline and respect cancellation. A host without confinement stops before untrusted media decoding.

## Secure transport

`InputGrants` is an opt-in broker capability. The HTTP server still verifies worker identity and the exact permit/execution/lease before the existing SQL resolver supplies an asset. Requests contain only the fenced lease, never Artist IDs, paths, buckets or URLs. The resolver's canonical owner/submission/asset path, Storage object ID/version, byte count, hash where already known, and active lease are checked before and after minting a 30-second read grant. Legacy arbitrary track paths fail closed in this new adapter; the existing adapter is preserved.

`PrivateInputSigner` holds the server credential privately and remains bound to the existing security-staging project. The default broker does not enable it. It requests a signed private object URL and validates the exact origin/path before returning a bounded grant. `DirectInputBroker` obtains it over authenticated control transport, downloads directly from Storage, denies redirects/public URLs/foreign origins/paths, limits bytes to 50,000,000, checks hashes, rejects compression/ranges, aborts at expiry and removes incomplete files. Post-transfer lease/version checks precede parsing and completion. A new source without a previous trusted hash is measured independently, then its exact object/version is fenced through the existing acceptance path. Derivatives retain create-only Storage writes, independent hash reconciliation and immutable output evidence.

Original audio never passes through a Netlify response body. Waveforms <=2 MB and previews <=4 MB retain the broker's existing bounded output path, below the documented binary request ceiling. No permanent public URLs or server credentials enter the parser/browser. All logs retain safe codes and IDs only.

Signed URLs are bearer capabilities, not a new Artist session. Revocation prevents new grants and authoritative completion; already disclosed bytes cannot be recalled. The worker's deadline is enforced locally, but **hosted CDN expiry/cache semantics are not verified**. Supabase documents that cached signed responses may outlive token expiry. A random per-grant cache nonce plus no-store requests avoids intentional reuse but is not claimed to force provider cache eviction. Before production, verify provider caching under expired/revoked grants or choose a provider-supported uncached object-scoped transport. Never delete originals or weaken RLS as an expiry workaround.

## Local evidence

Evidence root: `output/live-fix-003-audio-processing-2026-10-25/runtime-transport/` in the primary workspace, excluded from Git staging.

| Check | Result |
|---|---|
| Direct transport/boundary regressions | 10 PASS, including exactly 50 MB, malformed/foreign grants, expiry, truncation/checksum, partial-transfer recovery, existing-file preservation, post-transfer revocation/replacement and production-context refusal |
| Native Linux ARM64 portable runtime + lifecycle | 5 PASS: real WAV/AIFF/FLAC, 50 MB WAV, waveform/AAC preview, network/filesystem/group confinement and late-writer cleanup, full SQL-emulator upload-to-SEC flow, interrupted recovery and malformed audio |
| Native PostgreSQL 17.11/Supautils | 2 PASS: independent session/CAS, uncertain-save recovery and owner-only drafts; no hosted listener |
| Full unit regression | 1,959 PASS, zero failures/skips; prior complete run 1,958 PASS retained |
| Typecheck | PASS |
| Lint | PASS; one inherited React Hook Form incompatible-library warning |
| Production build | Webpack PASS; default Turbopack fails because the isolated checkout's dependency symlink leaves its filesystem root. No source workaround or unrelated dependency change |
| Linux AMD64 | Package and assembled handler start under local emulation; Landlock query ENOSYS and seccomp EINVAL block parser execution. No native AMD64 codec PASS claimed |

Native ARM64 measurements, **not Netlify performance claims**: manifest validation/load ~75 ms; version checks ~170 ms; WAV/AIFF/FLAC validation ~229–244 ms; 50,000,000-byte WAV ~588 ms; parser peak RSS 13,332,480 bytes, Node peak RSS 145,969,152 bytes. A later repeat is retained alongside these measurements. Full direct-Storage/SQL-emulator lifecycle reaches Artist acceptance and pending THE SEC review with activation false, zero orders/licenses, and no automatic catalog publication.

An initial minimal package missed ctypes' lazy layout module; it was corrected. A native ARM64 bind-mounted loader was denied by Landlock; placing identical bytes on the container filesystem resolved it without weakening policy. Logs of these failures and AMD64 emulation limitations are retained.

After the successful native acceptance runs and assembled-capsule emulation check, the final repeat encountered a local Docker daemon API 500/unavailable condition. The engine was not restarted because other work may share it. The final deadline/cancellation glue passes unit checks; a repeat of the final exact ZIP under Node 24 and the last native run remains Needs Verification once Docker is available. Earlier five-test native acceptance and two-test native SQL results remain valid evidence for the exercised code, not a claim of hosted acceptance.

## Exact dependency/isolation rehearsal — separate approval required

Machine-readable execution manifest: `live-fix-003-runtime-rehearsal.json`. This supersedes no prior authorization; the previous single probe authorization has been consumed.

1. Reconfirm existing site e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5 and team 69dd559baa411c224e5e8507. Reconfirm current production deployment and non-production team-only protection without changing settings.
2. Verify exact ZIP and dependency-manifest hashes, inventory and one-credit existing allowance; no recharge, purchase, build or paid add-on. The prior observed balance is historical, not proof of current allowance.
3. Create exactly one protected unpublished draft on the existing site, with the standalone function and a static single-run form. No Git publication, production unlock, site/environment mutation or application credentials.
4. Independently verify anonymous denial for root/custom/direct URLs; verify draft READY/unpublished and production unchanged.
5. One authenticated synchronous POST only. Linux AMD64 / Node 24 / 1 GB; platform ceiling 60 seconds, application abort 40 seconds, kernel child four seconds and version children ten seconds. No schedule/background retries. The in-memory repeat fence is additional protection, not a durable global invocation counter; operator records intent and never retries uncertain invocation.
6. Package hashes and architecture must pass. The bundled interpreter checks kernel prerequisites first. Any missing isolation stops; no media decode follows. If prerequisites pass, run only a generated two-second synthetic WAV, waveform and AAC preview in private temporary scratch, returning small JSON facts. No uploaded music or Storage is accessed.
7. Collect logs, resource/cost evidence and checksums; reconfirm production identity; leave draft protected and stop. No production activation follows automatically.

No new subscription or recurring infrastructure cost. At the current documented 10 credits/GB-hour, a 1 GB function's 60-second ceiling is 0.1667 compute credits; 40 seconds is 0.1112, plus tiny traffic. Propose a hard operator allowance of one existing credit. This is a bounded single synchronous invocation, not a provider-configured per-job billing cap. Native durations are not reliable hosted cost predictions. Exact billed consumption must be reported separately from calculated equivalents. No hosted credits were consumed by this local implementation.

Rollback: stop invoking and leave the unpublished draft private. No production rollback, SQL restore, object deletion or infrastructure change is necessary. On local failure preserve evidence and discard only disposable scratch. Qualifying dependencies does not qualify 50 MB hosted Storage transport, worker scheduling or production identities.

## Recommended activation sequence and remaining blockers

1. Review this source commit, exact local capsule and execution manifest; separately authorize the one protected dependency rehearsal.
2. If native confinement fails, stop. Evaluate a sandboxed WASI alternative or a minimal container runtime with explicit expected costs before requesting infrastructure approval; no additional paid service is established as necessary yet.
3. If prerequisites pass, bind a production-specific broker/worker identity, least-privilege RPC login, TLS origin and exact deployment digest in a separate activation manifest. Preserve staging-only rejects and grants. Existing runtime/execution-name checks are deliberately staging-specific and have not been removed.
4. Qualify signed object transport against actual private Storage: owner and cross-account denial, object replacement during transfer, 50 MB transfer before expiry, CDN behavior, cancellation and recovery. Storage credentials stay in the broker, outside the parser.
5. Complete durable automatic dispatch/spending admission, global/per-Artist concurrency, scheduler retry reconciliation, dead-letter/queue alerts and operator rollback. Existing leased jobs, three attempts, output fencing and safe errors remain; transient DB retries currently use a fixed 30-second delay. Do not multiply background-platform retries.
6. After explicit approval, run one hosted synthetic upload → processing → preview playback → explicit Artist acceptance → pending THE SEC review. Exercise storage failures and interrupted leases. Validate live account boundaries and exact hashes. Then enable only the approved worker flag for the controlled cohort; keep catalog activation false and require normal rights/catalog review.

No hosted migration, new RLS policy, bucket/configuration change, production capability change or application deploy was performed. Commerce/Stripe test-mode restrictions, registration restrictions, email and analytics holds remain. Formal QA stays Not Run until actual acceptance.

## File inventory

- `workers/media/packaged-runtime.mjs`, `process.mjs`, `sandbox.py`, `worker.mjs`: runtime validation, relocatable launcher and cancellation.
- `services/media-broker/input-grants.mjs`, `server.mjs`: opt-in fenced private read grants.
- `workers/media/direct-input.mjs`: bounded direct transfer and post-read reconciliation.
- `scripts/media/package-runtime.mjs`, `bundle-runtime-rehearsal.mjs`, `packaged-runtime-rehearsal.mjs`: offline extraction, exact capsule and dormant protected rehearsal.
- `tests/media-direct-input.test.mjs`, `media-packaging-boundaries.test.mjs`, `media-packaged-runtime.test.mjs`, `media-processing-lifecycle.test.mjs`: transport, gating, actual codecs/isolation and integrated lifecycle.
- `package.json`: relevant test commands.
- This report and `live-fix-003-runtime-rehearsal.json`: founder review and execution boundaries.

No migrations, application routes, Auth, licensing, finance, PostHog or brand/UI files changed.

References: [Netlify function limits](https://docs.netlify.com/build/functions/configuration/), [compute billing](https://docs.netlify.com/build/functions/usage-and-billing/), [Supabase private access](https://supabase.com/docs/guides/storage/security/access-control), [signed URL CDN behavior](https://supabase.com/docs/guides/storage/cdn/smart-cdn).
