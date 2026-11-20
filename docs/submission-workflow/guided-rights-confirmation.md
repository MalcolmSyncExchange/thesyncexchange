# Guided rights and submission confirmation

Baseline: production `6b008eb0effa36bf5031d9c3`, main `51a2c872`.

## Scope

Five progressively disclosed areas preserve the structured master/publishing owners, authority, sample declarations and clearance, claims/disputes, agreements, private document references, historical notes, warranties and licensing preferences. Ownership questionnaire answers persist as optional bounded fields. Old rows without answers remain valid. Explicit choices initialize empty owner lists only; they never rewrite an existing owner or percentage. Each category uses exact basis-point totals and separate field-level validation. New sole/shared answers must agree with the declared rows before completion.

Owner emails are private, optional preparatory contact details while invitation delivery is inactive. Production read-only inspection confirmed `rights_private.owner_invitations` is not installed. This release neither activates invitations nor claims notification, email delivery, recipient verification or ownership acceptance. No owner is shown as verified by entering an email. Independent SEC/rights review remains mandatory. Activating the separate invitation and confirmation-gating workflow requires its completed, tested implementation and exact production authorization; no payout or commission code is changed here.

## Confirmed submission

`/artist/submit/confirmation?submission=<uuid>` requires the canonical Artist session and the existing owner-scoped upload read. The submitted track ID, current review state and original review creation timestamp come from that record, not query-string claims. Pending, approved and rejected audio reviews have distinct copy; none implies publication or final licensing authority. Drafts, foreign IDs and missing records cannot display success. Temporary read failures display a specific status-recovery page rather than an editable submission form or invented success.

Successful POST acceptance navigates immediately using the returned review identity. A synchronous in-flight guard prevents double-click submission. The existing durable operation key is retained for ambiguous responses; an owner-scoped read recovers confirmed acceptance. Revisiting the original pending draft redirects to its receipt. `View My Track` links to the exact server-owned track in catalog management; `Submit Another Track` opens the upload-first screen without creating a draft on GET.

## Migration, preservation and rollback

`20261120185517_guided_rights_submission_confirmation.sql` adds no tables, grants, policies or historical-row updates. It patches installed function bodies to permit bounded optional owner emails and questionnaire answers and returns the review's authoritative creation time. All other ownership, share, authority, evidence, revision and role checks remain. Existing private media, financial reservations, $35 allowance, spend cap, worker isolation and Google Cloud HOLD are unchanged.

Exact SQL and main-merge approval are required before production. Apply approved SQL before publishing the application. If UI rollback is needed, build a source revert of the guided components/receipt navigation while retaining the optional questionnaire/email contract and stricter SQL. A pre-change application alone will reject new questionnaire fields safely; it must not be deployed as an unverified rollback that could strand editing. No legal records, owner contacts, evidence, reservations or review events should be deleted or rewritten. Existing submitted records continue to be readable through the unchanged owner-scoped media API.

## Verification

Synthetic tests cover all three ownership answers, preserved existing splits, independent totals, exact missing fields, bounded contact persistence, declarations/documents, authenticated receipts, authoritative timestamps, duplicate operation replay and pending SEC state without publication. Test fixtures restore retained production rights functions before applying the new migration, then reapply the existing optional-tempo and preview gates. Native hosted invitation delivery is not tested or represented as active. No real owner invitations are sent during testing.

### Verified rollback candidate

A local compatibility build from production commit `51a2c8729c2bea7951aa57955a39e644382cf5f2` passed. Apply `rollback/guided-rights-compatibility.patch` only in a clean isolated checkout of that base, install its locked dependencies and build it in the approved production context. The patch retains the optional questionnaire/email contract and supplies plain compatibility inputs in the prior rights editor. Patch SHA-256: `5a040ad2472791ef5a41916f452c97fd2030f3474322cd366d76124cb6695a1e`. A rollback must be a reviewed source change on the production branch; do not force-push or replay an old unverified deployment. Keep the new database validation and historical rows intact.

Local release validation: 2,159 full-suite unit tests, 300 security tests and 42 audio integration tests passed. Ten focused guided-rights/confirmation tests passed, including additional temporary-status recovery and idempotent migration preservation checks. Typecheck, lint and production candidate/rollback builds passed; lint retains the pre-existing React Hook Form incompatible-library warning. Required GitHub CI must pass on the exact approved release head before merging.
