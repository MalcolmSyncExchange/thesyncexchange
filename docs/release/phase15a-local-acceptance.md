# Phase 15A — final local integration qualification

Branch: `codex/final-integrated-alpha`. Implementation candidate: `ffc11503922f52cfd498b0c26bcba5bdf4e592ca`. Baseline: `f730174e5ce20d12c3f09a7e9281d582ec4ebdcb`. Acceptance documentation is committed after qualification; the final HEAD retains exactly this application source.

All14 completed systems coexist in this isolated candidate. The source history is already cumulative: no merges or cherry-picks were needed. [Exact14-source inventory](phase15a-source-inventory.md). Original independent-review commits `fd6ef37`/`6bea154` remain ancestors. All67 original migrations are unchanged; no migration or hosted SQL was added/applied.

## Focused integration changes

- Connected the previously uninvoked transactional email batch through `POST /api/internal/notifications/worker` and an explicit one-shot CLI. Dedicated constant-time bearer check precedes worker/service access; missing, forged, cookie-only and reused financial credentials are denied. Default delivery remains disabled. The endpoint takes no body/recipient/limit input, processes at most10, exposes only counters and returns sanitized private/no-store failures. No scheduler or real email was enabled.
- Added shared PGlite/native lifecycle cases joining approved source, rights and catalog with original acceptance, TEST payment evidence, agreement, manifest-scoped delivery, ledger and SEC. Unpaid/failed purchase, duplicate financial effect, cross-account denial, refund/dispute hold and notification/analytics recovery preserve original evidence.
- Corrected the accounting test fixture's UTC JavaScript date versus database calendar mismatch. The native cluster now explicitly uses UTC, matching all three observed hosted databases. Opposing-zone fixtures derive their due dates from each database calendar. No payout permission, financial journal or due-date guard was weakened.

## Verified local validation

| Command/suite | Result |
|---|---|
| Fresh `npm ci --ignore-scripts --no-fund` | Exact locked install;0 vulnerabilities |
| `npm run test:unit -- --test-concurrency=8` | 1,909 passed;0 failed/skipped |
| `npm run test:alpha-integration` | 11 focused checks passed (included in unit total) |
| `npm run test:alpha-integration:native` | 93 passed;0 failed/skipped, including five shared lifecycle/calendar cases and all preserved System14 native guards |
| `npm run test:security-pr2` | 300 passed |
| `npm run test:artist-security:gate` | 5 passed |
| `npm run test:release-replay` | All67 ordered migrations replayed into a clean native database |
| All13 system Chromium suites | 129 journey groups passed;0 runtime errors |
| SEC intelligence + financial chart suites | Both passed |
| Typecheck / lint / production build / diff check | Passed;one inherited React Hook Form compiler warning |
| Fresh `npm audit --json` | Zero vulnerabilities |

Native environment: Darwin ARM64, Node24.14.1, PostgreSQL17.11, real SHA-256 extension, distinct Auth/Storage ownership and Supautils SHA-256 `ad18bd34a2f76a9b586484e35f41d591b19c07c7fbaef9ed140cc4d5e8ac94b7`; disposable Unix sockets and no hosted DSN. This is not Linux AMD64 evidence. Browser/provider/SMTP transports are synthetic loopback fixtures. The shared database journey does not claim one hosted end-to-end human acceptance run.

All six System14 remediations remain covered by the full unit/security/native regressions: null-role Admin denial; active sessions at media RPC, table RLS and private-finance boundaries; upload scope normalization defense; exact Buyer-to-Stripe binding. New adapter tests cover unauthorized invocation, dormant default, body denial, bounded processing, safe projection/error handling and one-shot URL/redirect controls. No known critical integration authorization bypass was confirmed in this qualification; this is not an independent whole-repository security certification.

## Failures and remaining reliability risk

The first native run passed90/91 and failed an accounting interruption scenario. Diagnostic replay exposed `Due scheduled reservation required`: the fixture chose a UTC date after midnight while the host-native database calendar was still the prior day. An aborted transaction then masked the original error during role cleanup. The corrected native run passes93/93. Initial new integration fixtures also attempted to overwrite an immutable manifest and omitted canonical failed-payment identifiers; those fixtures were corrected to create a new offer revision and honor the existing payment identity contract. Application safeguards were retained.

**P15A-R01 — Medium reliability, open:** changing a database session's timezone mid-workflow can change recomputed source fingerprints and cause a false rights/legal hold, including payout preparation. Reproduction is retained in `focused-debug-timezone.log`. Consistent UTC operation is the Alpha mitigation, confirmed as the current hosted database setting, not a canonicalization code fix. Configure database/PostgREST/worker sessions consistently and test this on the selected target. Canonical serialization and historical compatibility remain required before Private Beta. Do not rewrite snapshots, relax source checks or treat the rejected claim as a verified purchase.

## Hosted readiness and stage decision

[Minimum hosted Alpha checklist, exact deployment gaps, configuration, costs and rollback](phase15a-hosted-alpha-checklist.md).

Production remains the older `2d56691` deployment; PostHog staging does not disclose a source SHA; security staging-2 is `9ba69b5`. Their database ledgers record11/40/22 entries respectively, with no System14 session policies. Those ledger counts are not directly interchangeable with the67 source files. The current candidate must not be deployed against any of them without a validated isolated upgrade, owner/Storage authority checks and explicit target authorization.

Prefer existing security resources only after exclusive Alpha reservation is confirmed. Media broker source is pinned to that exact security project. Credentials, native Linux media, broker/TLS, isolated Stripe/SMTP, recovery configuration and operator recovery remain real hosted prerequisites. Full commercial agreements/prices/real rights/payee/tax/payout approvals belong to the real-money stage and do not block synthetic founder Alpha. No additional qualification repository or custom evidence-custody project is required.

Expected incremental low-volume cost: planning allowance$0–40/month with existing Pro resources; proposed separately approved ceiling$50. Actual quotas/account bills/budgets are unverified. No infrastructure spend, transactions or sends were initiated.

Command Center reconciliation verified:211 target cells matched;no unexpected other value, validation or chip changes. Engineering row47, P15A-R01 in Security row24,22 Blueprint rows868–889, six System14 retest annotations and supporting QA/Master/Risk notes updated. All212 stage cells for53 historical qualification records, Founder Actions QUERY and existing dashboard/gate/history values were preserved. Four chart IDs/titles matched; no chart requests were sent. The connector does not expose full chart definitions and native Google rendering was unavailable; no rendered or full-spec comparison is claimed. All25 formal QA remain Not Run. Phase15A is locally complete. This does not approve Phase15B, hosted Alpha acceptance, Private Beta or commerce. **Deployment NO-GO until founder approves the exact isolated targets and the checklist's technical gates are satisfied.** Stop after Phase15A.

## Exact changed-file inventory

- `app/api/internal/notifications/worker/route.ts`
- `lib/notifications/worker.ts`
- `package.json`
- `scripts/notifications/worker.mjs`
- `scripts/test-final-alpha-native.mjs`
- `scripts/test-notifications-native.mjs`
- `tests/final-integrated-alpha-native.test.mjs`
- `tests/final-integrated-alpha.test.mjs`
- `tests/helpers/accounting-fixture.mjs`
- `tests/helpers/final-alpha-cases.mjs`
- `tests/notification-worker-route.test.mjs`

Acceptance documents: this report, `phase15a-source-inventory.md`, `phase15a-hosted-alpha-checklist.md`. `implementation-commit.json` records exact staged files and `git show --stat --oneline`. Evidence is in `output/phase15a-final-integration-2026-10-24/`: final/first-run logs, hosted read-only metadata, ordered migration hashes, source commits, browser results and preservation proof. Generated outputs, credentials, next-env.d.ts and node_modules are not committed.

Preservation: all48 existing workspaces retain their original HEAD, status and dirty tracked bytes; the original checkout retains all25 dirty tracked files. Unrelated services were not terminated. The final application source is identical to the validated integration commit; only these acceptance documents follow it.
