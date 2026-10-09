# Slice 3 deployment source review candidate

Authorization: local source, disposable PostgreSQL, local containers and exact-HEAD source security review only. No hosted mutation, GCP provisioning, image push, deploy, flags, worker jobs, UI, commerce or production operation.

Baseline branch codex/phase-2-slice-3-media-worker; HEAD 08a21f01ced740cec619f8f5ebbb9d68c805d1bc; tree 4664d4bb5d7f04153b33bf0b3b7686e59639e987. Fetched origin/main unchanged at 69ed3fe6dd5e8b0c1642d0835e4e3f4075e796f0 / 124442516c6af419ba31b6ce1d8f3495d08ed41a. Historical A/B/C/D SQL bytes remain unchanged. New E: 20261009010228_slice3_media_execution_permits.sql, SHA256 45379f2ef5019bdc4f29135521c5e0b1bd7d037605d776b71631e9c3497dfbd3. Manifest 35 → 36; all hashes checked.

## Durable dispatch boundary

E adds execution_permits (FORCE RLS, postgres owner policy, no direct application/service/broker ACL), composite job/asset/type/profile FK backed by jobs_execution_identity, unique correlation/execution identities, one globally live staging permit, 15-minute lifetime, explicit Google dispatcher subject, execution name, lease token/epoch, consumed time, result hash and safe outcome. States created → requested → claimed → completed/failed; expired permits retain evidence. RPC inventory: create_execution_permit, request_execution, bind_execution, claim_targeted_job, resolve_execution_lease, complete_execution, read_execution, inspect_worker_output. Every function postgres-owned SECURITY DEFINER, fixed empty search_path, PUBLIC/anon/authenticated/service_role EXECUTE revoked; reviewed NOLOGIN broker role receives execution only. All capabilities remain unchanged. Expected install delta: one table, three indexes, one RLS policy, eight functions; zero permit/lifecycle rows or activation.

Targeted claim compares exact nominated job/asset/type/profile/state/attempt; advisory/row locks serialize claims; increments one DB attempt only. Missing/ineligible/stale/expired target never falls through. Repeating exact permit/execution returns its same live lease. Completion replay requires exact result/error hash; changed replay fails. Dispatcher persists one invoke authorization, records exact execution and reconciles ambiguous requests by execution override evidence. It never drains a queue. A request-persisted/invoke-not-sent failure waits for expiry and operator reconciliation rather than retrying an uncertain invocation.

The proposed LOGIN is a separately authorized setup artifact, not installed by E. It has no role membership, direct tables, Auth/Storage usage, zero-argument claim or worker state setters. Eleven exact RPC grants include E plus heartbeat_job, resolve_worker_io, record_worker_output. Startup verifies privilege flags, no broad foundation ACL, no legacy claim and no broker-role membership. Secrets are pinned versions for the staging DB and Storage only, never Terraform values. Supabase Storage service credential residual blast radius remains broker-only; fixed endpoint/buckets, server-derived destinations, create-only writes, triggers and fenced completion compensate. It does not become a worker credential.

## Local verification

New targeted claim/login tests: 7 pass, real PostgreSQL 17 non-superuser migration model; explicit concurrent nominations/requests/claims and lease lock contention. Broker OIDC/config/input/dispatcher/log tests: 5 pass. HTTP broker/remote adapter: 5 pass, including exact input, heartbeat, waveform output, caller/tuple/profile/path denial, stale stream rechecks, stale output evidence rollback, duplicate output/completion and lost output/completion responses. Existing foundation/worker/permit/HTTP combined run: 37 pass before final additional login/response-loss tests, which passed separately. Worker source suite: 22 pass, one native-Linux fixture skipped on macOS; native container results recorded separately. Unit 443; Artist baseline72; Artist security gate5; PR2/security65; discovery5; focused preview/purchase/deletion/moderation48. Typecheck/pass, lint/pass with one unchanged form warning, inert-env production build/pass, diff-check/pass. No hosted verification scripts that consume production .env.local were run.

Terraform pinned 1.13.4 / Google7.0.1, signed provider lock, fmt/validate pass, no plan/apply. Project ID availability, billing linkage and resources remain unverified/nonexistent as far as this task is concerned. Restricted-login setup executed only against disposable local PostgreSQL; no hosted role created.

## Image evidence and unresolved release gates

Both local linux/amd64 candidates build. Broker emulated security tests 5/5 pass. Worker emulated isolation suite 5/13 pass, 8 decoder/process-group paths fail closed under the local amd64 emulator; this is NOT native amd64 or Cloud Run sandbox proof. Native local Linux arm64 isolation suite: 13/13 pass, zero skips. This is not native amd64 proof. Startup runs isolation preflight before claim and exits on unsupported runtime. Cloud Run gen2 Landlock/seccomp/process-group support remains an unresolved native deployment gate; never relax controls.

Syft1.54.1 produced CycloneDX filesystem SBOMs; worker includes explicit custom FFmpeg9.0.2/source provenance. Trivy0.75.0 scans retain full JSON. After pinned snapshot runtime upgrades and removal of npm tooling: broker Critical1/High48/Medium95/Low77/Unknown1; worker Critical2/High81/Medium158/Low121/Unknown1. These are scanner dependency results, NOT a claim of validated exploitable source findings. No Critical/High acceptance or Medium/Low disposition is granted. Both images are REJECTED for release pending dependency triage/remediation. Local config digests are not registry deployment digests. No source-security zero-finding result can override this image gate.

Release scripts record clean committed HEAD/tree, context hash, base digest, signed APT snapshot, package inventory, image config digest, SBOM, custom FFmpeg version/config, tests and scan JSON. They do not push. Every undispositioned vulnerability blocks approval. Offline deployment evidence checks additionally require native gen2 isolation, exact security/source HEAD, authenticated broker and restricted-login proof; missing evidence fails closed.

## Separate future authorizations

1. Exact D/E hosted migration/install plus restricted-login setup, with hosted preflight and media/Gate D flags OFF.
2. GCP project/billing bootstrap and reviewed Terraform provisioning, secret values/versions and immutable image publication after release blockers resolve.
3. Broker/worker deployment and native gen2 preflight with no job claim/processing.
4. One explicit nominated synthetic staging execution after separate activation authorization.

Four retained staging jobs remain untouched. Production unchanged except historical organization plan/billing tier. Live payments disabled. No purchase-delivery, Stripe, entitlements or Gate D authority is added.
