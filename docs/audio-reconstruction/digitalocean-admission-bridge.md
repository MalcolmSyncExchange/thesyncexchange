# Dedicated DigitalOcean admission bridge

Local implementation; production enablement remains gated by native package,
credential, deployment and founder-only end-to-end acceptance. Clean Media
Recovery remains HOLD. No Google identity or accounting record is repurposed.

## Authority

`do_control` is installer-only, disabled by default, bound to Droplet620470021,
root UUID59134bd0-a76f-4ea0-8e4a-770b2e1eafc2, the exact boot, broker/worker
images, a canonical Artist owner and a new-job cutoff. Old queued jobs
are excluded; newly created replacement jobs on existing submissions remain eligible. The new login is NOLOGIN until credential installation and has
only DO RPCs; no generic queue, private table, legacy role or Storage key access.

Existing execution permits, global one-live index, targeted claims, lease
epochs/tokens, complete/output provenance rules, three-attempt ceiling and
backoff are retained. A new exact DO execution namespace is added without
removing either historical Google namespace. The root launcher independently
checks live run authorization through strict TLS before Docker creation, then
uses a durable one-shot record and never relaunches an uncertain operation.

## Credentials and transfers

The broker verifies the signed operator host inventory and actual boot, uses
strict PostgreSQL TLS/hostname validation to the approved Ohio pooler, and checks
its login's role/table/generic-claim privileges. Its only secrets are its narrow
DB password and host Ed25519 signing key. systemd encrypts them at rest; a root
supervisor creates broker-only RAM copies and removes them on exit. No Owner,
Supabase service-role or general Storage key is installed on DigitalOcean.

The existing Next server verifies signed, short-lived, exact-run/fenced transfer
requests before creating its privileged client. Input gets a 60-second exact
signed Storage URL visible only to the broker. Generated output (at most4MB)
uses a bounded server-mediated create-only transfer and hash/version readback.
Durable nonce claims reject replay and account before external I/O. No public
original or supporting-document URLs are created. Browser/user-supplied paths
are never accepted. The root launcher uses a separate signed live-permit read.

The trusted worker coordinator receives only its Unix-socket capability. The
native parser receives no credentials/socket/Docker mount or network, retains
Landlock/seccomp, read-only root, UID1000, one CPU,1GiB RAM,32 tasks and512MiB
scratch. Broker UID20000 remains separate; its supplementary GID1000 permits
only coordinator socket access, not parser access to UID20000 mode0400 secrets.

## Accounting and stop controls

- Dedicated DO monthly ceiling15USD before tax; full12USD base reserve.
- Explicit carry-forward reservation required; never defaults to zero. Reserve
  the approved1USD setup allowance conservatively until reconciled.
- Reserve0.10USD per newly admitted job and retain full reservations after settlement.
  A source→waveform→preview chain reserves0.30USD. Earlier0.03USD ledger entries
  remain valid historical evidence. The larger reservation also covers bounded
  transfer-function compute:13 calls ×60s ×4GiB is0.867GB-hours, approximately
 0.058USD at the published Pro credit rate, plus repeated50MB source transfer,
  derived verification, requests and logging. Root observations additionally
  overcount traffic. The15USD ceiling is unchanged; fewer jobs can be admitted.
  Pricing: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/
  and https://docs.netlify.com/build/functions/usage-and-billing/.
- Fresh root observations required within90s; boot/counter regression, month
  rollover, absent reconciliation or expired authorization fail closed.
- Historical Google liabilities remain explicitly UNKNOWN_PRESERVED_NOT_OFFSET;
  no zero balance, hold reset or purported Google billing clearance is introduced.
- Root launcher independently kills a running parser after560s; worker's existing
 540s deadline and parser resource/time limits remain. Broker service has a1h
  qualification window and no automatic restart. A new boot requires re-binding.

## Rollback

Close DO admission, stop the parser and broker, verify process/socket/credential
cleanup, apply `digitalocean-disable.sql`, and restore the prior application
release. Keep new tables, transfer claims, runs, permits and costs intact. Do not
restore the narrower historical execution-name CHECK over retained DO records.
For the waveform/preview SQL use the already target-specific production rollback
only after checking dependencies. Original capability values must be restored
from the activation receipt, with a compare-before-write guard.

## Validation scope

Focused SQL tests cover restricted privileges, historical job exclusion,
identity, stale accounting, global permit fencing, transfer replay, byte limits,
budget reservation and state-preserving disable. Transport tests cover signed
identity/expiration, exact Storage URL restrictions, no credential headers,
uncertain launch and recovery. API tests cover privilege ordering, byte hashes,
revocation and create-only response reconciliation. Eight root-launcher tests
cover fixed sandbox flags, no retry, missing daemon, identity/accounting failure,
independent timeout, missing live permit and image conflict. Native local SQL
was tested on macOS ARM64 PostgreSQL17.11 using a temporary Unix socket, not a
hosted/provider-owner or Linux AMD64 database test. Earlier host/codec results
are preserved and are not counted as new bridge acceptance.
