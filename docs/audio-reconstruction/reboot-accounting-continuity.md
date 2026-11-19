# November 18 reboot accounting recovery

Prepared correction; not installed or admitted until reviewed main release.
No media algorithms, broker, database schema, credentials or job reservations change.

## Evidence and conservative reserve

Existing host 620470021, root UUID 59134bd0-a76f-4ea0-8e4a-770b2e1eafc2.
Pinned existing SSH key verified after cloud and UFW /32 correction. Disk and keys
preserved. No Recovery ISO used. Broker/launcher inactive, accounting timer disabled,
no running Docker containers. Database 19-run SHA256 remains
9aec6f5960cfbf59a96d19c2999e3e11a2ec2bf9faf89116932ee1621f8987b3.

Retained v1 ledger SHA256
b8a2a3789e74fafa8d54f2e3b145a92996957ffc65cfd77b313fcc3f26d9e7c0:
63,906,087 transmitted bytes, 2,685 log bytes, sample 2026-11-19T02:43:13.482Z.
Boot 1287548f-d8c3-4d24-9f77-e37593fc66db stopped at 02:43:33Z:
19.518 seconds after the last recorded sample. Intervening boot
adaca448-f232-4a93-945e-22896c1a182e has journal range02:44:06–02:54:53Z,
with no accounting-service entries. Current boot
c9f16c23-0c25-416c-b22e-b23a705b15cf began by02:55:25Z.
Current boot is covered by live cumulative interface counters, not an assumed zero.
Power-off gaps are not presented as measured network traffic.

Existing sysstat sa19 confirms restarts02:44:15 and02:55:35, but contains no
intervening DEV measurement. It cannot alone clear the missing usage.

Authenticated DigitalOcean Insights for this exact Droplet, 1-hour view observed
at03:16UTC: graph02:16:00–03:15:58UTC (Arizona19:16–20:15:58 November18).
Four public/private inbound/outbound series each expose241 points; the aggregate
displayed Y data range is0–9157.720101781171 bits/second. This is provider operational
telemetry, not an invoice. A rounded10,000b/s envelope applied to all four series
for the entire3,600seconds is18,000,000bytes, already counting inbound/private
traffic conservatively. Proposed carry-forward reserves1,000,000,000traffic bytes
(over55 times that envelope) plus1,048,576log bytes. It deliberately overcounts
already measured portions and current-boot traffic; no credit/refund is inferred.
Recheck source coverage, data completeness and preserved ledger before applying;
if conflicting/missing provider evidence appears, reject rather than invent usage.

At current observed56,178boot bytes the conservative projection is approximately
$14.99625 of$20:12fixed+1historical carry+1.90settled reservations+all traffic*.09/GB
+logs*.5/GiB. About$5.00375 remains before fresh growth.13first-pass queued stages
would reserve another$1.30;39attempt slots would reserve$3.90. Actual serialized
admission must enforce the live projection for every attempt. Google liabilities
remain UNKNOWN_PRESERVED_NOT_OFFSET. No historical accounting is replaced by zero.

## Implementation and atomicity

The v1 ledger.json stays byte-for-byte untouched. New mutable state.json stores
cumulative offsets separately from current-boot kernel counters. A root-only
reconciliation creates exactly one immutable O_EXCL/fsync JSON event per destination
boot containing the previous full snapshot, canonical SHA256, exact boots, source
coverage and positive conservative bounds. An advisory lock serializes reconciliation
and sampling. The new event must be durable before any new state/sample is published.
Crash after event publication resumes the same transition. Identical retry does not
charge twice; conflicting/stale receipts fail. Current-boot samples add only their
raw counter to the carried offset; old reservations are not copied into new runs.
Corrupt state/event, regressing counter/clock, unknown boot or missing baseline fails
closed. Root-only 20-second timer and existing freshness contract remain unchanged.

This makes restart recovery a bounded evidence import rather than editing/resetting
the ledger. Unobserved future boots still require evidence: no automatic zero-gap
assumption. A fully unattended reboot-admission policy is not claimed by this patch.

## Installation and rollback

After approved merge/CI, stop accounting timer, retain the old installed script/hash,
verify exact approved new script and install atomically. Preserve root ownership.
Prepare root-owned evidence JSON with previous/current boot IDs, current boot start,
coverage start/end, source description, traffic_bound_bytes1000000000 and
log_bound_bytes1048576. Verify canonical expected state SHA independently, invoke
`do-accounting.py --reconcile-evidence PATH --expected-state-sha256 SHA`, then sample.
Verify old ledger hash and19-run database hash unchanged, event exists once, aggregate
totals include old+reserve+current, and fresh RAM sample matches. Enable accounting
timer only; this does not authorize broker execution.

Before founder-only processing, install already merged$20 launcher, verify new exact
boot binding and unchanged image pins, renew only approved owner/time scope, establish
independent one-hour stop, retain parser restrictions, and verify credentials are
RAM-only. Any admission, financial, security or identity failure stops execution.

Rollback: disable admission and stop broker/launcher; remove RAM credentials and
verify no active parser. Stop accounting timer and restore old executable if needed,
but keep v1 ledger, all v2 state and reconciliation events. The old sampler will
correctly refuse the changed boot. Never delete/reduce records to make rollback pass.

Local14accounting+12launcher tests pass, including carry preservation, repeated
samples, crash/retry, conflicts, stale evidence, missing coverage, corruption and
unknown reboot. These are local lifecycle tests, not a new codec qualification.
