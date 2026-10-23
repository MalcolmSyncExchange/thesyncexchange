# Release runtime remediation review

Source scope: both media container inputs, ELF assembly, release evidence collector, residual ledger and offline native AMD64 workflow. No application, migration, hosted configuration, worker activation or UI behavior changes. The Node24 candidate and its completed scan remain historical evidence; a fresh immutable-head review is required.

## Runtime decision

Official Node24.21.0 and Node22.23.3 still report bundled OpenSSL3.5.8. No maintained official Node24 security backport was established. Choose official maintained Node26.11.1 (Current), whose Node26.11.0 release upgraded OpenSSL to3.5.9, over an unofficial binary or a custom Node build. This is a necessary major upgrade for the shipped OpenSSL fix; review again when a maintained Node24 fix exists or Node26 enters LTS. Application tooling and broker/worker tests run against Node26.11.1; no app engine requirement changed.

Pin multiarch index `193fe51b64e77981119c98c2002c9e32a70e2f006fb4d25068ce0558998917f0`; AMD64 child `dc959319aa89ba9ab709c3e2d2ef8827e254284df2221856c58d78d32c45a913`. Require exact Node26.11.1/OpenSSL3.5.9 from each final image; system libssl inspection is insufficient. Node now needs Debian libatomic1. Generate the CA bootstrap in the official Node stage and install libatomic1 from signed snapshot APT before executing Node in the Python stage. The final closure retains package/license metadata and rejects setuid/setgid files. Five broker / seven worker Debian packages are expected, subject to exact final inventory verification.

CPython3.14.8 and minimal FFmpeg9.0.2 source hash/signature/configuration are unchanged. Keep Landlock ABI>=3, seccomp, UID1000, dropped capabilities, no-new-privileges, read-only root, process groups, regular-file identity, symlink rejection, cancellation, deadlines and parser bounds. No emulation exception or sandbox fallback was added.

Primary provenance: https://nodejs.org/en/blog/release/v26.11.0 ; https://nodejs.org/en/blog/release/v26.11.1 ; https://github.com/nodejs/docker-node/blob/main/26/trixie-slim/Dockerfile ; https://openssl-library.org/news/secadv/20260929.txt .

## Residual advisory policy

The CSV and matching JSON record each exact advisory/package/version/severity/image tuple. Preserve scanner totals; never downgrade or hide a row. The collector rejects Critical/High/unknown, an unknown/ambiguous tuple, incomplete evidence and a newly reported fixed package invalidating a no-fix decision.

NOT AFFECTED entries have specific missing prerequisites: absent affected gconv modules, no AT_SECURE/setuid/SGID runtime, absent nscd/ldd, or Power8-only implementation outside the AMD64 release. Other rows use NO FIX AVAILABLE with explicit bounds: **no fixed maintained trixie binary**, not absence of all upstream fixes. Debian sid/source patches are recorded as real options; unsupported sid glibc substitution is not a stable drop-in. No custom glibc/GCC/zlib patch build is introduced. Residual library risk remains: bounded input/probe output, memory/CPU/deadlines, process-group cleanup, parser network denial and credentials-free confinement mitigate it without claiming universal native-call unreachability. This is the task's bounded Medium/Low acceptance policy, not a Critical/High waiver. Revisit on any source/base/package/profile/platform change, new vendor fix or exposed native API. Deployment DNS remains a Cloud Run gate.

## Native execution and evidence

GitHub Ubuntu24.04 is the native AMD64 proof target. The workflow can run only by manual exact-SHA input or a push to `codex/phase-2-slice-3-media-worker`; no main/default-workflow change is needed. Use immutable actions and hash-verified public scan tools; persist no checkout credentials. It receives no Supabase/GCP/Stripe/Auth secrets and performs no hosted mutation. Public build/advisory downloads are permitted; all synthetic media execution is network-none with the full isolation profile. Upload only safe reports, inventories, SBOMs and measured resource evidence under RUNNER_TEMP. No media/container archive/environment dump is retained by CI.

The collector records source HEAD/tree/context hash as image annotations, final local image IDs, base digests, exact bundled components, FFmpeg version/config, SBOM/scan/package/test hashes, actual native host/run ID, kernel probe and near250MB synthetic resource results. No registry manifest is claimed for an image never pushed. Missing native proof or failed required tests block release. The local emulated worker is expected to fail closed if Landlock/seccomp are unavailable; this never substitutes for native proof.

The feature push, if required, uses `[skip netlify]` in the latest commit per Netlify's documented skip rule. This avoids deployment without changing Netlify settings or suppressing GitHub Actions. No PR, merge or registry push is authorized.

Cloud Run gen2 Landlock/seccomp, filesystem, process cleanup and resource validation remain a separate future gate. Native success does not establish Cloud Run compatibility or authorize provisioning/deployment. Provisional profile: concurrency1,2vCPU,2GiB,512MiB scratch,600s deadline. Resource evidence is a synthetic workload measurement, not a worst-case/SLA guarantee.

## Verification corrections

Update the existing worker test to assert the new full immutable Node digest. The expired-permit test uses statement_timestamp for both endpoints; separate clock_timestamp calls could exceed the exact15-minute CHECK by a microsecond. No constraint or production SQL changed.

The fresh read-only patch reviewer could not start because this thread reached its agent limit. Parent performs separate boundary/bypass and compatibility passes; no independent-agent review is claimed. Full focused and application regressions, exact-head security completion and native evidence are reported with the final sealed release record. Do not infer PASS from this source plan.
