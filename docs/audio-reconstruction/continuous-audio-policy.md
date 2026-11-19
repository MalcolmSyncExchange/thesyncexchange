# Continuous audio policy release

Status: local implementation and validation; not yet production activated.
Production baseline: main `5d5a16c5c72f62d0c2fed213232368113de7c2e2`, deployment `6afe880ba1b7bd7f34288791`.

## Behavior

- Audio-derived local waveform bars illuminate using acknowledged upload bytes. Shape does not change with progress. Unsupported local formats retain the conventional progress fallback. Upload pause/resume/cancel, private TUS destinations and 150,000,000-byte per-file limits remain.
- Server work is indeterminate, with reduced-motion support and explicit queued, retry, failed and operational-pause explanations. No invented ETA or processing percentage. Full/preview playback, selection handoff, immutable revisions and acceptance gates remain.
- Confirmed completed stages dispatch immediately; idle, failed, ambiguous and financial-paused outcomes retain five-second backoff. Each pass repeats live identity, usage, fencing and admission checks. Native before/after processing improvement is **not yet measured**.
- Root renews an at-most-one-hour public identity capsule under a separately installed finite November policy. An expired seed signature can prove provenance, but cannot authorize renewal without the new enabled root-owned policy, matching live boot/root and fresh reconciled accounting. No private operator key is persisted. The broker reloads the sealed capsule and rejects a different boot.
- Restart recovery archives a refused root-owned Unix listener only under an exclusive server lock and after all immutable recorded containers prove stopped. Live/uncertain listeners or running/conflicting containers fail closed. Holds are never removed.
- Queue telemetry is a restricted, read-only, boot-bound SQL function. Local journal alerts cover unavailable/stalled workers, delays, repeated failures and low financial headroom. This is not email/SMS delivery. Unknown provider transfer failures remain their existing safe error codes; no secret payloads are logged.

## Financial and authorization bounds

One existing Droplet `620470021`; no provisioning. November ceiling $20, fixed reserve $12, setup carry $1, full $0.10 reservations retained after settlement. Last verified projection $17.797451284270558, 47 reservations, none issued. Recheck counters at rollout; do not reuse these observations as fresh admission evidence. A three-stage founder acceptance reserves another $0.30, plus a conservative $0.11 transfer/log allowance, only if fresh projection stays below $20.

Policy expires at `2026-12-01T00:00:00Z`. A root-owned independent systemd timer stops broker/launcher/renewal at that boundary. No December spending authorization is inferred. Parser per-job deadlines/cgroups and financial gating remain. Insufficient budget prevents new admissions; existing reservations are not refunded or rewritten. Ordinary service restarts can recover on the same verified boot. Unknown reboot accounting still requires evidence-backed reconciliation; the service never assumes zero liabilities.

The November policy remains founder-only. Existing `allowed_owner`, job cutoff, queued records and historical Google recovery holds are preserved. Neither the example policy nor SQL migration enables processing.

## Local validation and capacity limits

- Local native PostgreSQL 17.11, ARM64 Mac, private Unix sockets, no hosted connections: 1/10/50/100/1,000 reservation requests using 10 independent clients. At 1,000: 4 admitted, 996 quota-rejected, 1.115 seconds total, 12.76 ms p95. These are metadata admission results, not actual upload/decoder capacity.
- Eight dispatcher sessions: two matching identities get one permit and the same lease; six wrong boots denied; expired lease resolution denied. No parser execution in this test.
- Production remains concurrency one. The planner models configurable future verified-worker counts but cannot provision anything. It caps demand by explicit authorization, financial capacity and fresh metrics; retains a five-minute idle threshold and flags stalled queues at two minutes.
- Actual multi-host parallel processing is **not qualified or enabled**. It requires an approved per-worker identity/database-role registry and per-worker active-permit slots replacing the current DO singleton gate, while leaving Google qualification permits and holds unchanged. Additional hosts must each have isolated credentials and immutable parser images. This is a scoped admission extension, not a new decoder/queue engine. Do not advertise 1,000 simultaneous artist uploads based on these tests.

## Runtime profiling decision

The existing production measurements separate browser transfer, job admission and settlement. The 100/150 MB transfers reached 6.51/7.75 MB/s without changing chunk size or parallelism. TUS remains serial 6 MiB, with its current uncertainty/recovery logic. There is no verified reason to weaken that path or change chunk size.

Three isolated stages each fetch/revalidate their exact source and keep their own filesystem/process lifetime. Cross-stage caching or sharing decoded PCM is not enabled: it needs its own content-addressed provenance, authorization rechecks, bounded eviction and crash/revision tests before it can preserve these boundaries. No codec, waveform algorithm, AAC quality, parser image or security limit changed in this release.

## Ordered rollout

1. Merge reviewed PR only after required CI and explicit main-merge approval. Verify source inventory and exact broker archive digest.
2. Apply only `20261119064613_continuous_audio_health.sql` after exact production-SQL approval. It adds one private aggregate RPC/grant and changes no existing rows/policies.
3. On the existing host, keep DB admission disabled. Confirm no issued run/running container; retrieve fresh accounting. Back up current root configuration, units, public capsule, launcher and image pin.
4. Import the integrity-checked AMD64 broker archive; verify installed digest/architecture. Preserve the parser digest and original broker image for rollback. No runtime registry pull.
5. Prepare a fresh public operator-signed seed for that broker/source and the exact existing host/root/boot. Verify it with `verifyLinuxHostBinding` before installation. Install root-owned seed/policy/renewal code and units; policy enabled only for the reviewed finite November authorization.
6. Install independent `tse-do-policy-stop.timer` and verify its fixed UTC deadline **before** enabling service restart or admission. Keep old expired benchmark timers as evidence; never touch Google watchdogs.
7. Install the broker continuous drop-in and health timer. Run identity renewal, verify capsule, then launcher-only start/stop and journal/health checks. Do not clear holds. Require native AMD64 acceptance of the changed launcher and broker before founder work.
8. After explicit exact activation-SQL approval, compare-and-set only the matching disabled DO row: new broker digest, finite policy expiry and fresh monotonic observations. Preserve owner, cutoff, ceiling, reserves, all jobs/permits/ledgers. Enable only after the fresh $20 projection gate passes.
9. Start approved service/renewal/health timers and broker. Verify effective runtime identity, no parser credential mounts, no parser network, no unknown process or duplicate claim. Run one founder-controlled synthetic acceptance if headroom permits. Measure actual post-success delays and waveform/AAC availability; do not report the estimated saving as measured.
10. Publish tested application from production main, verify live transfer/processing/paused states, authorized playback and original-file privacy. Retain release/rollback receipts. Production still uses one host.

## Rollback

Stop new admissions, stop broker and launcher, and verify all processes exited and reservations settled. Remove RAM credentials through the existing supervisor cleanup. Stop availability/health timers and remove only this release's drop-in; restore backed-up root configuration, public seed and old immutable broker/launcher. Leave admission disabled. Restore no database from backup and alter no history, holds, job attempts, assets or reservations. The unused health RPC can remain inert; dropping it is optional separately reviewed SQL. Revert application source through CI for the production branch; preserve the current deployment until the replacement passes.

## Current rollout blockers

Exact main merge / production health SQL / finite activation approval are still required by AGENTS.md. Pinned management SSH is timing out from this Mac; do not alter either firewall silently. A verified archive handoff and native acceptance are required before the continuous policy can be enabled. Continuous availability, actual speedup and multi-host capacity are not yet production claims.

## Release validation receipt

Implementation commit `7ab43fe2078a72281c601373a8ae0930ef22cfcc`. Final local full suite: 2,093/2,093; root identity renewal 5 test methods, launcher 22/22, accounting 14/14; typecheck and production build passed. Lint: zero errors, one retained unrelated React Hook Form warning. The temporary local browser QA route and generated stale route cache were removed; final build passed afterward. Actual Chrome local waveform progress, identical bar geometry, keyboard interaction, mobile layout and reduced-motion animation suppression passed.

Offline AMD64 broker manifest `sha256:648c94c3d3950e7547fd0fe63cacd21592f2c64c47ef9d4cb35865a741b98e51`; archive SHA-256 `e371c8d1b134ae94f1f57793dcadd2df7173eaf717fc2babbd220ecb05e6e854`, 53,745,664 bytes. All 14 OCI blobs and 12 layers verified against content hashes, architecture and full implementation revision. Complete record: `continuous-broker-manifest.json`. This is a local build/integrity receipt, not native-host acceptance.

Exact health migration SHA-256: `896a17ea24037e39786374ae46caba4992b8c371734126a6333b4219c1c53fc9`. No production SQL or admission update has been applied. Fresh host counters and a concrete compare-and-set activation statement must be captured before activation; stale benchmark observations cannot authorize it.

## First native activation and focused readiness correction

PR60 merged as `0212b83f` after CI44479082259 passed all required checks. Production website `6afea808ae1702af58de3cd1` is published and locked. Exact health SQL installed; control and reservation hashes remained unchanged immediately afterward. Native AMD64 launcher22/22 and renewal5/5 passed; actual launcher graceful stop1.346s. Independent policy-stop timer verified active at December1 00:00UTC.

Founder approved exact activation SQL SHA256 `3fa0e266dc105edd248cb80243cb6524f9e23d51007b2c453df1b66ac70c96ab`; it changed only broker digest, expiry and enabled flag after fresh accounting. First run `4a10c050-c2f9-4831-81e5-778fa62e438c` failed before claim, leaving decode attempt0. No launcher record or parser container was created. Netlify request `01M7SD99CZD3A09GHZFRNYGQ0Y` at08:03:04.735UTC returned499 after5.076906706s, no function invocation recorded. This confirms request cancellation at the launcher's existing5s deadline; cold start versus edge delay is not proven. Admission immediately disabled, broker/launcher stopped, failed0.10 reservation retained (48 total). No retry/reset/refund or parser-security failure claimed.

Focused correction: before creating any new permit, the broker makes a credential-free POST to the exact existing launch endpoint, with no proof, key, permit or job ID. Only the exact JSON403 `{authorized:false}` response establishes readiness for30s. Redirects, HTML, unexpected success, oversized/altered bodies, cancellation and a10s bounded timeout fail closed without reservation; idle/failure backoff remains. Paused budgets skip this check; existing issued runs reconcile first. The independent root-signed authorization and5s request deadline are unchanged. This prepares the application before scarce authorization time; readiness itself never authorizes processing. Network failures can still deny an otherwise ready request; no guarantee of endpoint latency is inferred.

Readiness follow-up local full suite: 2,100/2,100 passed; typecheck/lint passed (same retained warning). An observed empty eligible queue skips warming and new admission, so idle service does not keep Netlify warm. Cancellation racing a successful readiness response also prevents reservation. Current conservative projection17.8974745/20 includes the failed reservation; all prior47 rows retain exact hash `d1f7beac615838a9f8a3b43e8454b045`, zero issued runs. Live new Artist Desk shows an explicit operator pause and safely stored original; no duplicate upload created. Actual productive-loop speedup remains unmeasured pending successful native launch.
