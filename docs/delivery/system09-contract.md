# System 09 secure delivery contract

Local implementation only, based on System 08 `745f9f7c4b7cc6c0740f18e513b2e8218395ce82`. No capability, hosted policy, credential, commerce setting or release stage is enabled. Stop before System 10.

## Preserved authority

PK08's reviewed license delivery set, PK04 source links, PK03/06 accepted transaction, PK07 verified payment and issuance fencing, and Systems 04/05/07 rights, catalog and contractual lifecycle remain authoritative. The new system does not select every track asset, backfill legacy assent, issue a new license on download, restore financial holds, or copy current assets into an old manifest.

A request must be an explicit POST from the configured application origin. GET/HEAD/prefetch perform no authorization or Storage I/O. The server validates provider identity, canonical Buyer role and RLS-scoped order ownership before acquiring a privileged client. SQL validates the exact active owner-bound session (including `not_after`), immutable manifest, sealed object version, private bucket, approved source/rights, exact payment evidence, active entitlement, original usage duration, contractual closure, adverse holds, fixture designation and dormant capabilities. Missing evidence denies delivery.

The existing six asset kinds remain explicit: master, instrumental, clean, alternate, stems and supporting. Several individually reviewed files or a reviewed ZIP may be included. The application does not assemble a ZIP from arbitrary catalog assets. Agreement PDFs use the separate historical-record authorization policy; valid generated agreements remain accessible after refund/termination without authorizing exploitation assets.

## Authorization and transfer

- At most two unresolved authorizations per Buyer; the existing 20/minute and 1,000/day authorization limits remain enforced. A fresh attempt uses a new request UUID and repeats all checks.
- Inline assets are limited to 4,000,000 bytes. Larger objects use the separate Node broker; binary bodies never traverse a Netlify Function at large size.
- Tickets contain 256 random bits. Only SHA-256 digests persist. Redemption is single use and expires with the original authorization, at most 60 seconds. Reusing an expired/redeemed ticket cannot recover a download.
- Broker inputs accept only one exact ticket field, at most 128 bytes, within five seconds. No supplied path, account, entitlement, service key or Storage URL is accepted. Broker database HTTP calls have a five-second deadline.
- Private source access rejects traversal, non-loopback HTTP, redirects and mismatched size. Storage reads have a 20-second deadline. Service credentials remain server-only and do not appear in responses, URLs, analytics or audit projections.
- The broker incrementally spools and hashes up to 250,000,000 bytes before releasing any file bytes. A 0700 temporary directory and 0600 file bound memory use; failed preparation, completion, cancellation and ordinary errors remove the spool. Inline bytes are also fully hash checked before streaming.
- Transport chunks are at most 64 KiB. Reauthorization occurs at the start, at most every 1 MiB or one second during progress, after disk I/O at those checkpoints, and before the final chunk. The original hard expiry is checked on every pull and by a timer. Final SQL audit independently rechecks entitlement/session/rights/payment.
- A committed restriction stops the next authority checkpoint. Already transmitted bytes cannot be recalled. Database/network latency, TLS buffering and TCP delivery introduce a bounded in-flight exposure; this is not a promise of immediate recall or DRM.
- Range/resume is deliberately rejected. An interrupted download restarts the same original entitled file with a fresh authorization. No additional charge, new license or substituted source results.

## Evidence and recovery

`delivery_authorizations` is the immutable decision. Existing `delivery_outcomes` records preparation separately from new `delivery_transfer_events` (started and one terminal event). `stream_exhausted` means the application consumed and handed off its verified stream, not that the browser saved it or that HTTP transport confirmed every byte. `client_receipt_confirmed` is always false. Interrupted byte counts are application-observed counts, not forensic proof of client receipt.

A process crash may leave a start without a terminal event. Expired authorizations are projected as expired. An active MFA Admin can close expired records with an idempotent request, reason and evidence reference. The resulting zero byte count means no surviving application byte measurement was available. Recovery cannot remove a hold or grant any entitlement. Restriction, expiry, interruption and integrity failures preserve the original agreement, manifest and audit history.

New transfer/operator evidence is append-only, FORCE RLS, and has no direct grants to anon/authenticated/service-role. Service-only RPCs handle transfer evidence; authenticated owner/MFA Admin RPCs expose bounded safe projections. `delivery_operations` rejects missing, NULL and out-of-range page values, including direct RPC callers. SQL rechecks active MFA Admin on every operator action. Operators may record review, close expired attempts or restrict access; there is no restore-access command.

## Buyer and SEC surfaces

Buyer purchase details show the original included files, including unavailable source entries, with explicit loading, transfer progress, cancellation, retry guidance, and the latest 100 download attempts. Filename values are server-derived. A complete response is size checked before the browser publishes a save operation; partial bodies are discarded. Browser memory remains bounded by the supported 250 MB maximum and requires real-device qualification.

`/admin/delivery` and `/api/delivery` provide MFA-restricted paginated investigation, exact order entitlements, safe preparation/transfer history, holds and contractual state, and audited operations. Admin order cards link to the selected delivery investigation and existing payment/fulfillment operations. Operations never acquire privileged Storage credentials.

## Migration, operations and rollback

Additive migration: `20261024105306_system09_secure_delivery.sql`, after all 61 System 08 predecessors. Existing lifecycle RPC OIDs/grants are retained with drift-checked edits. No Auth/Storage ownership or policy is changed. No defaults are enabled; no historical orders are rewritten. Exact replay and native tests must validate the provider-owned Storage installer boundary.

Before a separately authorized hosted rehearsal, provision a dedicated broker runtime with TLS, fixed application/project origins, private server credentials and network access, encrypted ephemeral spool storage, at least 500 MB active spool capacity plus headroom, and a service-owned cleanup procedure for abandoned `tse-delivery-*` spools after process crashes. No cleanup job is installed here. Spool directories must never enter logs, backups or public artifacts; remove expired crash remnants under the dedicated runtime's ownership and retention policy. Monitor disk/heap, preparation time, authorization expiry, transfer interruption, immutable evidence persistence and broker concurrency. Calibrate the existing 20-second Storage read and 60-second total authorization limits against the maximum file and expected network throughput. Local tests do not prove hosted capacity.

A crash/restart rehearsal must prove expired ticket denial, stale-record closure, safe spool cleanup and fresh authorized retry. Test real private Storage RLS, canonical ownership, exact bytes/version, native Linux AMD64, TLS/proxy/CORS, secret redaction, actual maximum-size/stem package transfer, revoke/refund/dispute during transfer and browser cancellation. Independently review security, Safari/Firefox/mobile/accessibility and formal acceptance. Founder stage approval remains mandatory.

Rollback by disabling delivery and stopping the broker; retain manifests, accepted terms, licenses, entitlements and audit evidence. Do not reverse the migration by deleting financial or legal history. The existing frozen release candidate and Phase A custody/quota/budget holds remain unchanged. The inherited six dependency advisories are not cleared by this package.
