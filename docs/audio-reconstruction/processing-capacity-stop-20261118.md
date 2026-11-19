# P0 processing capacity gate — November 18, 2026

Status: BLOCKED; production remains6afe277774de695b735cdd88 / main56fff96e.
This is the focused first step of the founder's Audio Processing, Playback &
Upload Performance directive. Its explicit financial stop condition applies.
No application implementation, production SQL, worker activation or release was
performed during this review.

## Verified ledger

Read-only production do_control and do_runs:

| Component | USD |
| --- | ---: |
| Fixed monthly DigitalOcean hosting reserve (once) | 12.00 |
| Preserved setup carry-forward | 1.00 |
| 19 settled job reservations (12 completed,7 failed) | 1.90 |
| Host traffic/log observation estimate | 0.0057375129805564212799070 |
| Current conservative projection | 14.9057375129805564212799070 |
| Authorized monthly ceiling | 15.00 |
| Remaining projected headroom | 0.0942624870194435787200930 |

The historical runs retain recorded transfer/storage estimates of
0.0691318558041033USD. This is not total provider spending. The difference
between that field and1.90USD is not automatically releasable cash.
The fixed12USD charge appears once, not once per job. The0.10USD per-job envelope
also reserves bridge-function compute, network, requests and logs. The reviewed
contract explicitly retains reservations after settlement. Its immutability
trigger rejects changes to settled liabilities, rather than providing a refund.
No demonstrated fixed-hosting duplication was found.

Fresh state: enabled=false; previous founder-only receipt expired
2026-11-18T19:47:42.345Z (12:47:42.345pm MST). Last root observation was
2026-11-18T18:55:37.516947Z; an enabled worker requires observations within90s.
Expiry and freshness are independent gates even if financial capacity is added.
Historical Google liabilities remain UNKNOWN_PRESERVED_NOT_OFFSET.

## Additional existing evidence

Authenticated Netlify edge logs for03:00–19:00UTC on November18 contain26
worker-transfer and18 worker-launch requests. Both query pages reported no
next page. They total39.972634478s edge latency, with39HTTP200,2HTTP403,
2HTTP405 and1HTTP503. Durable database transfer claims:15input,8output.
These logs show real activity and latency; they do not attest complete billed
GB-seconds, memory allocation, retry coverage or provider reconciliation.
No settled reservation was released on the basis of request latency.

Netlify's official billing guidance meters compute in GB-hours and separately
meters requests/bandwidth, so edge latency is not by itself a complete bill.
https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/

## Exact decision needed

At current counters, the next0.10USD reservation does not fit. A single
source→waveform→AAC chain needs three reservations: a projected minimum
15.2057375129805564212799070USD before further host traffic/log observations.
The arithmetic minimum ceiling would be15.21USD, without useful margin.

Smallest practical proposed approval: temporarily raise the November operating
ceiling to15.50USD (0.50USD additional authorization), and renew a one-hour,
founder-only window scoped to one chosen queued recording. Keep existing
fail-closed per-job/counter gates, retries, immutable liabilities and historical
holds. This proposal is not permission to change the15USD CHECK constraint,
root configuration or signed admission. Those changes need a separately tested,
exact reviewed implementation before activation. No new paid infrastructure or
subscription is proposed. It is not authorization for continuous general queue
processing; unexpected observed usage must still close admission.

The present eligible backlog has six source-validation jobs (five queued, one
retry_wait) and one queued preview. Completing all resulting chains once could
require19 job reservations, or16.8057375129805564212799070USD before additional
host traffic/log growth and retries. A15.50USD one-track window does not promise
to drain that backlog.

Alternative without increasing15USD: supply authoritative usage reconciliation
sufficient to support an append-only release ledger. Retain original runs,
reservations, charges and unknown liabilities. Never overwrite spent_usd,
reserved_usd, historical holds or the1USD carry-forward to manufacture room.
No release is justified by the current evidence alone.

Playback optimization, draft-deletion implementation and upload-progress
redesign have not started; no faster performance or new processing acceptance is
claimed. The existing live upload/player release is preserved. Supabase spend
cap and Clean Media Recovery HOLD remain unchanged.
