# PostHog Phase 2 core staging integration closeout

Prepared from the October 14, 2026 execution and subsequent read-only audit.
**Recommended decision: accept the verified core staging event pipeline with an
explicit historical-preservation evidence exception.** Founder acceptance is
pending; this document records a recommendation, not an approval already given.
Full historical preservation and production readiness are not established.

## Release and event identity

| Item | Verified identity |
|---|---|
| Coordinator | `971da0c498905cec2ce642b954d35f34b123509a` |
| Coordinator tree | `b0326e895c185099ae923c527047e087af57bdb9` |
| Application source | `e22b9bb7f2500412094db0132878b80167ce06d9` |
| Staging deployment | `6acfde50f68939d8d2e19252` |
| Netlify site | `d8e851a6-ab37-4b0e-9403-9b2c1be65f13` |
| Supabase project | `oppijylbkcbiqfuvckgj` |
| PostHog project | `657650` — The Sync Exchange, Staging |
| Authorization | `a2926e46-df3b-4631-807e-4643e1f8c1f5` |
| Admin | `6faee3df-7b4b-4d63-ba8d-1275139ccff5` |
| Artist | `9e61c9ea-ed51-4328-8937-0b989dece2c9` |
| Event UUID | `f7d9bd71-58ce-4770-a970-725c7b11ac6a` |

The application source association uses the retained checked-publication receipt;
manual Netlify publication did not supply a provider commit reference. Neither
this documentation commit nor the diagnostic coordinator was deployed by closeout.

## Verified core functionality

All eight authentication/readiness checkpoints passed. Server-action login,
server Auth getUser and canonical Admin role were independently checked. Active
readiness returned HTTP 200 with ready=true, grantUsable=true and every staging
identity, binding and safety flag true. The coordinator retained the session
through one event POST and subsequently completed browser cleanup.

The immutable grant was created once at `2026-10-14T22:43:07.976842Z`, with expiry
exactly five minutes later at `22:48:07.976842Z`. It was consumed at
`22:43:08.896723Z` and finalized at `22:43:09.004551Z`, outcome=accepted, linked to
the event UUID above. It is permanently consumed and cannot be reset or reused.
There were no additional grants beyond the approved one.

The single event POST returned HTTP 200, category=delivery_accepted and
claimOutcome=claimed. Supabase contains exactly one corresponding delivered row,
attempt_count=1, delivery_cycle=0, no next retry and no active lease. Total outbox
count advanced from five to six; the historical five remain unchanged.

The event is submission_started for the approved Artist, actor_role=artist,
environment=preview, is_test=true and is_internal=false. Its deduplication key is
`bounded-validation:a2926e46-df3b-4631-807e-4643e1f8c1f5`. The reviewed event path fixes
properties to submission_attempt_id=<authorization UUID> and
surface=submission_create, with no arbitrary browser properties or actor choice.
The synthetic path does not create a submission or catalog item.
The surface value is supported by the reviewed application contract and accepted
execution path; it was not separately selected in the PostHog destination query.

Independent PostHog exact-UUID queries returned exactly one matching event in
project 657650, with the correct name, Artist, authorization, preview environment
and test label. Supabase occurred_at is `2026-10-14T22:43:08.889817Z`; the PostHog
query reports `2026-10-14T22:43:08.889000Z`. They match at millisecond precision;
microsecond equality is not claimed. Ingestion acknowledgment was not substituted
for destination visibility evidence.

The standard SEC marketplace source predicate excludes this test row. The
separate authorized delivery-health RPC reports six delivered rows, no failures,
zero retry_due and zero retry_waiting. Standard SEC views also filter test events
out of Event Health; a dashboard showing this synthetic event was not verified.

Final observed safety: ANALYTICS_ENABLED=false; TEST payment mode; all six purchase
capabilities OFF; production PostHog token absent from staging; no pending events,
active leases, reusable grants or inspected Netlify/database analytics schedules.
Expired historical lease identifiers were preserved rather than deleted. These
are dated observations, not continuous monitoring or external-writer clearance.

## Postflight failure and evidence boundary

The temporary execution callback queried get_analytics_delivery_health through
the Supabase management API's supabase_read_only_user. The function resolves, but
that principal lacks EXECUTE permission; service_role has it. Replaying the same
read-only SELECT reproduced HTTP 400 with permission denied. The original raw
provider error was discarded, so the reproduction and privilege inspection are
the concrete diagnostic evidence, not a recovered original error message.

The SEC check ran before the final collector inside collectAfter. Its exception
prevented the collector from running, and the coordinator reported
postflight_collection_failed with preservation=null. This was a callback
permission/lifecycle failure, not a completed collector comparison detecting
an unauthorized mutation. It does not prove that no mutation occurred.

The complete execution baseline existed only in process memory. Retained files
contain source counts, timestamps and fingerprintPresent=true booleans, but not
the private record fingerprint map or its per-run HMAC key. Once that process
ended, a complete execution-time before/after comparison was unavailable.
No current snapshot can reconstruct that missing past evidence.

The later audit read all 17 protected database sources plus environment metadata
successfully twice. All 62 current-to-current assertions passed. They establish
stability during that audit interval only. Older retained release fingerprints
independently support the scoped preservation findings below; they do not provide
one coherent replacement for the lost complete execution baseline.

## Release acceptance matrix

| Category / gate | Classification | Evidence and boundary |
|---|---|---|
| Canonical Admin authentication and active readiness | PASS | Eight checkpoints; HTTP 200 and all identity/safety flags true |
| Immutable single-use grant | PASS | One new grant, exact five-minute expiry, permanent consumption |
| Outbox delivery and deduplication | PASS | One approved row/attempt; six total; no pending/retry/active lease |
| Independent staging PostHog visibility | PASS | One exact UUID result, correct event/Artist/test/preview/authorization |
| Standard SEC marketplace exclusion | PASS | Approved test row does not satisfy standard source predicate |
| SEC synthetic-event dashboard visibility | NOT VERIFIED | Standard Event Health filters test events; separate RPC delivery evidence only |
| Historical grants and five events | PASS | Approved grant fields and historical event fingerprints preserved |
| Canonical roles, profiles and onboarding | PASS WITH LIMITATIONS | Full older release fingerprints match; exact coherent execution baseline missing |
| Storage objects | PASS WITH LIMITATIONS | Four objects match older release fingerprint; file-byte integrity not tested |
| Auth users | PASS WITH LIMITATIONS | Older normalized user fingerprint matches; exact execution login timestamp delta unavailable |
| Auth identities and full session history | NOT VERIFIED | 19 older sessions match; original 25-session record map unavailable; count 25→26 and one approved session in login window observed |
| Bucket metadata | PASS WITH LIMITATIONS | Non-avatar buckets match older fingerprint; exact avatar-bucket execution comparison unavailable |
| RLS policies, privileges and table security | NOT VERIFIED | Older public/storage policy subset matches; complete execution-time content comparison unavailable |
| Migration history | PASS | All 40 versions/checksums unchanged |
| Payment capability values and disabled analytics | PASS | Six OFF flags and disabled/test configuration independently read back |
| Full environment metadata preservation | NOT VERIFIED | Current stability and key safety settings verified; exact execution baseline missing |
| Current snapshot coverage/quiet state | PASS | All 18 sources complete; 62 comparisons between current snapshots passed |
| Complete historical execution preservation | BLOCKED | Missing original fingerprint map/key; cannot claim PASS |
| Limited core staging integration acceptance | PASS WITH LIMITATIONS | Recommend explicit founder acceptance of the stated evidence exception |
| Production analytics activation | BLOCKED | Separate production requirements, evidence and authorization outstanding |

No unexpected differences were detected within the independently verifiable
subsets. That statement does not exclude changes in the unverified historical
domains. Record counts alone are not content-preservation evidence.

## Founder decision recommendation

The founder can formally accept the **core staging integration** with this
explicit evidence exception, without another live event. A new event would add
data but would not restore the old fingerprint map or prove historical Auth/RLS
preservation. The already consumed grant and delivered event must be preserved.

Suggested decision text, awaiting an actual founder decision:

> I accept the PostHog Phase 2 core staging event pipeline as verified for the
> recorded event, with the historical-preservation evidence gaps in this matrix
> expressly acknowledged. This acceptance is limited to core staging integration.
> It does not certify complete historical preservation, authorize another event,
> resume QA, enable analytics or authorize production deployment or activation.

Record the founder's name, decision timestamp and reference when separately
provided. The prior NO-GO for unconditional full staging acceptance remains
accurate; scoped exception acceptance is a distinct governance decision, not a
retroactive PASS for the missing assertions.

## Evidence custody

[The manifest](evidence/manifest.json) records byte-identical local copies of nine
sanitized receipts. Original files and scripts remain untouched at their recorded
paths, including the failed coordinator receipt and failed first safety check.
Private older baseline fingerprints remain at their existing restricted paths;
they were used in memory for comparison and are not copied into Git or this report.
Raw PostHog connector responses remain in the conversation; the archived destination
receipt contains the sanitized verified fields and query provenance.

- [Execution receipt](evidence/execution-receipt.json)
- [Coordinator receipt, including failure and cleanup](evidence/coordinator-receipt.json)
- [Independent destination verification](evidence/destination-verification.json)
- [Postflight assertion report](evidence/postflight-audit.json)
- [Complete current-source audit](evidence/current-snapshot-audit.json)
- [Permission diagnosis](evidence/permission-diagnosis.json)
- [Final safety](evidence/final-safety.json)
- [Historical grants](evidence/historical-grants.json)
- [Scheduled-worker check](evidence/scheduled-worker-check.json)

Copies were checked for secret-like values, JSON validity and byte equality.
Core claims were reconciled against the receipts, including the retained failure;
local document links and git diff formatting checks passed. No application tests
or build were rerun because this closeout changes documentation/evidence only.
This closeout performs no hosted reads/writes, login, grant/event operation,
deployment, migration, payment or analytics activation.

## Future improvements and production gates

See [the follow-up plan](future-readiness.md). These are requirements and proposed
local work, not changes performed or authorizations granted by this closeout.
