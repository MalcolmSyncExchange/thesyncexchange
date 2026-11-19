# November 2026 founder-only processing allowance

Founder authorization raises the existing November ceiling from $15 to $20.
It authorizes no additional infrastructure. The $12 host reserve, $1 setup
carry-forward, full per-job reservations, historical Google holds and unknown
liabilities remain unchanged. Supabase spend cap and private Storage remain unchanged.

Read-only production observation, 2026-11-19 00:43:09 UTC (November 18 Arizona):
19 settled runs; reserved $1.90; recorded spent $0.0691318558041033.
Whole-ledger MD5: `2031eca7d69adc4a9fcb4e37997d1491`.
Traffic 63,736,252 bytes; logs 2,685 bytes. Conservative projection:
`12 + 1 + 1.90 + 63736252/1e9*.09 + 2685/1073741824*.5`
= **$14.9057375129805564212799070**, leaving **$5.0942624870194435787200930**.
This is a reservation projection, not a provider invoice or refund entitlement.
Each newly issued attempt still reserves $0.10; fresh host counters, serialized
admission and the database ceiling prevent oversubscription. Retries reserve
again and stop if remaining capacity is insufficient.

Migration `20261119004313_digitalocean_november_20usd_ceiling.sql` changes only
the ceiling constraint and November row's ceiling. It does not enable admission,
renew expiry, modify capabilities or change any ledger record. $20 is rejected
outside November 2026 and values above $20 are rejected. Root launcher independently
rejects projections >= $20; live database authorization still runs before every
container start. Existing CPU, memory, PID, network and credential restrictions
are unchanged. Existing one-hour broker runtime remains bounded.

Activation requires verified current host/boot/image identity, fresh observations,
an explicitly bounded founder-only window, independent stop, and post-run evidence.
No historical Google jobs may be admitted. Rollback: stop broker and exact parser
processes, set DO admission disabled, verify RAM credentials and sockets removed.
Retain the $20 authorization and ledger; do not reduce the ceiling below incurred
reservations or erase liabilities to make rollback pass.

Local validation: 12 launcher checks, 12 restricted admission checks, 41 production
integration checks and native macOS ARM64 PostgreSQL migration/role checks passed.
These are not new native AMD64 codec or sandbox qualification claims.
