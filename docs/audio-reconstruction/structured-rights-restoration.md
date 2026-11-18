# Structured rights production compatibility restoration

Continues `deef1e85`. This restores the production contract; it does not simplify
it or replace structured declarations with old notes.

- Separate master and publishing owner rows with exact decimal share checks.
- Complete representative authority, sample use/locations/clearance, claims and
  disputes, existing agreements, retained free-text notes and document references.
- Incomplete private drafts remain savable. Review completeness remains separate
  and is independently enforced by the existing production database functions.
- Unknown saved fields cause a safe editing stop, never silent replacement with
  empty metadata. Draft revisions, interrupted-save recovery and pending review
  locks remain in place.
- Private PDF reservations use existing submission-bound RPCs. Uploads validate
  canonical Artist ownership, rate limits, 3 MB bounds and existing PDF content
  rules before privileged access. Create-only transfers reconcile lost responses
  by SHA-256; downloads recheck authority/version, audit outcomes and use
  attachment + sandbox + no-store. No public document URLs are emitted.
- MFA-admin media review displays the same structured fields read-only, with
  independently authorized private downloads.

Local tests restore the two retained historical rights DDL files only inside the
fixture. They are not pending production migrations. Current captured production
function definitions are applied in the target fixture rather than assumed to
match historical bodies. No production rights/schema/policy changes are needed.

Validation: retained structured-rights tests, document API security tests,
artist workspace tests, target migration/rollback tests and the former blocker
probe now pass. The rich round-trip test loads, edits, saves, reopens, submits,
rejects and resubmits a synthetic package with ownership, sample/claim/agreement
fields and a private document reference intact. Pending-review writes remain
rejected. Existing canonical post-submission edit locks are not relaxed.

Full regression initially passed 1,984 of 1,995 checks, with all 11 failures in
one API test harness missing the new rights-schema dependency. After correcting
that harness, all 11 affected checks passed. Typecheck, focused lint and local
Next production build passed. This is local compatibility evidence, not a hosted
upload or a production deployment. DigitalOcean admission remains a separate gate.
