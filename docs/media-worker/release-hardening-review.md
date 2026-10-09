# Historical release-hardening assessment — superseded

This Node24 candidate report is retained as prior evidence. The authoritative remediation source review is `release-runtime-remediation.md`; exact candidate results are in the separately sealed release evidence record. Do not use the historical approval or scan totals below for the new runtime.

# Media release hardening candidate

Source-only continuation of `039eb12444ac260dc563f50996f46d0871af0319`. No hosted migration, account, Storage, worker, job, capability, image push or deployment is authorized or executed. The earlier deployment review's image figures are historical baseline evidence; this document supersedes its container/runtime candidate assessment only.

## Runtime boundary

Use pinned official Node 24.21.0 and CPython 3.14.8 Debian 13 build stages, signed APT snapshot `20261007T000000Z`, and an explicit Debian ELF/stdlib closure in the final scratch stage. This is a Debian/glibc runtime with accurate Debian package metadata, not an unknown-OS image. Missing OS/package scan coverage is an error. Broker retains four Debian packages and Node production dependencies; worker retains six Debian packages, Node, the sandbox's Python stdlib subset and minimal FFmpeg. No apt/npm/pip/compiler/curl/shell/gcloud/Terraform runtime. Keep Node, Python, Debian and FFmpeg licenses. The diagnostic descendant binary is retained for isolation preflight.

Node stays on the existing major version. Python is now official CPython 3.14.8 rather than distro 3.11. Sandbox behavior and complete native arm64 tests were exercised; native amd64 remains required. No SSL, SQLite, Expat/XML, socket or compression/archive extension modules are copied into Python. The launcher still enforces Landlock, seccomp, no-new-privileges, file identity, process groups, cleanup and parser limits. Only trusted wait4 CPU/RSS metrics changed.

FFmpeg 9.0.2 archive SHA-256: `8c3850283eb25fa026482078a04051e0be17347b09ef81a0849bec15a96e002e`. Verify the detached release signature against fingerprint `FCF986EA15E6E293A5644F10B4322F04D67658D8` and retain verification evidence. Existing minimal WAV/AIFF/FLAC/AAC/image demuxers/decoders/encoders remain; network and autodetection disabled; file/pipe only. LGPLv2.1 license retained; source/license obligations and AAC patent considerations remain part of a future distribution review. No normalization or source transcoding added.

## CVE evidence and release gate

`release-hardening-triage.csv` records all 83 deduplicated original Critical/High package/version tuples (23 advisory identifiers), origin, needed/runtime reachability, vendor-reported fixes and final disposition. `release-hardening-residuals.csv` records each remaining scanned Medium/Low tuple, including explicitly open downstream reachability assessments. No ignores, severity filters, waivers or accepted risk were added.

Fresh final amd64 filesystem scans recognize Debian 13.7 and real retained packages:

| Image | Critical | High | Medium | Low | Unknown |
|---|---:|---:|---:|---:|---:|
| Broker | 0 | 0 | 17 | 8 | 0 |
| Worker | 0 | 0 | 19 | 8 | 0 |

**These are scanner totals, not complete binary-advisory clearance.** Trivy does not identify the custom FFmpeg or official CPython subset as distro packages; Node also embeds libraries. The SBOM explicitly inventories CPython, FFmpeg, Node and its bundled OpenSSL/SQLite/zlib/Undici/V8/c-ares/Brotli/nghttp2 components. Record exact runtime versions rather than claiming their removal because system packages disappeared.

**Unresolved High release blocker:** Node 24.21.0 embeds OpenSSL 3.5.8. [OpenSSL CVE-2026-84782](https://openssl-library.org/news/vulnerabilities/#CVE-2026-84782) affects DTLS retransmission before 3.5.9. Removing system libssl does not remove this bundled copy. Broker/worker use HTTPS and do not expose DTLS; that reachability assessment is not a waiver. Require an explicit security disposition or a supported patched Node runtime before release approval. Latest checked Node 24 release remains [24.21.0](https://nodejs.org/en/download/archive/v24). Other September OpenSSL 3.5.9 advisories likewise need bundled-library disposition; scanner zero High does not close them. [CPython 3.14.8](https://www.python.org/downloads/release/python-3148/) explicitly fixes its SSLContext advisories; removed optional extensions make their entry points unavailable in this worker, but complete upstream binary advisory coverage remains a separate release obligation.

Remaining glibc, libstdc++ and zlib Medium/Low entries are individually proposed/dispositioned in the CSV, never silently accepted. In particular aligned C++ allocator overflow, tdelete, CRC32 combine and zlib applicability need further upstream/call-chain evidence. The release script still fails for every undispositioned vulnerability and missing runtime proof.

## Architecture diagnosis

All eight emulated amd64 failures occur at the same sandbox/tool preflight, before media parsing: seccomp installation fails with EINVAL and Landlock syscall returns ENOSYS under the local x86 emulator. An independent direct syscall probe using the same nonroot read-only/cap-drop/no-new-privileges container returns amd64 Landlock -1/errno38 and seccomp -1/errno22; native arm64 returns Landlock ABI8 and seccomp success. Classification: bounded emulator/kernel-security-feature limitation, not eight separately established application defects. No failing test was skipped or weakened. Native arm64 13/13 passing is useful compatibility evidence and is not native amd64 proof.

Manual GitHub Actions source in `media-native-amd64.yml` checks exact 40-hex reviewed SHA, actual x86_64 host, immutable action versions, no persisted Git credentials, no hosted secrets, full offline adversarial self-tests and large-fixture metrics. It is not pushed or run. Source-only native amd64 verification path exists; execution remains required. Cloud Run gen2 Landlock/seccomp/process-group/scratch/network/runtime startup checks remain a separate unresolved deployment gate.

## Resource evidence

Native arm64, same hardened binaries and 2 CPU/2 GiB/512 MiB scratch limits: synthetic 249,984,044-byte WAV; approximately 152 MiB Node peak RSS, 12.9 MiB parser peak RSS, 2.59 seconds parser CPU, 240 MiB scratch, 9.2 seconds wall; waveform 130,712 bytes, 60-second preview 1,623,946 bytes. Recheck exact final source/image evidence in the task's local provenance report; timings are host/workload observations, not an SLA. Keep 2 vCPU, 2 GiB, 512 MiB scratch, concurrency1 and 600-second deadline provisionally. This fixture is not a 15-minute worst-case FLAC/decompression benchmark; native amd64 and Cloud Run resource behavior remain unproven.

## Verification and review

Local real PostgreSQL deployment/targeted-claim/login/concurrency, foundation, worker/broker/adapter and application regression checks pass. Unit443, Artist baseline72, Artist gate5, PR2 security65, discovery5, focused Slice1/Slice2/deletion/moderation48; typecheck, lint and inert-env production build pass. Lint retains one existing form warning. No production `.env.local` or hosted verification script was used. Migration source and hashes unchanged.

A fresh read-only reviewer was requested before and after the patch; both requests failed because this thread exhausted its agent limit. Parent performed separate boundary and bypass/regression passes under the skill's documented fallback. Do not claim independent review. Fresh exact-HEAD Codex Security follows the local commit; its canonical report and the final image/SBOM/provenance hashes are returned separately.

Outcome remains **blocked for release** until the bundled High disposition, residual package dispositions and native amd64 execution are resolved. Local hardening changes are reviewable evidence, not deployment authorization.
