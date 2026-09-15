# Artist Desk PR 2 — security and baseline reconciliation

## Status and scope

Repository implementation and isolated verification are complete. **Live remediation is not deployed or verified.** No organizations, invitations, shared ownership, future capabilities/payees, new verification architecture, or Artist Desk UI were introduced. Existing ownership columns remain.

Working branch: `codex/artist-desk-security-baseline`, isolated at `/private/tmp/sync-artist-desk-pr2`, based on approved baseline commit `35062fb`. The original working directory and unrelated analytics changes were not edited/staged. Phase 0/1 was committed locally but not published; this PR therefore also carries its approved baseline commit above `main`.

## A. Security fixes

- **Self-verification and finance mass assignment:** authenticated profile grants now explicitly allow normal profile columns, excluding verification writes and payout reads/writes. A database trigger also rejects protected identity/verification/payout changes. Server onboarding builds an explicit profile payload, retaining verification from trusted persisted state only.
- **Reviewed rights:** direct owner INSERT/UPDATE/DELETE cannot change reviewed rights, including after archive/pending transitions or cross-track reparenting. Both parents are locked in deterministic order. Draft public credit edits work; approval/account-link changes require the trusted workflow. Admin/service paths remain available.
- **Referenced media:** restrictive RLS plus an all-role Storage version/path trigger prevent overwrite, re-creation or deletion of referenced media. Uploading to a new path and submitting changes remains supported. Historical broad policies are explicitly retired.
- **Avatar path substitution:** replacement/failure cleanup now authenticates the caller, checks the canonical artist role and a strict own-avatar path, then deletes with the user's RLS client. A user-edited avatar path cannot authorize service-role deletion of another user's object.
- **Buyer disclosure:** approved public views and explicit DTOs replace private track-row access. Full-audio paths, owner auth IDs, moderation fields and rights review/contact fields never enter buyer catalog responses. Order responses omit artifact paths, webhook metadata and raw internal errors; safe readiness/failure/checkout signals preserve buyer workflow.
- **Finance separation:** ordinary workspace profile queries select only non-finance columns and return a separate type. An own-artist finance RPC and loader require fresh session/role/scope authorization. Duplicate payout contact is moved out of generic onboarding payloads by the planned migration; no entity/payee is inferred.
- **Privileged ordering:** admin actions/loaders, buyer private loaders, checkout, agreement delivery and artist scope queries enforce identity/role/scope before sensitive retrieval. Track queries include the authenticated owner predicate; the atomic mutation rechecks under lock.

## B. Original five gates

`tests/artist-security-gate.test.mjs` is byte-for-byte unchanged from the approved baseline.

| Original unauthorized behavior | Before | After, current SQL/code |
|---|---|---|
| General profile writer self-verifies | Failed gate | Denied; pass |
| General artist writer changes reviewed rights | Failed gate | Denied; pass |
| Buyer retrieves full-audio path from base tracks | Failed gate | No visible private rows; pass |
| General profile SELECT includes payout contact | Failed gate | Permission denied; pass |
| Admin action reads privileged context before role check | Failed gate | Authorization first; pass |

**5 failing → 0 failing**, without skipping or weakening those assertions. Historical characterization tests explicitly replay only the pre-PR2 chain; current gates always replay the full current chain. This preserves before/after evidence instead of pretending historical live snapshots already contain the fix.

## C. Storage reconciliation

See the [complete CRUD matrix](storage.md). Canonical state has five object policies: three restrictive media policies and two narrow avatar cleanup policies. Public delivery covers avatars/artwork/previews/waveforms. Full audio and agreements remain private and server-authorized. No buyer full-audio entitlement was introduced.

Production currently has zero object policies; staging has the three restrictive media policies. This is not evidence that private buckets are public: absent permissive policies deny normal Storage CRUD. The missing guards still matter because service operations bypass RLS. The old 12 owner-wide policies are intentionally **not** restored. Three forward migrations and compatible app deployment remain required.

## D. Staging reconciliation

The read-only captures at `live-before/` reconfirm production/staging metadata at approximately 22:48 UTC on 2026-09-15. No customer rows were exported.

- `guard_reviewed_rights`: canonicalized with additional protection for draft approval/account-link fields. Uses both parent IDs and review history, preventing archive/reparent bypasses.
- `track_asset_object_names` / `is_referenced_track_asset`: retained the staging alias handling and conservative cross-bucket match to support legacy URLs and configured aliases.
- `guard_referenced_media_version` + three restrictive policies: canonicalized, including service-role/signed-upload protection while permitting access metadata updates.
- Compatibility: artist edits use the trusted review workflow; new assets use new object paths; narrow avatar cleanup is explicitly authorized. Hosted signed-upload behavior must still be verified in staging.

The source existed on the separate `codex/security-scan-remediation` branch, not the deployed/main baseline. Existing [GitHub PR #18](https://github.com/MalcolmSyncExchange/thesyncexchange/pull/18) overlaps these changes. Coordinate the two PRs before merging; do not merge overlapping migration histories blindly. This PR does not close, merge or modify that PR.

`production-drift.json` and `staging-drift.json` compare the refreshed exports with the full proposed canonical replay. Their nonzero results are expected while this PR is unapplied. Staging's user-profile constraint/index names differ from production despite equivalent keys; retain that distinction instead of silently rewriting them.

## E. Buyer contract

Catalog DTO: track ID, stable public artist-profile ID/name, title/slug/description, genre/subgenre/moods, tempo/key/duration, vocal/instrumental/explicit/lyrics/release metadata, public artwork/preview/waveform paths/URLs, approved catalog status/featured placement, catalog timestamps, public credit name/role/share, explicit active license descriptions/prices/terms and favorite state.

Excluded: artist auth-user ID; full audio path; approver/timestamps/internal review state; payout/legal/tax/business/team fields; private rights email/user link/review state/evidence. No new trust badge is inferred from the existing single artist verification enum.

Buyer order DTO exposes own order identifiers, purchased track/license summary, amount/currency/lifecycle timestamps, safe generated/ready/failed/blocked flags, agreement number and the authorized agreement route. It omits storage paths, payment-intent details, webhook metadata, raw generation diagnostics and arbitrary row additions. Buyer serialization tests inject private fields and assert their absence in actual returned JSON.

## F. Field classes

| Class | Current enforcement |
|---|---|
| Artist-editable public profile | Name, bio, location, website/social/music links; explicit columns and owner RLS |
| Private business-editable | Existing licensing preference stays owner/private; no fabricated legal/entity record added |
| Finance workflow | Existing payout contact through separate own-artist finance loader/RPC; trusted onboarding write; no automatic future manager permission |
| Rights workflow | Draft credit edits allowed; review/account-link fields controlled; reviewed changes go through atomic track edit/resubmission |
| System/admin | Verification state, track approval/featured state and legacy owner IDs protected by grants/triggers/server allowlists |

Platform-admin service workflows remain trusted. This is not the future organization-manager/Finance capability system. Artist verification still does not verify track ownership.

## G. Privileged access

Changed paths: `services/admin/actions.ts` (status/order/featured/retry ordering), all privileged query creation sites in `services/admin/queries.ts`, `services/artist/queries.ts`, new artist finance loader, buyer catalog/favorites/orders/single-order loaders, checkout API, agreement delivery, and artist role/track ownership lookup.

Authorization-only reads use the authenticated SSR client: canonical user role, minimal order ID/owner, or an owner-filtered track. They do not retrieve artifact/license data first. Foreign agreement IDs continue to return 403; checkout returns 404. Failed authorization does not instantiate the privileged client in tested paths.

Trusted exceptions: verified Stripe webhook processing and agreement generation jobs need service access after signature/payment validation; internal signed-artifact helpers are called only after authorized order scope or trusted fulfillment. Catalog transport now uses RLS views rather than service access. Supabase Auth bootstrap writes require trusted role creation but never accept an elevated client-supplied application role.

## H. Retired bootstrap paths

Active advice was removed from README, Supabase finalization/deployment/happy-path/license docs, Storage setup/plan, create-admin/QA seed/Storage setup/diagnostic scripts, and readiness output. All now point to [canonical preflight](deployment.md).

Historical SQL remains byte-for-byte unchanged. `supabase/manual-apply.md` retains its top-level RETIRED warning and historical instructions; `supabase/manual-apply/README.md` adds an adjacent warning. `supabase/storage-plan.md` warns that the standalone Storage SQL is historical. Remaining references are only historical docs, immutable captures/provenance and regression tests; see `retired-references.txt` for the exact repository search results. No active script recommends running the old bundle.

## I. Migration history

See [deployment and reconciliation procedure](deployment.md). Production's one-entry ledger is not repaired. A 24-file SHA-256 manifest, isolated full replay, schema/policy/column/RPC checks, refreshed catalog exports, before/after drift reports and CI gates establish the expected state.

New forward migrations may be applied only through an approved explicit procedure after live drift review. A later ledger/checkpoint operation must independently verify effects, handle duplicate historical `0006` versions, preserve evidence, and distinguish intentional supersession. Never mark historical migrations applied merely to silence tooling.

## J. Transactions and audit retention

`update_artist_track_atomic` makes parent edits, rights replacement, license-option replacement and the required detailed audit record one database transaction. It is service-only, rechecks canonical actor/ownership, locks the row, rejects stale `updated_at`, limits fields/status and derives approval from the verified actor's email. Injected audit failure rolls the whole operation back. Disabling a license type does not block an unrelated artist edit and cannot reactivate that buyer option.

Rights INSERT/UPDATE/DELETE additionally write before/after audit evidence in the same SQL operation. Direct authenticated UPDATE/DELETE/TRUNCATE of track audit history is revoked, including for platform-admin application users.

**Blocking work before team editing:** complete transactional creation and admin moderation/audit operations, explicit actor attribution for every privileged correction, concurrency/version handling across every write path, immutable rights/ownership history independent of parent-delete cascades, and reference-safe media lifecycle/concurrency validation. Current single-user creation retains its compensation cleanup; it cannot expose a partially constructed track as approved.

**Legacy deletion is unchanged:** deleting an unsold artist account cascades profiles/tracks/rights/track-audit rows; deleting an artist with sold tracks is FK-blocked; buyer deletion cascades orders/licenses/activity. Direct audit-table grants are append-only, but cascade-independent retention is **not yet solved**. Do not enable team revocation/ownership transfer or treat account deletion as access revocation. Regression tests keep this limitation visible.

## K. Validation

See `validation.md` for final exact commands/counts and build/environment limits. Tests run against isolated PostgreSQL and mocked external transport boundaries, not real user accounts or live payments. The independent review's no-JWT migration, disabled-license and hidden-agreement-failure cases have focused regressions.

## L. Exact files

See `files-changed.txt` for PR2-only changes against `35062fb`. The final Git delivery report separately identifies commit hashes and the approved Phase0/1 parent carried in the PR.

## M. Live changes

- Staging Supabase: read-only metadata queries/listing only; **no mutation**.
- Production Supabase: read-only metadata queries/listing only; **no mutation**.
- Storage: **no bucket, policy, object or file mutation** in any live project.
- Netlify: **no configuration or production deployment**. GitHub publication may trigger the repository's normal feature Deploy Preview; it does not apply these migrations.
- Stripe: **no API, payment, key, webhook or configuration changes**.
- Migration ledger: **unchanged**.

## N. Proposed PR 3 — approval required, not started

After PR2 staging verification and controlled production rollout, add the minimal non-destructive ownership/access schema: person-or-organization primary controller, independent revocable artist grants, explicit profile/catalog/finance capabilities, and stable artist/catalog associations alongside legacy owner columns. Enforce preservation of tracks/rights/orders/licenses/payout/audit history on revocation; protect transfer/dispute workflows; specify an explicit payee contract without inferring legal identity. Maintain separate identity, representation, payout-readiness and track-rights states and a buyer-safe projection.

Before enabling shared editors, close the transaction/audit-retention/deletion blockers above. Backfill mappings in a separately reviewed reversible operation, add cross-organization/artist and capability regression tests, and retain the existing UI until schema/security verification is complete. No PR3 code was started.
