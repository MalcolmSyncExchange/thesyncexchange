# Bounded launcher shutdown reconciliation

The independent stop on November19 04:31:18UTC stopped the broker and removed RAM credentials. The launcher then exceeded its unchanged20second TimeoutStopSec while individually checking35 historical containers. Systemd force-killed it; no containers remained running. This is not a graceful-shutdown PASS.

Reuse one fresh immutable Docker snapshot when closing the server. Every root-owned record still receives the existing image/run-label/missing-container validation. Only a running execution enters the existing fresh per-run kill and post-kill confirmation path. Nothing starts or retries; accounting records, timers, CPU/memory/PID limits, images and authorization are unchanged.

Native AMD64 read-only benchmark under the existing20%CPU/128MiB limits,35 copied root records: old loop21.808508s/140Docker calls; candidate0.629088s/2Docker calls. Docker commands were restricted to ps/inspect, all actual containers were already stopped, and actual launcher records were untouched. Ratio34.67x applies only to this history shutdown operation; it is not an end-to-end audio speedup.

Twenty launcher tests and fourteen accounting tests pass, retaining all earlier assertions. Added cases cover stopped-history batching, a running job's fresh kill/confirmation/context cleanup, and identity-conflict rejection. Native service stop must still be verified after reviewed installation. Rollback keeps the prior root-owned launcher at its immutable SHA2563d47f80198e7fbd94d59d846b462fffa224431cd67cb53e89999d3107662d7d5. No SQL or frontend release is required.
