# Live Fix #003 — controller/parser isolation review

Date: 2026-10-26 (America/Phoenix). Scope: local preparation only.
Baseline: `c8c948763c92c11545a41f5b3f33aa0ad49ae7c0`, preserving `a33fc8db5594a19c48f2c41ecf82fea1e505742d`.

## Decision

**Production activation and another media rehearsal remain NO-GO.** The local patch strengthens an existing native sandbox; it is not native Linux or hosted acceptance. The exact environment guard and standalone handler remain closed. No deployment, hosted invocation, environment edit, Supabase/Storage operation, production credential read, infrastructure purchase, or production activation occurred.

Netlify's controller environment contains automatically injected provider credential identifiers. Removing their names from a child environment does not isolate a compromised native parser from the controller. A kernel-enforced file/process/network boundary must install and pass adversarial tests before handling music. There is no recommendation to run another names-only diagnostic or broadly allow Netlify variables.

## Existing architecture and authority

| Component | Existing responsibility and evidence | Privilege/boundary |
| --- | --- | --- |
| Artist upload APIs / database RPCs | Canonical authenticated Artist ownership, private reservation, object/version/hash and asset state; existing `services/submission-media`, `app/api/artist`, migrations and regression suites | App identity and database authorization remain unchanged |
| Trusted broker/controller | `services/media-broker/server.mjs`, `database.mjs`, `storage.mjs`, `input-grants.mjs`: authenticated worker identity, fixed RPC allowlist, canonical lease/object resolution, short-lived exact-object authorization, one-use output capabilities and rechecks | Credentials belong here only; grants/URLs never enter parser arguments or logs |
| Worker orchestration | `workers/media/worker.mjs`, `direct-input.mjs`, `broker.mjs`: hash/count checked private download, post-transfer version/lease recheck, job-type/profile verification, heartbeat, cancellation, verified create-only output and completion | Trusted local file preparation, result validation and status transitions |
| Native parser | `process.mjs` → trusted `sandbox.py` supervisor → FFmpeg/FFprobe | Untrusted recording is opened only after mandatory sandbox installation; parser gets fixed local paths and `LC_ALL`/nonexistent HOME only |
| Artist acceptance / THE SEC | Existing acceptance/review RPCs and processing lifecycle tests | Processing completion never accepts a rendition, clears rights, approves a catalog record or publishes a track |

The existing broker and runtime-preflight deployment contracts remain **staging-bound**. The direct signer is not a production broker ready to activate by flipping one flag. A future production binding/credential/worker deployment needs its own exact authorization; this patch does not change those identities.

The historical immutable source profile allows 250 MB; it is deliberately not rewritten. The current private-transfer admission and strengthened parser invocation enforce the founder-approved **50,000,000-byte** limit. The resource qualification fixture now exercises that exact ceiling.

## Findings and local changes

1. **Broad filesystem write authority:** the previous launcher granted most filesystem operations over the entire scratch directory. The controller now checks canonical private directories, current ownership, file size, regular-file identity, no symlinks/hardlinks and a common job root. It reserves one explicit output with `O_EXCL`; an existing output is rejected even with `-y`. Landlock grants read-only input leaves and read/write/truncate on the pre-created output leaf. It grants no scratch creation, directory write, rename, deletion, links, device creation or execution. FFmpeg receives `-y` only after the controller's exclusive reservation.
2. **Open-ended syscall policy:** replace the network/group-escape denylist with architecture-pinned classic-BPF allowlists. Unknown calls fail with EPERM. Block sockets, ptrace, process_vm reads/writes, parent/peer signals, namespace and mount changes, process creation, pidfd access, io_uring and privilege APIs. clone3 returns ENOSYS; inspected legacy clone permits only same-address-space threads with known flags, no namespace/process escape. tgkill is restricted to the parser's own PID; prlimit permits self queries only. These restrictions also survive exec.
3. **Credentials and startup:** the controller builds a fresh environment rather than spreading arbitrary runtime configuration. Packaged Python gets only the four exact manifest-derived startup variables; extra or substituted names fail closed, including innocuously renamed credentials. Native Python uses isolated startup. FFmpeg's final environment contains only fixed locale/HOME. No signed grant, URL, token, request payload or application environment is passed. Other descriptors are closed before native exec; fd3 remains supervisor-only resource telemetry.
4. **Process privileges and budgets:** require Linux x86_64/aarch64, non-root UID, zero effective/permitted/inheritable capabilities, no_new_privs and Landlock ABI ≥3. No macOS or unsupported-kernel fallback. Set 40 CPU seconds, 768 MiB virtual address space, 32 descriptors, 32 per-UID tasks, zero core dump size and caller-bounded file size (never over 50 MB). The parser cannot raise limits or fork another process. Same-process threads share the memory/CPU budget. RLIMIT_NPROC is a per-UID limit, not a substitute for an aggregate container limit.
5. **Recovery and cleanup:** preserve process-group SIGKILL on abort, timeout, exit and errors; validate numeric budgets before spawning. Oversized telemetry now explicitly fails. Failed, cancelled and unsupported launches remove only their newly reserved output; successful outputs remain for existing independent hash/identity verification and broker storage. Existing job-finally cleanup removes its private directory. Existing lease-loss/retry/idempotency mechanisms are preserved.

The Python supervisor is trusted launcher code. It does not decode media. The controller is still trusted for job selection, arguments, runtime hashes, output validation and deployment integrity. Arbitrary caller-supplied `MediaTools` implementations are not an authorization interface and must never be exposed through a request.

## What is and is not proven

| Guarantee / test | Evidence and current result |
| --- | --- |
| Exact child configuration, credential rejection, renamed credential rejection | New portable regression tests PASS; no production environment values read |
| Path/size/owner-mode checks; symlink/hardlink rejection; concurrent output fencing | New portable regressions PASS, including exact output reservation and collision denial |
| Syscall policy / alternate ABI / future syscalls / parent-memory and network operations | 4,200 BPF-interpreter assertions PASS for both architectures; **not native kernel enforcement evidence** |
| Unsupported platform and cancellation cleanup | Actual local Python launch on macOS fails closed; output cleanup PASS |
| Canonical private grants, cross-account/path/origin denial, expiry, hash mismatch, interrupted 50 MB transfer and lease recheck | Existing eight direct-input regressions PASS |
| Private output capability fencing, stale proof / replacement / symlink / hardlink / FIFO rejection | Existing focused controller/file regressions PASS |
| Full portable/database/application suite | 1,978 tests PASS, 0 fail, 0 skip, 99.812 seconds; local fixtures only |
| Typecheck / lint / build | PASS / PASS with one inherited React Hook Form compiler warning / `npm run build` PASS |
| Native syscall installation, native FFmpeg under new policy, parent memory denial, network and actual Landlock denials | NOT RUN: local Docker socket absent; installed Docker.app executable missing |
| Native malformed-media, resource exhaustion, timeouts and output cleanup | Synthetic adversarial C fixture and Linux tests updated, **not executed** on this host |
| Full native upload→preview/waveform→Artist acceptance→THE SEC workflow under this patch | NOT RUN; existing application/database regression coverage is not hosted workflow acceptance |
| Hosted isolation and formal QA | NOT RUN; all 25 formal QA statuses remain Not Run |

Initial validation against the main checkout's unrelated dependency tree failed (older Zod/missing PDFKit/PGlite). Installing the isolated branch's exact lockfile using `npm ci --ignore-scripts --offline` resolved that environment mismatch; no shared dependencies changed. An initial full run had 1,975 passes and two sandbox permission failures (loopback listener and process inspection); the exact tests passed with local permission, then the complete final run passed. No failing result is represented as native qualification.

The Linux syscall fixture now checks parent ptrace/process_vm denial, /proc parent environment/memory denial, no sockets, no process-group escape, unknown syscalls, no fork, sanitized final environment, no unauthorized file creation, read-only input, memory exhaustion, file-size exhaustion and interrupted cleanup. Compile/run it only inside the explicitly unprivileged local Linux test image. It is not bundled as a new privileged service.

## Netlify feasibility and limitations

Official Netlify documentation describes functions as ephemeral runtimes and documents time/memory limits; it does not provide an application-controlled mount/PID/network namespace or cgroup contract for individual parser children. Node child processes alone do not provide those boundaries. See [Netlify Functions overview](https://docs.netlify.com/build/functions/overview/) and [Functions API](https://docs.netlify.com/build/functions/api/).

Landlock restrictions are monotonic and inherited; ABI ≥3 is needed for truncation control. Its domain hierarchy also restricts ptrace access. Filesystem policy does not hide all metadata, and restrictions on already-open descriptors need separate handling. This patch closes descriptors and adds a syscall allowlist; it does not claim a mount namespace or invisible process IDs. See [Linux Landlock documentation](https://docs.kernel.org/6.12/userspace-api/landlock.html).

Seccomp filters survive exec and constrain subsequently created threads; an architecture-aware allowlist denies unknown syscalls. It is still not a complete sandbox without file controls, descriptor hygiene, limits and a trusted supervisor. See [seccomp(2)](https://man7.org/linux/man-pages/man2/seccomp.2.html), [ptrace(2)](https://man7.org/linux/man-pages/man2/ptrace.2.html) and [process_vm_readv(2)](https://man7.org/linux/man-pages/man2/process_vm_readv.2.html).

The earlier host reported kernel 5.10.255. Landlock availability cannot be inferred from that release string, including possible vendor backports. No Landlock ABI/native denial result was obtained: the environment guard stopped first. **Netlify is therefore unqualified for this native parser.** A clean parent allowlist or successful Python `-version` cannot change that determination. If required syscalls/LSM are absent, there is no safe user-space toggle to grant them here; do not loosen the policy.

Recommended production runtime: retain Netlify for the app and trusted control plane only after normal authorization. Run the existing pinned native worker in an unprivileged Linux container whose host demonstrates Landlock ABI ≥3 plus seccomp, with read-only root, no capabilities, bounded tmpfs, pids/memory/CPU limits and a separate network-authorized controller. This reuses the existing worker/broker design; no resource is provisioned. First restore a usable local Linux engine to prove compatibility. Use Netlify for native parsing only if its actual environment passes the same adversarial requirements. If it cannot, obtain a separately approved minimal container execution quote before any recurring expense. A WASM parser could avoid native-kernel dependencies but is a distinct, unimplemented codec/runtime port, not a verified substitute.

## Performance and cost

Reviewed candidate ZIP: **12,787,613 bytes**, 238 entries. All 230 portable-runtime files are byte-identical to the approved rebound package; only the bundled handler (controller preparation code) and sandbox.py differ. Python 3.14.8, FFmpeg/FFprobe 9.0.2, native Linux AMD64 target remain unchanged. No private recordings, application credentials, .env files or private keys are included.

New-policy native startup, processing duration, peak RSS, maximum-file execution and retry cost are **unmeasured**. Prior ARM64 baseline evidence (before this policy): runtime load 92 ms, tool verification 163 ms, exact-50-MB validation 621 ms, parser peak RSS 13.3 MB and Node peak RSS 140.2 MB. These are comparison data only, not acceptance for AMD64/Netlify or the changed policy. Local preparation incurred zero hosted invocations and zero new recurring infrastructure cost.

A single future 1-GB 60-second invocation has a compute ceiling of ~0.1667 credits at the documented 10 credits/GB-hour, plus bounded request/response traffic; preview deployments are unmetered under that published credit schedule. This is an estimate, not a hard account spending control. Maximum approved consumption remains one existing credit, no purchases/recharge. Verify current billing and reject if the cap cannot be respected. [Netlify credit pricing](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/).

## Next gates and activation order

1. Restore an existing local Linux runner (no hosted resource or paid subscription), build the existing pinned worker image, run codec/malformed/resource/cleanup/adversarial suites as UID1000 with dropped capabilities, read-only root, pids/memory/tmpfs bounds and isolated network. Hash the image and evidence. Do not mark native PASS until actually executed.
2. Establish whether the intended Netlify kernel supports all required controls using provider confirmation or a separately reviewed, explicitly authorized trusted capability probe. Keep the existing media parent guard closed. The prepared media ZIP intentionally stops in the already-observed credential-bearing environment; **do not spend another invocation on the unchanged closed entry point**.
3. Only after native proof, independently review the child boundary and any proposed transition from parent credential exclusion to trusted-controller/isolated-parser attestation. Produce a new exact executable rehearsal manifest for founder approval. No flag, allowlist or guard transition is authorized by this report.
4. If Netlify cannot enforce the native policy, select the minimum existing-design container runtime and obtain an exact cost/credential/infrastructure approval before provisioning. No further names-only diagnostics or extra empty sites.
5. After separate hosted authorization, qualify one synthetic run; then separately authorize production identity bindings, narrowly scoped Storage/job credentials, bounded scheduling/retries/concurrency/alerts and capability changes. Preserve rights, version/hash, Artist acceptance and THE SEC review gates. Only then perform the controlled hosted upload-to-review acceptance test.

The local rehearsal artifact and detailed manifest are recorded in `output/live-fix-003-audio-processing-2026-10-25/runtime-transport/parser-isolation-release/`. They are not a deployment or an authorization to invoke anything.

## Exact source inventory

- `workers/media/parser-boundary.mjs` — new trusted file-leaf and exact-environment preparation.
- `workers/media/process.mjs` — integrate preparation, fixed cwd, cancellation/error cleanup and numeric budgets.
- `workers/media/sandbox.py` — mandatory Linux privilege/limits/Landlock/seccomp boundary.
- `tests/media-parser-isolation.test.mjs` — eight portable boundary regression scenarios.
- `tests/media-worker/policy-check.py` — 4,200 independent bytecode interpreter checks.
- `tests/media-worker/descendant.c` — updated synthetic native adversarial fixture.
- `tests/media-worker-remediation.test.mjs` — native isolation/recovery fixture integration.
- `tests/media-packaged-runtime.test.mjs` — packaged native isolation, resources and codec gate.
- `tests/media-worker/resource.mjs` — exact 50-MB resource qualification input.
- `tests/media-environment-guard.test.mjs` — assert exact child builder replaces unrestricted spreading.
- `tests/media-packaging-boundaries.test.mjs` — updated mandatory ABI rejection assertion.
- `scripts/media/bundle-runtime-rehearsal.mjs` — accurate native-isolation-pending receipt status.
- `package.json` — include new portable boundary suite in ordinary unit validation.
- This report.

No database migration, Storage policy, application route, authentication module, rights/licensing algorithm, catalog approval mechanism, broker credential configuration, production flag or production deployment file changed. `media.mjs`, `worker.mjs`, private transport and the environment guard/entrypoint are preserved byte-for-byte against the baseline. The isolated checkout used existing local Git objects; unrelated main-checkout Auth/PostHog work remains untouched. No remote push.
