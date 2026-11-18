# DigitalOcean audio host — November 17, 2026 (Arizona)

**Host provisioned; native parser qualified; production admission still closed.**
This is not a production application deployment or an end-to-end upload pass.

## Identity and cost

- DigitalOcean Droplet `tse-audio-worker-beta-001`, numeric ID `620470021`.
- NYC3; Ubuntu 24.04.5 AMD64; 1 vCPU / 2 GiB RAM / 50 GiB SSD.
- Public IP `165.22.37.35`; administrator SSH only from `70.176.3.99/32`.
- Root filesystem UUID `59134bd0-a76f-4ea0-8e4a-770b2e1eafc2`.
- Host key fingerprint `SHA256:KAc+qVXwU6ecJj0fk0tg7i3mG1MlEGJbk7lyLJs0E/U`.
  Independently verified using the authenticated DigitalOcean recovery console
  and a read-only, no-journal-replay mount of this new disk. No private host key
  was read and no SSH host key was changed. The normal-boot handshake matched.
- One Droplet only; no paid backup, snapshot, volume, registry, database or
  monitoring subscription. Base $12/month before tax. Approved operating ceiling
  $15/month plus $1 initial testing. Conservative setup server rental estimate
  below $0.05 so far; final posted invoice is not yet available. This rental is
  part of the monthly server fee, not an additional setup fee. Inference credits
  were not deducted from gross cost. Idle or powered-off servers remain billable.

## Completed checks

- Authenticated control-panel identity and pinned-key SSH cross-checked against
  guest metadata ID/region, Linux boot UUID and root filesystem UUID.
- Linux `6.8.0-147-generic`, Landlock ABI4, non-root credential-free container;
  seccomp installation plus the existing restrictive sandbox regression tests.
- Cloud firewall `13988a4e-2bc1-4703-9b8e-d232ab02f85d` attached and reported
  Up to date. Inbound TCP22 only from operator /32; no public broker endpoint.
  UFW independently enforces that source restriction. Default host outbound is
  presently allowed for setup; production broker egress narrowing remains a gate.
- Password/keyboard-interactive login, SSH agent/TCP forwarding, tunnels and
  user environments disabled. Broker UID20000 and parser UID1000 are distinct,
  with no Docker-group membership. No swap, no production secret installed.
- Official Ubuntu Docker29.1.3 installed; bounded local Docker logs configured.
- Worker archive SHA256 `e9a6c50d82243e3e4ad90e042bc04619a1e8224f57a267e3c655266b16eb428b`:
  all11 OCI blobs and9 layer diff IDs verified before/after upload; linux/amd64;
  manifest/immutable Docker ID
  `sha256:c678ad81c316b0e8f56dd9a822e7da80ed7dbee09f8d667e2f5a64e6e64239b0`;
  config `sha256:b0f0e97774efab112076221ffc3e8a90830a84572b9cd16112e127cf7e7bd936`.
  Images and media algorithms were not rebuilt or modified.
- Native synthetic FFmpeg→validation→waveform→AAC→aligned display PASS, 4.415s,
  32,000 frames /16kHz/mono, 200 waveform points, 2,000,000us AAC-LC preview,
  600 display bins. No OOM; files/container removed. Fixture SHA256
  `291caab458530e94fd3db1a867a017b0b35b851f86a00448be134c98272c710e`.
  This resolves the candidate's native AMD64 execution gap, not the historical
  emulation failure's underlying cause.
- Existing codec/isolation suite:12passed/1explicitly skipped, 63.089s. The
  skipped descendant/resource/timeout/cancellation test was then selected alone
  with its required test fixture path and passed in8.272s. Thus13case groups
  covered; the original skip remains recorded. No resource limits were raised.
- Synthetic RAM-only systemd custody: broker read PASS, parser denial PASS,
  tmpfs verified, credential-directory cleanup PASS. Not authenticated production
  broker startup. No credentials were installed to make this test pass.
- New `linux-host-binding.mjs`:17local and17native AMD64 identity/signature
  tests passed. It checks an Ed25519-signed root-installed inventory against
  independent operator provisioning and guest VM/disk/boot evidence. Rejects
  unexpected algorithms, identity/digest/mode drift, stale and missing evidence.
  It intentionally grants **no job admission**, and is not wired into a live
  production broker yet. No production signing key was generated.
- Current full local application regression:1,995passed/0failed/0skipped.
  Typecheck and focused lint passed. Historical QA evidence remains separate.

Bootstrap initially stopped safely because `sshd -t` was run after stopping SSH
and `/run/sshd` was absent. The directory was restored; the configuration was
validated, users created and normal hard-drive boot restored. Console input also
needed explicit shifted-key handling; unsuccessful read-only commands are kept
in the console evidence. No filesystem repair, host-key reset or rebuild occurred.

## Exact production stop

Read-only production inspection confirms:

1. `execution_permits_execution_name_check` accepts only the security-staging
   Google execution path or the original `tse-media-worker-003` Google path.
2. The retained production broker entrypoint, dispatcher/usage accounting and
   `vm_admit`/`vm_test_require` are Google-bound and synthetic-permit scoped.
3. Old `vm_runtime` is disabled, accounting month2026-10; worker/activation flags
   remain false; the two existing jobs remain queued at attempt0. No holds,
   historical accounting, permits or job records were reset or changed.

A host identity adapter alone cannot authorize DigitalOcean processing through
these contracts. Do not impersonate the old VM, fabricate a Google execution
path, enable generic queue claims, clear historical holds or replace unknown
liabilities with zero. Production credentials, SQL policy changes, admission,
dispatcher, live broker/watchdog acceptance and website publication remain NOT RUN.

The remaining implementation is a separately scoped DigitalOcean job-admission
and credential bridge: exact host/boot/image binding; least-privilege RPC-only
broker identity; one-job fenced authority; current uploads explicitly admitted
without releasing the two old jobs; its own approved $15 cost scope; existing
completion/Storage integrity rules retained. Preserve the held Google path and
unknown historical liabilities. Prove restart/uncertain-launch handling and
target-specific rollback before applying any production authorization changes.
This is a production authority migration, not a hostname substitution.

The reconstructed application also still needs its later published feature
compatibility and full Netlify rollback acceptance before publication. No new
frontend build or production deployment is claimed in this host qualification.

## Evidence and access

Complete, bounded reports and per-file hashes are in the original workspace at
`output/digitalocean-audio-host-20261118/receipt.json`. No private key or secret
value is included. Raw qualification output was retrieved before cleanup; all
test containers are gone. The approved server is retained Active, with processing
units masked and no running containers.

The scoped operator key and host pin are in separate mode0600 files under the
operator's `~/.ssh` (`tse_audio_worker_beta_001` and
`known_hosts_tse_audio_worker_beta_001`); never stage or upload the private key.
Clean Media Recovery remains on HOLD; no Google resources were started or changed.
