# DigitalOcean production integration gate

Decision: **BLOCKED — production application compatibility is not established.**
Baseline: `e670573d`. This record preserves the prior native AMD64 host, audio,
and sandbox results; those investigations were not repeated.

## Confirmed incompatibility

The retained production schema capture (`production-schema-evidence.json`,
2026-11-17) includes `public.media_submission_save_draft` and
`submission_media.validate_workspace_rights`. Production accepts structured
master owners, publishing owners, authority, sample disclosures, claims and
agreements. Saving a previously structured workspace without `publishingOwners`
raises `Reload the updated rights workspace before saving`.

The candidate `lib/media/submission-draft.ts` is a strict schema without these
nine structured fields. `services/media/uploads.ts` parses every save through
that schema. `components/artist/uploads/submission-workspace.tsx` presents
free-text ownership/authority rather than the structured contract. Consequently,
keeping the production database unchanged does not make this replacement app
compatible: structured fields are rejected by the application, and stripping
them makes updates to existing structured workspaces fail at the database.

This is a confirmed contract mismatch against the captured target, not a claim
that production records were modified or that a new live upload was attempted.
No new production inspection, SQL, credentials, admission, deployment, or hosted
processing test was performed in this review.

## Validation

`node --test --experimental-strip-types tests/audio-production-compatibility-blocker.test.mjs`
passed one diagnostic. It proves the incompatibility; it is **not** an audio
acceptance pass. It checks all nine production field names against the captured
function and reproduces candidate unknown-key rejection for each. Test values
are intentionally schema probes, not purported valid production rights records.

## Smallest required fix

Restore the existing structured submission-rights contract in the candidate's
schema, loading, save round-trip and artist interface. Include submission-bound
private supporting-document flows and existing authority/disclosure validation.
Do not change production validation to accept the older free-text-only form.
Test representative/owner authority, ownership shares, samples, claims,
agreements, private documents, cross-account denial, and preservation of saved
structured drafts against the captured production functions. Then refresh the
narrow drift gate and continue the DigitalOcean admission bridge and target
migration/rollback acceptance. No source-recovery or host qualification repeat
is required.

## Work not completed

- DigitalOcean-specific production admission and RAM credential bridge.
- Target acceptance of the new admission schema and rollback.
- Production credentials, worker enablement, application publication.
- Founder-only end-to-end upload, acceptance, SEC review and buyer playback.

Existing GCP admission must not be reused by spoofing its numeric worker identity
or clearing its historical holds. The DO bridge must preserve fenced permits and
use a distinct verified host binding. Historical liabilities and the two queued
jobs must remain untouched. Clean Media Recovery remains HOLD.

## Preserved state and costs

No infrastructure or production changes were made by this review. The approved
Droplet remains the previously provisioned resource ($12/month base within the
$15/month allowance); there is no new billable infrastructure. Current cloud
state was not freshly queried. No production deployment ID or end-to-end PASS
can be reported. The existing live site remains the founder's current site.
