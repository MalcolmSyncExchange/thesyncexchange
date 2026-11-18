# Dormant production installation — November 17, 2026 Arizona

The structured-rights restoration is commit8a60451b. The DO bridge runtime is
commitfcc6effb, built natively from the verified retained AMD64 broker image.
Its immutable manifest/Docker ID is
sha256:e2ab69c59872b5eb1ae1b3d96ba643f54cd9dd517a8139c9316f8dd6e9a94c58.
Archive/blob/config/layer hashes and source inventory are adjacent records.
The image scan found no inherited SSH keys or credential files; credentials
were created after the image build and cannot be in those immutable layers.

Validation:1,995/1,995 full regression checks;35 focused integration checks;
8 root-launcher checks;6 native AMD64 bridge checks; native local ARM64
PostgreSQL17.11 migration/role-denial and encrypted-bootstrap checks. Typecheck,
focused lint, Next build and Netlify production-context packaging passed.
The configured Lighthouse plugin reported a local404 and did not produce a
performance acceptance result. Hosted smoke and end-to-end acceptance are pending.

All eleven captured target function drift checks matched immediately before
installing the dormant DO migration. Live post-install verification showed the
new role NOLOGIN, NOINHERIT, no super/bypass/create-role flags, zero private-table
access, no generic claim or legacy role membership. Existing capabilities and
the two queued jobs remained unchanged. The Google runtime remains disabled.

Applied history is preserved with authoritative migration versions:
20261118014919 digitalocean_fenced_media_admission;
20261118020018 digitalocean_sealed_credential_bootstrap;
20261118020133 suspend_uninstalled_do_login.
The suspend record documents a failed extraction of an encrypted tool response.
The unused login was suspended, then a fresh encrypted handoff completed after
the parser correction. No plaintext password appeared in tool output.

A root-only RAM encryption recipient transported the new restricted password.
The public recipient is retained as a test fixture; its private keys were erased
from the host after delivery. A compatible encryption subkey was required by
pgcrypto; this was tested locally before production bootstrap. Ubuntu OpenSSL's
Ed25519 oneshot signing also requires a seekable RAM file rather than stdin;
the root launcher was corrected and its eight focused tests passed again.

At rest the new DB password and host signer are systemd host-key-encrypted,
root-only blobs. Plaintext copies are RAM-only and broker-owned; no general
Supabase/Storage key or Owner credential is installed on the host. This is
host-key encryption, not a claim of TPM-sealed or customer-managed disk encryption.
The host's public Ed25519 key is configured in the production Functions scope
only. No private key was copied to Netlify or committed.

The new control is enrolled to the independently verified host/boot/images and
founder Artist5ebe50a3-0499-4ac1-850e-701480d6055d but remains disabled. A1USD
carry-forward reserve conservatively covers the approved setup allowance in
addition to the12USD base reserve; the monthly DO ceiling remains15USD. Google
liabilities remain UNKNOWN_PRESERVED_NOT_OFFSET. No old holds/accounting records
were cleared and no historical job was released.

Subsequent live dormant acceptance passed: broker authenticated to the production
pooler using the new restricted role with strict CA/hostname TLS; private Unix
socket became available; parser UID1000 could read neither DB nor signer/root
signer credentials. Stopping the broker removed RAM credentials and its socket;
no containers remained. The corrected root control service then started/stopped
and removed its socket automatically. No parser, permit or job execution occurred.

The root launcher's Docker-failure path now attempts a worker-slice cgroup kill
independent of the Docker API and records SUSPENDED for reconciliation. Signal
shutdown closes the control socket and stops tracked workers. Broker DNS is
explicitly the host resolver127.0.0.53, matching the UID egress allowlist.
The permit-status follow-up closes dispatcher authority on revoked/expired
permits, preserving the issued recovery record. A dedicated regression covers it.

Automatic preview/waveform SQL was installed while worker/activation flags and
DO admission remained disabled. Applied versions20261118022213 (live permit
status) and20261118022453 (automatic audio preview/waveform) are reflected in
local filenames; no migration history was rewritten. Original target-specific
rollback and the DO disable rollback remain available.
