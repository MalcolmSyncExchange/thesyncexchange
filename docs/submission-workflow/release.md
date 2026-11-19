# Submit Music repair — release and verification

Base production: `6aff433d87bf5137d60ae84d`, source `3e530be5`.

## Confirmed causes

- `locked` included ordinary saving, so background draft requests disabled every field and rights control. Each save also fetched the entire workspace again.
- Tab navigation awaited the full draft/preview flush before changing the active section.
- Completeness combined genre/subgenre, key/mood and classifications into generic strings; required release year was hidden in a collapsed panel.
- “Send audio package” depended on catalog metadata prepared by another button and showed generic track-details requirements even after form completion.
- The preview overlay was pointer-transparent; its body could not be dragged after the prior seeking repair.

## Final behavior

Serialized, coalesced background saves preserve newer edits and revision fencing. Fields remain editable during ordinary saves, failures and conflict recovery. Tab navigation renders immediately; committed operations still flush before preview initiation, document reservation, catalog preparation and SEC submission. Submitted workspaces remain read-only. Network ambiguity uses existing idempotency recovery, never a blind overwrite.

Final submission flushes drafts/preview intent, verifies media readiness, prepares the owned catalog draft with all original rights checks, reads the fresh revision and invokes the existing SEC submission command. A lost submission response is reconciled through the owned review state. Nothing approves rights or publishes music.

Genre/subgenre use the existing fields; subgenre and description are optional. Existing values are retained. Censored is additive to the rich draft/catalog classification; legacy explicit=true continues to mean uncensored explicit content. Song Type keeps `vocal`, `instrumental`, `mixed` values and the existing safe submission flag mapping. The separate later catalog-review boolean sync has a pre-existing Mixed/legacy-constraint inconsistency; it is outside this release and unchanged.

Curated mood choices retain legacy tags. New custom suggestions are bounded private workspace data, excluded from catalog seeding and global discovery facets. The language dataset is the complete Library of Congress ISO 639-2 table, using 639-1 IDs where available. Native labels are precomputed from Node ICU once; server/client renders do not reconstruct hundreds of locale objects on every tab mount.

Audio versions map onto existing validated roles, private buckets and per-file 150,000,000-byte limits. Censored, acapella, extended and radio variants use labeled alternate roles. Stem components are individually labeled children of the same submission; ZIP remains unsupported. No quotas, worker images, credentials, admission, reservations or historical records are changed.

Click a preview region to seek; drag its body or a handle past the five-pixel intent threshold to move the fixed region. The independently draggable playhead stays above the region. Cancelled pointers never seek or save a new position merely because capture ended.

Noncritical media confirmations expire after 4.5 seconds without moving focus. Existing media audit events power a bounded owner-only read in the existing account notifications page; no new outbox, email sending or autosave notifications are enabled. Legal disclosures remain persistent.

## BPM bounds and limitations

Advisory on-device Worker only: PCM WAV, at most 20 seconds / 8 MiB, three-second independent worker timeout, no network or credentials. Unsupported, short, sustained or low-confidence recordings remain manual. Half/double-time alternatives are shown. Manual or restored BPM values are never overwritten; a prior automatic value may be updated for a new recording. No hosted analysis is enabled.

Synthetic virtual 45.5/100/150 MB WAV read/CPU benchmark: each read 5,292,012 bytes and detected the expected 120 BPM (60 BPM alternative), approximately 19–25 ms locally. This measures bounded analysis, not disk upload throughput or user interaction latency. Real browser input-to-paint and tab-switch latency must be measured after publication; do not claim zero latency.

## Language provenance

Source: https://www.loc.gov/standards/iso639-2/ISO-639-2_utf-8.txt
Retrieved November 19, 2026. Raw source SHA-256:
`42b71885e4dc885559fda5ad059fd81838cf4782cedb5fd08cc3431f7d067371`.
The checked-in derived JSON adds search aliases and static native labels, not new language IDs.

## Production SQL and preservation

Apply only `20261119193818_submission_workflow_repair.sql` after exact founder approval. It patches the installed function bodies to preserve the independently retained production rights validation. Missing expected inventory/store anchors abort. Existing function owners/ACLs, table data, holds and accounting are retained. New owner-only notice RPC explicitly denies PUBLIC, anon and service-role execution. Local tests cover idempotency, owner/CAS denial, role boundaries, unchanged grants/history, optional fields, Censored, Mixed and pending SEC review without publication.

Before application, compare the three modified installed routines with `production-function-baseline.json`. The preparation and submit routines are recorded but not replaced. Stop for unexpected drift. After application verify function bodies, ACLs and private bucket limits, then publish only the tested main-branch build.

`npm run verify:supabase` cannot run in the isolated worktree without its unprovided service-role environment. Do not retrieve a broad credential merely for this check. Equivalent authorized MCP reads confirmed private source (150 MB), derived (4 MB), and rights-evidence (3 MB) buckets and the relevant production contracts.

## Rollback

Retain compatibility commit `83fcb091` and the migration when reverting the UI. Never revert stored data, custom suggestions, Censored values or audit/accounting history. The compatibility-only prior UI at `83fcb091` passed typecheck and a complete production build with synthetic CI configuration; preserve its extended draft/catalog readers and Censored catalog option. The initial external dependency symlink was rejected by Turbopack; a local cloned dependency directory resolved that build-only limitation. Its prior optional-field UX may still require fix-forward refinement, but extended saved values remain readable. New RPC may remain installed but unused; it grants no additional table access. Fix forward/revert the UI through a feature PR and a production-context build; never publish an unverified source tree.

## Financial gate and production test plan

Read-only November observation at 2026-11-19 20:04:45 UTC: 68 retained reservations total $6.80; $12 host reserve + $1 setup carry-forward + measured traffic/logs project $19.898982 of $20. Remaining modeled headroom $0.101018. Historical Google liabilities remain `UNKNOWN_PRESERVED_NOT_OFFSET`; Clean Media Recovery remains HOLD. No financial control is changed by this release.

A new main requires three $0.10 reservations, and an alternate requires another. A fresh four-stage hosted test is NOT financially authorized within current headroom. Do not enqueue that work, release old reservations, extend windows or raise the ceiling. Reuse existing ready synthetic submission `c8ec49c4-8b05-4a5f-8a3d-f6fc64b9ada8` for metadata, preview acceptance and SEC review if still eligible. Recheck fresh admission/accounting before any additional processing; insufficient headroom remains a production test limitation requiring a separate founder decision.

After required CI, exact merge and SQL approvals: publish via the TSE Chrome profile (`malcolm@thesyncexchange.com`). Test responsive typing during saves, rapid navigation, field-specific errors, searchable controls, body/playhead/handle gestures, refresh and network recovery. Use synthetic records labeled **TSE SYNTHETIC QA — NOT FOR LICENSING**. Confirm the owned pending review appears for SEC, all audio stays private, and no automatic publication occurs.

Cleanup must preserve the review/audit record: existing controls prohibit deleting submitted or referenced music. Do not bypass them or delete historical jobs. Any retained synthetic review must remain clearly labeled; use the existing authorized SEC rejection/archive workflow when available.

## Local validation

- Full unit suite: 2,132/2,132 passed.
- Security suite: 300/300 passed.
- Integration suite: 41/41 passed.
- Typecheck and production build passed. ESLint: zero errors, one pre-existing React Hook Form warning in `submit-music-form.tsx`.
- Migration manifest: 83 hashed migrations verified; `git diff --check` passed.
- PGlite SQL rehearsal covered forward/idempotent migration, authorization, retained history and SEC pending state. This is local evidence, not hosted processing or production browser acceptance.
- Exact migration SHA-256: `895ae367a28616ac2fb6376b77ff0e70e1d58d95177ea4bcd6407b23aa578ffd`.
