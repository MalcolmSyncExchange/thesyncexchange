# Live Fix #003 — Native Linux validation

Date: October 26, 2026, America/Phoenix. Approved baseline: `f3752a5b9405e6d7b690b6c259de263b776ae4c9`.
Scope: local Docker execution, reproduced defect fixes, regression validation and operating-record reconciliation only.

## Outcome

**Local native Linux ARM64 validation PASS. Netlify native processing and production activation remain NO-GO.** No physical AMD64 or hosted execution occurred. The existing trusted-controller/restricted-parser design, environment guard, private Storage authorization, immutable source evidence, 50 MB admission, Artist acceptance and THE SEC approval boundaries remain in place.

The final native suite passed **22 tests, 0 failures, 0 skips** in 87.825 seconds, including the real-codec/local-SQL upload-to-review lifecycle and resource-exhaustion recovery. The complete application suite passed **1,980 tests, 0 failures, 0 skips** in 105.718 seconds. Focused portable regression coverage passed 31 tests. Typecheck, lint and production build passed; lint retains one existing React Hook Form compiler warning. Native runs also report a pinned-Python ctypes deprecation notice and Node module-type notice; neither is an execution failure.

## Docker and execution environment

Docker Desktop 4.96.3 was installed but the engine was not running. Its official `docker desktop start --timeout 60` command started it successfully with normal local permissions. There was no reset, reinstall, image prune, container deletion, settings change or restart of an existing container.

| Item | Verified value |
| --- | --- |
| Docker CLI / Engine | 29.9.2 / 29.9.2 |
| Context / endpoint | `desktop-linux`, local Unix socket |
| Linux kernel / CPU | `7.0.14-linuxkit`, aarch64; native ARM64 Linux VM on ARM64 Mac |
| VM allocation | 16 CPUs; 8,318,709,760 bytes memory |
| Worker allocation | 2 CPUs; 1 GiB memory; 64 cgroup PIDs; UID/GID 1000 |
| Outer controls | No network; read-only root/source; all capabilities dropped; no_new_privileges |
| Scratch | 512 MiB tmpfs at `/work`, mode0700, noexec/nosuid/nodev |
| Native runtime | Node26.11.1; Python3.14.8; FFmpeg/FFprobe9.0.2 |
| Kernel capability result | Landlock ABI8; no_new_privs and seccomp installation succeeded |
| Secret/config access | No application credentials, Docker socket, production data, hosted Storage or database supplied to tests |

All pre-existing containers were stopped before testing; their IDs and stopped state were preserved. New task containers and images are retained, not deleted. Docker remains running for subsequent authorized local work. Public dependency downloads during the pinned image build are not hosted processing tests or paid infrastructure.

## Reproducible defects fixed

1. **Merged-/usr library path:** O_PATH plus O_NOFOLLOW opened Debian's `/lib` symlink itself; adding a directory Landlock rule failed with EINVAL. Resolve only fixed trusted library roots to their canonical `/lib`, `/usr/lib`, `/lib64` or `/usr/lib64` locations, deduplicate them and retain O_NOFOLLOW. Unexpected targets still fail. Artist input/output symlinks remain prohibited.
2. **Optional loader cache:** the scratch image legitimately has no `/etc/ld.so.cache`; attempting to open it failed before processing. Add its read-only rule only when the fixed optional file exists. Missing required runtimes, tools, inputs or outputs still fail closed. No broader directory is granted.
3. **Transient thread exhaustion:** an extra Node orchestration wrapper exhausted the unchanged task budget; FFmpeg reported `pthread_create() failed: Resource temporarily unavailable`. The former generic exit mapping mislabeled it as permanently unreadable audio. Recognize only that observed error signature within the existing bounded private stderr buffer and return sanitized `temporary_system_error`, preserving existing queue retry caps, fencing, limits and output cleanup. Do not expose stderr or use it for authorization. A native regression proves retry_wait → successful recovery with one source asset and no review/approval bypass. Malformed media and explicit validation errors retain their rejection behavior.

Test-fixture corrections: outdated 250 MB output allowances became 50 MB; the 900-second fixture uses 8 kHz mono so duration coverage fits admission; the capability test uses the platform temporary directory instead of `/private/tmp`. Added distinct AIFC decoding, explicit native hard-limit/FD assertions and the resource-recovery scenario. No rights, approval, commerce, database, worker-deployment or application routing architecture changed.

## Native test results

| Area | Executed result |
| --- | --- |
| Runtime integrity | Altered manifest rejected before execution; pinned portable-runtime manifest and files verified |
| Audio | WAV, AIFF, AIFC, FLAC decoded; PCM variants and FLAC/AAC decoder inventory verified; AAC-LC previews playable/decoded |
| Input limits | Exact50,000,000-byte synthetic source accepted; oversized, corrupt, truncated, polyglot, invalid metadata, non-finite samples and unsupported MP3 rejected |
| Derivatives | Deterministic version-bound waveforms; 900-second duration coverage; 15/30/60-second and short-cue previews |
| Filesystem | Existing synthetic controller-only canary unreadable; input read-only; symlink/hardlink/FIFO/path escape and swapped output proofs rejected |
| Network/process | Socket creation, ptrace, process_vm read/write, parent /proc reads, parent/peer signals, process-group escape, unknown syscalls and fork denied |
| Privileges/environment | Exact two-variable final parser environment; no inherited application credentials; root launch rejected before media; capabilities zero |
| Actual parser limits | CPU40s; address space805,306,368 bytes; file output bound; 32 FDs; 32 per-UID tasks; zero core dumps; supervisor FD3 absent after exec |
| Failure handling | Timeouts/cancellation/file-size and memory exhaustion fail closed, reserved failed outputs removed; no late writers |
| Lifecycle | Actual decode → waveform → preview → Artist acceptance → SEC pending review; buyer cross-account access denied in local SQL emulator |
| Recovery | Interrupted read retries once without duplicate source; malformed recording never reviewable; native thread exhaustion remains retryable and recovers once |
| Publication safeguards | Activation flag stays false in fixtures; no catalog auto-publication, license issuance, orders or real financial activity |
| Postflight | Zero `/work` entries after all22 tests; cgroup peak681,447,424 bytes; zero max/oom/oom_kill events |

The SQL lifecycle uses a sequential local PGlite emulator. It is not hosted Supabase Storage, production Auth or native database-concurrency acceptance. Native denial results demonstrate the layered container plus parser controls; portable BPF policy assertions provide additional syscall-rule coverage. This is not an independent penetration test.

## Performance

Final packaged-runtime run (with concurrent host application validation): runtime verification/load592.49ms, version checks281.27ms; 50MB source validation1,189.71ms; parser peak14,757,888 bytes; Node peak159,825,920 bytes. The complete22-test container used at most681,447,424 bytes, including the SQL emulator. Duration varies with host load; these are observations, not production SLOs.

The final exact50MB source → waveform → 60-second AAC preview benchmark completed in **3.718 seconds**, with parser peak15,523,840 bytes, Node peak157,650,944 bytes, parser CPU2.300 seconds and peak scratch51,727,785 bytes. It produced a104,680-byte waveform and1,623,105-byte preview; `performance-final.log` retains the exact evidence. Every temporary source/derived object remains local and synthetic. No customer file was used. The legacy codec log's generic AMD64-emulation wording does not identify the actual run: `arch=arm64` and Docker host metadata establish that this execution was native ARM64. No AMD64 result is claimed.

## Failed attempts and environment limits

All initial failures remain in the evidence directory:

- Network-disabled clean build lacked cached apt build dependencies; the unchanged pinned build succeeded with public dependency access and FFmpeg hash/signature verification.
- Initial launch failures reproduced the two library-rule defects above.
- Two fixture failures reproduced obsolete size/path assumptions; corrected without changing admission or parser limits.
- Portable binaries executed from the Mac host bind mount received EACCES under confinement. Byte-identical dependencies copied into the Linux image filesystem passed. Deploy runtime binaries onto the image's executable filesystem, not a host bind mount; do not relax Landlock or mount protections.
- Extra-process diagnostic wrappers exhausted the fixed task budget. The synthetic diagnostic isolated the actual FFmpeg pthread error; no new privilege or resource allowance was added. The standard runner passes and postflight is clean. Use one supported worker per isolated identity, retain bounded concurrency, and do not add nested Node wrappers that consume the parser's shared per-UID task budget.

There are no unresolved failures in the supported final local test configuration. Physical AMD64, any hosted target, hosted private Storage, production broker credentials/bindings and formal QA remain unverified.

## Platform decision and costs

**Recommend the existing Linux container-worker architecture. Do not initiate another Netlify native-media probe in this task.** Netlify's previously observed kernel5.10.255 and injected provider credentials do not demonstrate the required Landlock/seccomp/filesystem/process contract. Its documented function controls do not establish an equivalent child boundary. The parent environment guard remains unchanged and closed. The local Linux success is not permission to relax it or proof of Netlify compatibility. See [Netlify Functions](https://docs.netlify.com/build/functions/overview/).

Use the already-implemented controller/broker plus isolated native worker on a Linux host that actually exposes the tested controls, with one bounded worker, no capabilities, read-only root, bounded scratch and authenticated, narrowly authorized private-object transport. Preserve rights, hashes, versions, job leases, Artist acceptance and SEC review. No new provider is selected or provisioned here. Existing staging-bound broker identities are not production-ready simply because native tests pass.

Current validation incurred **$0 new hosted-service cost** and introduced no subscription. For sizing the existing job-based design, published US Cloud Run Jobs rates yield approximately **$0.00228 per60-second job** at2vCPU/1GiB, or **$6.84 compute per1,000 recordings** if each uses three such jobs, before shared free quotas. This excludes retries, broker compute, registry/build, secrets, logs and transfer. It is a calculation, not a provider qualification or final quote; Cloud Run's architecture/kernel eligibility and account quota are not established. Any additional hosting requires a separate exact target/cost authorization. [Official pricing](https://cloud.google.com/run/pricing).

Stop here. The next operational decision is approval of a specific container execution target and its bounded hosted rehearsal; no production activation, new infrastructure or hosted test is authorized by this report.

## Exact file inventory

- `workers/media/sandbox.py`: trusted library canonicalization and optional cache handling.
- `workers/media/process.mjs`: bounded, sanitized transient thread-exhaustion classification.
- `tests/media-parser-isolation.test.mjs`: library-rule and failure-classification regressions.
- `tests/media-worker/descendant.c`: resource/FD/UID assertions and synthetic transient-failure mode.
- `tests/media-worker-media.test.mjs`: 50MB-compliant fixtures and AIFC coverage.
- `tests/media-worker-security.test.mjs`: portable temporary directory.
- `tests/media-packaged-runtime.test.mjs`: distinct AIFC package coverage.
- `tests/media-processing-lifecycle.test.mjs`: native resource-exhaustion recovery without duplicate evidence.
- This report.

No migration, Storage policy, production capability, Netlify deployment, secret, commerce, analytics, email or unrelated development change. Auth/PostHog working-tree changes in the original checkout remain untouched. Raw diagnostic copies are local evidence only and are not committed or included in production code.
