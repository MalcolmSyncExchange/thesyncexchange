# DigitalOcean output transfer lock correction

The first live source validation succeeded with the exact 64,044-byte synthetic
WAV hash, 32,000 frames, 16 kHz mono and two-second duration. Waveform generation
then failed before any output write. Admission was closed and the broker and root
launcher stopped; RAM credentials were removed. Historical jobs and Google holds
were preserved.

The authenticated PostgreSQL logs at 2026-11-18T03:30:30–50Z show SQLSTATE57014
inside do_runs → do_run → do_resolve → media_do_transfer. The run ledger records
one input read and zero output reads/writes. The broker awaited the application
transfer while holding that same run's transaction lock. This is a bridge lock
inversion, not evidence of a codec or sandbox failure.

The DOAuthority callback retains the existing broker interface but each SQL RPC
now commits its own live-fence check before the next operation. It never holds
row locks while calling the independent application transfer authority. That
endpoint still verifies the signed host/boot/run/lease, consumes a durable nonce,
checks current authority before and after private Storage I/O, uses create-only
writes, and verifies exact bytes and hashes. The broker checks the fence again
before recording output; record and completion RPCs independently revalidate it.
Revocation can leave an unreferenced immutable private object, never an accepted
or publicly delivered stale result. No role grants, SQL fencing rules, parser
algorithms, security controls, resource limits, or worker image are changed.

A regression fails on the old transaction-held callback and passes with the
correction. Additional tests reject recording/completion after revocation and
reject a transfer revoked after the private immutable upload. Focused integration:
39 passed. Typecheck, focused ESLint and diff checks pass. Required hosted CI,
merged-source image provenance and live output acceptance remain release gates.

The new runtime manifest and imported Docker identity are
sha256:8409aee2dca3884bcd993738e300280a9af1ea85fcc38c2a3f84421703717b54.
All11 OCI blobs and9 layer diff IDs verified; exact prior rootfs prefix preserved.
The adjacent identity record includes the archive SHA, config, source hashes and
original BuildKit attestation archive SHA. The image scan found no private keys
or credential files. All8 focused tests passed inside this exact AMD64 image
under local macOS ARM64 emulation with no network or credentials. This does not
claim native hosted output acceptance. The approved parser image is unchanged.
