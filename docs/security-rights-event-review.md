# Read-only review of rights event b48410ec…

Evidence was queried read-only from the already identified production project. No customer name, email, audio or account credential is included here; no row was modified.

## Observations (UTC, 2026-09-03)

| Record/event | Time / evidence |
| --- | --- |
| Track created | 23:30:08.935095 |
| Stored `approved_at` | 23:31:55.329000 |
| Sole current rights row created | 23:31:56.046925 |
| Same rights row `updated_at` | 23:31:56.046925 — equal to its creation time |
| Track's last `updated_at` | 23:31:56.219390 |
| Current row transaction identifiers | Rights row 2488; track row 2489 |
| Current rights | One row, 100%, approved |
| Track audit events / nearby audit events | None |
| Track license options | None |
| Available Auth audit entries | None |

The approximately 0.717925-second difference is between the rights **creation** timestamp and the stored approval timestamp. It is not evidence of a later UPDATE to an existing rights row. The rights row's final write predates the track's final write according to the observed transaction identifiers and timestamps.

## Source comparison

- `services/admin/actions.ts:updateTrackStatusAction` supplies `approved_at` using application `new Date().toISOString()` before the database request. It is not a database commit timestamp.
- `public.update_updated_at_column()` sets `updated_at = now()`. PostgreSQL `now()` is transaction time, not the exact commit time.
- `services/tracks/actions.ts` creates rights and license options before normal moderation; ordinary update/resubmit changes status to draft/pending before rights replacement.
- Current moderation checks rights totals before entering approved state.

## Conclusion

**Consistent with rights insertion followed by a later track approval/update using an earlier client-supplied timestamp; not demonstrated to be a post-approval rights mutation.** Client clock differences or a timestamp captured before a multi-request initialization sequence can produce this ordering.

It is not possible to attribute the record to the complete expected application workflow: there is no creation/moderation audit trail, no license options, no historical row versions, and no operator/request logs establishing what the final track write did. Transaction identifiers describe the surviving row versions, not a complete history. A manually supplied timestamp or out-of-band initialization remains possible.

Status: **provenance UNVERIFIED; timestamp-only suspicion reduced**. Do not weaken or remove the reviewed-rights migration based on this event. Operator confirmation or retained deployment/request/import logs are still needed to close the provenance question. No repair or production test write was performed.
