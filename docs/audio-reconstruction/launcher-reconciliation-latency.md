# Bounded launcher reconciliation latency

November18Arizona, after successful reboot reconciliation PR54/995cbdf5 (main
60220699). Ten founder stages completed, including the current recording's source
validation and measured waveform. Three later preview launch reservations failed
before claim (job attempt0); each$0.10 remains reserved. Admission was disabled
and broker/launcher stopped before further automatic work. Accounting stays active.
No historical job or reservation was reset, no security failure is hidden.

Root evidence: launcher CPUQuota remains20%; cumulative98.17CPU seconds and341.81
throttled seconds,4867throttled periods of4970. Broker's15s Unix request deadline
expired and the server later emitted BrokenPipeError while returning the response.
Historical sweeps and start admission each invoked two Docker commands per record.

Native AMD64 read-only benchmark under the SAME20%CPU/128MiB limits, using copies
of29existing records and a wrapper permitting ONLY Docker ps/inspect:

| Reconciliation | Docker commands | Wall time |
|---|---:|---:|
| Previous |58|8.100273s|
| Candidate |2|0.611283s|

A sweep followed by the old start scan alone can exceed15seconds before fixed
image/authorization work. This is measured launcher overhead, not codec failure.

Fix: one fresh Docker ps + bulk inspect snapshot per individual sweep/start
reconciliation. Each record still passes its original immutable-image and exact
run-label checks. Missing/conflicting/duplicate identities fail closed. Historical
running containers still block a new execution. Deadline termination refreshes the
individual state after kill; direct per-run status remains fresh. No snapshot is
cached between requests; the existing single-threaded root server serializes starts.
Daemon failure is never treated as absence. All existing one-shot, disk, per-run
live permit, freshness, network, credential and resource gates remain in force.

No parser/broker image, algorithm, SQL,15s deadline,560s termination deadline,
CPU/memory/PID limit, financial ceiling or reservation amount changes. No failed run
is restarted. Future legitimate retries require newly fenced and reserved operations.

Local17launcher tests (all12original tests retained) +14accounting tests and41rights/
admission integration checks pass. Two initial new test fixtures incorrectly modeled
snapshot deep copies and intent-vs-terminal semantics; corrected tests now exercise
the same production semantics, without changing the original assertions.

After reviewed merge and CI: retain installed launcher/hash, install exact candidate
atomically while admission/units are stopped. Restore only the remaining already
authorized owner/boot/expiry window, with its independent stop timer unchanged. Verify
live requests and all remaining previews; stop admission on another uncertain launch.
Do not refund the three failed reservations or alter the original19accounting records.
