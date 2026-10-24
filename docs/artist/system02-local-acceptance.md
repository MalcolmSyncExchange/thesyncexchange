# System 02 — Artist Onboarding local acceptance

Baseline: System 01 `b87e943f6e2d5c7245b31149107bf0cce0150ff6`, descending from application candidate `3c5a5a1bcd0bba820776ff40032569d50d1e706f`. Branch: `codex/system02-artist-onboarding`. Local implementation only. System 03 has not started.

## Existing implementation retained

Canonical Artist signup/confirmation/role assignment, the five existing onboarding stages, required public profile validation, normalized profile images, atomic compare-and-set saves, final completion fencing, and the existing Artist Desk, finance, submission handoff and account-security routes were preserved. No licensing, checkout, finance, PostHog or media capabilities were activated.

The baseline had no private onboarding identity/declaration model, account acknowledgment evidence, completed-profile editor or artist-profile Buyer Preview. Canonical public values could also be shadowed by older onboarding payload values. Payout contact was unnecessarily required during account setup.

## Completed implementation

- Private representative legal name, individual/company choice, relevant business name, country and contact email. No tax identifiers, identity documents, street addresses, dates of birth or banking credentials are collected.
- Separate master and composition/publishing declarations, including shared, represented, uncontrolled and unknown rights; bounded collaborator names/roles. These are preparation statements, never rights verification or permission to license.
- Explicit, versioned account acknowledgment with exact notice, legal-document paths/versions/source hashes and server acceptance time. Evidence is append-only; version reuse with different contents fails closed. Terms remain visibly draft; this is not counsel approval or purchase-specific acceptance.
- Completed-profile editor for public presentation, private preparation, links, internal preferences, and image replacement/removal. Saves derive the actor from canonical authenticated role, validate server-side, lock/version the canonical profile, and atomically record profile/private/audit writes.
- Save-and-pause, resumed progress, clear review/completion indicators and canonical Artist Desk navigation. Existing completed accounts remain completed; legacy in-progress accounts must supply the new private details and acknowledgment before final completion. Editing completed legacy accounts requires those fields as well.
- Public profile reads take precedence over stale onboarding payloads. Explicitly cleared links stay cleared. Profile image handling preserves the original conservative behavior after uncertain commits; a failed response never justifies deleting an image that might be active.
- Owner-only Buyer Preview uses an explicit public projection and public-only database read. Navigation from the private editor uses a fresh document, avoiding retained private editor HTML. The client workspace shell receives only the account display name, rather than the full session/onboarding payload. Buyer Preview does not publish a directory listing.
- Stable country labels eliminate server/browser locale hydration differences. Provider diagnostics are replaced with bounded recovery guidance. Existing unused legacy account deletion remains possible; public-presentation audit UUIDs remain stable without a new deletion-blocking foreign key.

## Database and authorization

One additive migration: `supabase/migrations/20261024032018_system02_artist_account.sql`, migration 55 after the 54-migration System 01 chain. Prior migration files are unchanged.

New public tables: `artist_account_details`, `artist_account_acceptances`, `artist_account_events`; private immutable notice registry: `security_private.artist_onboarding_notices`. Authenticated reads require the owning canonical Artist or the existing canonical Admin/AAL2/active-session check. Ordinary authenticated/anonymous callers cannot write these tables, invoke private validators, or execute the new mutation RPC.

New service-only invoker RPC: `save_artist_account_step`. Existing final-completion RPC additionally checks private identity, separate declarations and current acknowledgment for accounts that are not already completed. The original atomic save implementation and stage rules remain in use. A narrow empty-search-path presentation audit trigger records owned public edits and advances the canonical version so stale forms cannot overwrite them. Acceptance, audit and notice update/delete are denied even to the ordinary service workflow.

Private prepared accounts and acceptances deliberately restrict account deletion pending a separately reviewed retention/erasure procedure; presentation-only audit records do not block deletion of unused legacy accounts. No account-deletion interface, retention duration, legal hold policy or privileged erasure bypass is invented by this package. Review retention, minimization, access, backups and lawful erasure before external personal data is collected.

No bucket or hosted Storage configuration changes. Existing public avatar storage contains intentionally public, decoded/re-encoded profile images only. Private identity/contact/collaborator details are never stored in avatars or the demo filesystem.

## Local validation (2026-10-23 America/Phoenix)

| Command | Verified result |
| --- | --- |
| `npm run test:unit` | 1,469 passed; zero failures/skips |
| `npm run test:artist-onboarding` | 72 passed; zero failures/skips |
| `npm run test:auth` | 114 passed |
| `npm run test:security-pr2` | 300 passed; existing unused-account deletion regression preserved |
| `npm run test:artist-security:gate` | 5 passed |
| `npm run test:release-replay` | Native PostgreSQL 17.11: 55 exact migrations; two-session Artist row-lock/CAS race, injected audit failure/rollback and cross-role private RLS checks passed; System 01 assurance checks retained |
| `npm run test:artist-onboarding:browser` | 9 Chromium journey groups passed, production Next/Supabase SDK, actual local migration SQL/RLS with synthetic loopback Auth/Storage; zero browser runtime errors |
| `npm run test:auth:browser` | All 8 existing System 01 Chromium journey groups passed; zero runtime errors |
| `npm run build`, `npm run typecheck`, `npm run lint`, `git diff --check` | Passed; lint has zero errors and the one pre-existing React Hook Form warning in `components/forms/submit-music-form.tsx:178` |

Counts overlap; they must not be added as independent coverage. Browser fixtures use generated synthetic images/identities, strip inherited application configuration and block non-loopback browser traffic. They do not prove actual hosted GoTrue/PostgREST/Storage behavior. The new local SQL adapter models only the exercised endpoints; it is not a provider emulator or managed-Storage qualification.

Browser evidence covers new signup and intentional confirmation; failure before save; loss of response after committed image/profile; new-session resume; save-and-pause; missing acknowledgment; separate declarations; completion; post-completion edits; complete preview HTML privacy; stale competing tabs; invalid/removable images; and Buyer/anonymous denial. Screenshots at 1440px/390px were inspected. Firefox/WebKit executables are unavailable locally. Real-device, screen-reader, keyboard and formal acceptance remain Not Run.

Earlier qualification attempts exposed and corrected the misplaced Server Action directive, synthetic transport encoding/selectors, JSX escaping, audit deletion regression, retained private editor HTML, and country-label hydration mismatch. Final passes above reflect the corrected code; early failures are not hidden or counted as acceptance.

## Hosted-only dependencies and rollout boundary

1. Separate founder authorization before isolated hosted migrations/deployment. Apply System 01 before this additive migration and before publishing the dependent UI; verify actual helper ownership, service grants, private-table RLS, MFA Admin canaries, clean replay and existing-account upgrade behavior. Never modify shared infrastructure under this package.
2. Verify actual email/confirmation/session behavior, private profile APIs, avatar upload/replacement/cleanup and uncertain-request recovery over TLS. Existing managed Storage authority and native media qualification remain separate unresolved platform gates.
3. Counsel/founder approval of actual onboarding legal text, Rightsholder Terms and privacy/retention practices. Current draft Terms cannot establish commercial readiness. Register a new immutable notice version when approved documents change; do not rewrite old acceptances.
4. Independent security review; Firefox/Safari and physical mobile/accessibility acceptance; existing formal QA-017/QA-023 and the remaining release matrix. All 25 formal QA scenarios remain Not Run. No Private Beta or hosted-integration GO decision is inferred.
5. Roll back through a reviewed forward compatibility correction or restore the isolated rehearsal target. Preserve private details/acceptances/audit evidence; do not drop them or weaken the completion guard to accommodate older UI. Reverting UI alone can strand incomplete accounts because the old form cannot collect new required preparation fields.

## Preservation and operating record

The original workspace HEAD, complete dirty status and all 25 dirty tracked-file hashes were unchanged. System 01 remains clean at its accepted commit. No push, merge, deployment, hosted migration, real transaction, shared configuration or Phase A execution occurred.

The Beta Command Center records this package as local engineering completion with supporting automated evidence; hosted verification and formal acceptance remain open. Existing IDs, formulas, charts, historical records and all 53 platform qualification stage records are preserved. The full first-time buyer/catalog/submission and release tasks are not declared complete by Artist Onboarding evidence.

Evidence is local-only in the initiating workspace at `output/system02-artist-onboarding-2026-10-23/`, including test logs, browser JSON/screenshots and preservation checks. The exact local commit is supplied by the completion report and Command Center (the report itself belongs to that commit).

## Exact task file inventory

- `app/(app)/artist/dashboard/page.tsx`
- `app/(app)/artist/layout.tsx`
- `app/(app)/artist/profile/page.tsx`
- `app/(app)/artist/profile/preview/page.tsx`
- `app/onboarding/artist/page.tsx`
- `components/artist/artist-workspace-shell.tsx`
- `components/artist/profile/artist-account-fields.tsx`
- `components/artist/profile/artist-profile-editor.tsx`
- `components/forms/onboarding-forms.tsx`
- `docs/artist/system02-local-acceptance.md`
- `lib/artist/account-contract.ts`
- `lib/artist/onboarding-notice.json`
- `lib/validation/onboarding.ts`
- `package.json`
- `scripts/test-artist-onboarding-browser.mjs`
- `services/artist/account.ts`
- `services/auth/actions.ts`
- `services/auth/onboarding.ts`
- `supabase/migrations/20261024032018_system02_artist_account.sql`
- `tests/artist-account-actions.test.mjs`
- `tests/artist-account-system.test.mjs`
- `tests/artist-onboarding-atomic.test.mjs`
- `tests/artist-onboarding-reliability.test.mjs`
- `tests/avatar-consistency.test.mjs`
- `tests/helpers/artist-onboarding-provider-fixture.mjs`
- `tests/helpers/auth-provider-fixture.mjs`
- `tests/helpers/auth-system-harness.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `types/database.ts`
