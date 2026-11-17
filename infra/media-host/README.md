# Recommended beta audio host

One DigitalOcean Basic Regular Droplet, NYC3, Ubuntu 24.04 x64,
`s-1vcpu-2gb`: 1 shared vCPU, 2 GiB RAM, 50 GiB SSD. One job at a time.
This is a dedicated TSE workload VM, not a dedicated physical CPU.
No server/account purchase or provisioning has occurred. `plan.json` is a
deployment specification, not a ready-to-run production launcher.

## Existing infrastructure first

The existing retained Google worker/replacement disk and recovery controller
remain held. Existing Netlify targets do not have a qualified kernel/credential
boundary. The previously verified local Docker environment is useful for tests,
but is not an established always-on production host. No eligible non-held Linux
production host has been established in the connected inventory. This plan uses
one new host only after approval, without another database, queue, SaaS processor,
registry subscription, Kubernetes cluster or network gateway.

## Price, checked November 17, 2026

- Server: $12/month maximum base price, $0.01786/hour; 50 GiB root SSD and
  2,000 GiB monthly outbound allowance included for the listed bundled plan.
- Illustrative eight-hour setup/testing server cost: $0.14288 before tax.
- Request a $15/month pre-tax operating envelope: $12 base plus $3 contingency
  for low beta variable usage. This is a proposed authorization, not an enforced
  provider cap or a guarantee that arbitrary usage stays within it.
- Existing Supabase Storage capacity and source-download egress retain their
  plan charges; unused allowance has not been assumed. Bound job count and bytes
  using the existing broker/admission accounting before enabling jobs. If that
  cannot bound variable cost inside the approved envelope, remain disabled.
- No paid backup/snapshot/volume/load balancer selected. Keep immutable source,
  image archives and release receipts off-host in existing approved storage.
  Originals/derivatives remain in existing Supabase, not on the host disk.
- Powered-off Droplets still incur server cost. Deletion ends the server rental;
  stop is a safety action, not cost cancellation. Transfer overage is $0.01/GiB.
- Taxes, current account offers/availability and existing platform liabilities
  are separate. Reconfirm the live quote before provisioning. The old $0.10
  qualification ceiling does not authorize this new recurring charge.

## Technical fit and mandatory live checks

Ubuntu 24.04's GA kernel is 6.8, newer than Landlock's introduction. That makes it
a suitable candidate, not proof of the actual Droplet's enabled LSM or Docker
syscall policy. Run the existing `workers/media/runtime-kernel-probe.py` inside
the selected non-root container, then the existing restrictive sandbox tests.
The probe's allow-all seccomp installation is a capability check only; acceptance
requires actual socket/credential/filesystem/process denial, not that probe alone.
Reject ABI<3, root/capabilities, denied Landlock syscalls, architecture mismatch
or failure to install the existing strict filter. Do not use privileged mode,
seccomp=unconfined, disable AppArmor, or broadly expose the Docker socket.

One worker's prior native local peak was approximately 681 MiB, so 2 GiB is the
smallest reasonable beta candidate with 1 GiB worker cgroup, 256 MiB broker and
OS headroom. Scratch tmpfs counts against that cgroup. This is a sizing inference,
not a measured DigitalOcean benchmark. Validate the largest supported upload,
existing deadlines and OOM/pressure recovery; stop rather than silently increasing
limits or server size. Shared CPU may affect latency. No swap for parser secrets
or scratch. Configure bounded logs and disk-pressure admission stop.

## Deployment sequence after approval

1. Authenticate the TSE-owned provider account without sharing API tokens in
   source/logs. Verify exact quote, size, region and Ubuntu image. Create exactly
   one host with SSH public-key authentication and an approved operator source
   allowlist. No public broker/codec port. Record authenticated provider host ID,
   key fingerprint, root disk details and Linux boot UUID.
2. Patch Ubuntu, verify actual kernel/LSM, install maintained Docker, create
   separate broker UID20000 and parser UID1000. Root owns the narrow launcher;
   neither service joins docker group or gets a Docker socket. Services remain
   disabled. Pin the exact installed versions and immutable release inventory.
3. Reuse FFmpeg 9.0.2/ffprobe, `sandbox.py`, parser-boundary and existing job engine.
   Reuse the retained VM Unix-socket broker source from commit273866ab, path
   `infra/media-qualification/vendor`, without activating its Google resources.
   Those historical production files hard-bind Google VM8797328859122759463 and
   Google image names. Implement/test a separate explicit host-bound adapter and
   DB admission binding; do not replace identity verification with enabled=true.
   The retained candidate's ordinary broker entrypoint is staging-only and is
   also not a drop-in production daemon.
4. Build/verify AMD64 images and dependencies; record archive/manifest/config
   hashes and Docker IDs. Existing retained image digests are provenance inputs,
   not proof a modified host adapter exists inside those images. Fill the null
   manifest fields only with verified results. Retain previous release artifacts.
5. Run credential-free native tests: codecs, waveform/AAC correctness, Landlock,
   seccomp, filesystem/resource/network denial, timeout/crash/cancellation,
   watchdog and cleanup. No production media or credentials at this stage.
6. Install the least-privilege broker credentials via RAM-only systemd custody
   after configuration/authorization review. Keep UID1000 unable to read them;
   no secrets in image, env, writable root disk or parser mounts. Broker alone
   accesses strict-TLS Supabase DB/Storage. The native parser receives only exact
   input/output leaves, minimal environment and no sockets/network credentials.
7. Bind current Supabase job admission to the new host and exact images, using
   only reviewed target-specific SQL/grants. Preserve original queued jobs,
   attempt counters, holds and unknown liabilities. Do not grant a generic queue
   drain or pretend unknown spend is zero. Test one explicit synthetic scope,
   fail-closed accounting and fencing before opening any automatic admission.
8. With application compatibility/regressions and Netlify rollback verified,
   install the candidate additive waveform/default-preview SQL transactionally;
   release the application and run one controlled founder upload end to end.
   Broker polls existing job tables; no inbound webhook is required. Source
   validation queues waveform, which queues AAC; Artist acceptance and SEC review
   stay explicit. Buyer sees only authorized aligned preview waveform/audio.
9. On failure close new admission first, revoke/fence work safely, stop services,
   collect redacted evidence and restore the previous signed release/Netlify
   deployment. Use target-specific SQL rollback only after verifying dependencies.
   Do not delete/rewind jobs or accounting. Never restart an ambiguous run blindly.

## Time and decision

Engineering estimate after host/access approval: 1–2 working days to the native
worker/security acceptance; roughly 3–5 working days to founder end-to-end testing,
including explicit host identity/admission adaptation and outstanding application
feature-parity/rollback gates. This is an estimate, not a completed qualification.
No further broad provider comparison is needed.

Required approval: one TSE-owned DigitalOcean Droplet at $12/month base, a proposed
$15/month pre-tax total incremental operating envelope and up to $1 for bounded
initial setup/testing; provider account access. Production credential installation,
new-host admission binding and processing acceptance must be included explicitly
in the later execution scope. Do not assume spending approval clears those gates.

Official sources:
- https://www.digitalocean.com/pricing/droplets
- https://docs.digitalocean.com/products/droplets/details/images/
- https://docs.digitalocean.com/products/droplets/details/pricing/
- https://documentation.ubuntu.com/release-notes/24.04/
- https://docs.kernel.org/userspace-api/landlock.html
