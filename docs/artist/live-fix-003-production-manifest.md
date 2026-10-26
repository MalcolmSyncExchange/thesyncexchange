# Live Fix #003 — proposed production changes

Status: **NOT EXECUTED — separate founder authorization required.** The founder approved an initial 50 MB limit while preserving the spend cap. That limit decision does not authorize production writes.

## Exact targets and existing baseline

- Supabase production project: `sgpubcpldfxcuhjjdcau` (TheSyncExchange).
- Existing Netlify site: `e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5`.
- Existing application: `7e1fd9167a5cc35d96ecde17b5408752222fc4b5`; deployment `6adeb488feed7faae5d97207`.
- Read-only investigation: 48 migration records, three Auth users, three profiles, seven buckets, one Storage object, zero submissions/tracks/media jobs. All four media capabilities OFF; intended three media buckets absent. Existing object guard enabled. Existing reservation INSERT and restrictive policies already installed.
- Provider Storage settings show a 50 MB global limit and a spend-cap restriction. Keep both unchanged. Limits below use **decimal bytes**, with audio capped at 50,000,000 bytes even if the provider interprets MB differently.
- No changes to Auth, Stripe, legal/payment safeguards, unrelated buckets, financial/email/media workers, analytics or production environment variables.

## Proposed migration

Apply only `supabase/migrations/20261026021846_artist_submission_workspace.sql`.

SHA-256: `22c4977f28c780789e734feda2e20c42f016c94d5f3d39f20fc452b6d893edeb`.

This one transaction:

1. Adds nullable `workspace_draft jsonb` and `workspace_revision bigint NOT NULL DEFAULT 0 CHECK (workspace_revision>=0)` to `submission_media.submissions`. Existing records receive revision zero without fabricated metadata.
2. Rebuilds only `operations_action_check` to retain every existing operation and add `save_workspace_draft` / `prepare_workspace`. Constraint validation is transactional; no operation records are removed.
3. Adds four authenticated Artist RPCs: `media_submission_status()`, `media_submission_save_draft(uuid,jsonb,bigint,uuid)`, `media_submission_recover(uuid,uuid)`, `media_submission_prepare(uuid,bigint,uuid)`.
4. Replaces `submission_media.upload_state(uuid,boolean)` and `public.media_upload_list()` to include private draft data/revision and accurate file/review summaries under the existing owner or MFA Admin boundaries.
5. Replaces `public.media_upload_reserve(uuid,text,text,text,bigint,bigint,uuid,uuid)` with the same ownership, idempotency, revision, quota, immutable-version and audit logic, reducing its audio admission ceiling to 50 MB. Artwork remains 10 MB.

Four new RPCs explicitly revoke PUBLIC/anon/service-role execution and grant only authenticated execution, with canonical role, active-session and ownership checks inside. Existing private-table grants and RLS are preserved. No Storage DDL, account/profile changes, deletes, rights approvals, publication, license issuance or capability activation occurs in this migration.

Use the official migration application workflow with this exact file and normal approval, recording its migration name/version and SQL checksum. Expected ledger: 48 → 49, preserving all previous 48 records and statement fingerprints. Do not run `db push` against the mismatched historical ledger, replay old migrations, or execute the file through a raw query and pretend it registered itself. Stop on any unexpected schema, owner, ACL or ledger difference.

## Proposed private buckets

Create **only missing** buckets through the supported Supabase Storage API/dashboard. Do not insert bucket rows directly with SQL. Refuse to overwrite an existing mismatched bucket.

| Bucket ID/name | Public | Maximum bytes | Allowed MIME types |
| --- | --- | ---: | --- |
| `submission-source` | false | 50,000,000 | `audio/wav`, `audio/x-wav`, `audio/wave`, `audio/vnd.wave`, `audio/aiff`, `audio/x-aiff`, `audio/flac`, `audio/x-flac`, `application/octet-stream` |
| `submission-artwork` | false | 10,000,000 | `image/jpeg`, `image/png`, `image/webp` |
| `submission-derived` | false | 4,000,000 | `audio/mp4`, `application/octet-stream` |

MIME admission is supplementary; existing content validation remains required. No public reads, public URLs, overwrite/upsert rights, new permissive SELECT/UPDATE/DELETE policy, service-role client exposure or worker access expansion is proposed. Preserve the existing seven buckets and original object bytes/version/ownership. Expected bucket count after creation: ten. No source objects are created during configuration.

## Proposed capability activation

After successful backup/migration/Storage checks and application publication, execute the separately approved exact `docs/artist/live-fix-003-upload-activation.sql` transaction. It locks and checks the dormant singleton, 49-row ledger/new migration, exact three private bucket limits and installed object guard before changing **only**:

Activation SQL SHA-256: `1846fcbac16ae9a230959998248131bbba9b965699097231b3c29b9546516c10`.

```text
foundation_reads_enabled: false → true
reservations_enabled:     false → true
worker_enabled:           false (preserved)
activation_enabled:       false (preserved)
```

The runtime availability RPC inspects real bucket privacy/limits and the enabled guard. It does not misuse `storage_setup_ready()`, which intentionally becomes false after setup leaves dormancy. Hash the activation SQL before approval; no automatic invocation is wired into application startup or deployment.

## Controlled execution and recovery

1. Reconfirm exact project/site/current deployment, 48-row ledger, source hashes, three canonical roles, all four capabilities OFF and current bucket/object fingerprints. Capture provider status: a dashboard incident banner was visible during discovery; stop if an active incident affects safe writes or upload verification.
2. Refresh the existing production recovery checkpoint immediately before changes: current schema, application/Auth data, Storage metadata and original object bytes. Verify hashes and restore into a disposable local database. Retain existing backups. A historic pre-MFA/onboarding backup alone is insufficient. Backup refresh has **not** been performed for this proposed change yet.
3. Apply the single approved workspace migration; verify expected functions, owner/search_path/ACL, columns, constraint and exactly one new ledger record. Reconfirm existing data fingerprints.
4. Create and verify the three exact private buckets through Storage; preserve global 50 MB limit/spend cap and all existing policies/objects. Verify restrictive read/write controls, exact owner reservation predicate, trigger definition/ACL and provider TUS CORS. A 200 OPTIONS response alone is not upload acceptance.
5. Build/publish the exact approved application commit to the existing site, with all original disabled flags intact. Verify READY, HTTPS, navigation, existing authentication, anonymous/Buyer/Admin denial of Artist mutations and safe unavailable messaging while upload flags remain OFF. No new site or service.
6. Execute the approved capability transaction; verify exactly one singleton changed and both worker/activation flags remain false.
7. With separate approval for these test records, use the existing approved Artist account to save **one synthetic incomplete draft**, upload the 6,720,044-byte sine-wave WAV and synthetic artwork (under 10 MB), refresh/resume and verify owner-only access. Test oversized-file denial before reservation; test unauthenticated and other-account Storage/API denial without exposing locators. Preserve these test records and objects; no automatic deletion.
8. Reconfirm signup/commerce/financial processing/outbound email/analytics remain disabled. Verify the new interface distinguishes uploaded/queued from validated/approved. Record actual deployment ID, manifest hashes, migration/data checks and browser results in the Command Center. Keep formal QA Not Run until its actual acceptance procedure occurs.

Stop on any failed checkpoint. A safe operational rollback first disables only the two upload/read flags if they were enabled, retaining private files and evidence. Preserve the previous Netlify deployment for application rollback; keep additive columns/functions and new private objects for diagnosis. Do not drop columns/buckets, delete assets, relax policies or restore an older database over newer writes. Any corrective SQL outside this manifest requires new approval.

## What this scope does and does not finish

This scope restores **private draft saving and basic private uploads**. It leaves worker activation prohibited. Therefore actual content validation, waveform/preview production and completed audio submission to THE SEC remain blocked until the existing media worker/broker is separately qualified and authorized. The UI and database continue to deny review when prerequisites are missing. Local SQL lifecycle tests prove the wiring using synthetic validated evidence; they do not establish hosted processing acceptance.

There is no new subscription or spend-cap change. Storage/egress for synthetic verification consumes existing project allowances; actual usage must be checked before execution. No assumption of zero marginal cost authorizes billing changes.
