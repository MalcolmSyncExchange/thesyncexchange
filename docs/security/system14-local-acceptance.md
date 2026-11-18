# System 14 — local security acceptance

Date: 2026-10-24 (America/Phoenix). Branch: `codex/system14-security-hardening`.

System 14 is locally qualified. Six confirmed baseline authorization findings were fixed: one High and five Medium across four security areas. No known unresolved Critical local finding remains within this risk-focused review. This is not a claim that every source file is free of vulnerabilities. Hosted security testing, independent review and all 25 formal QA scenarios remain outstanding.

## Baseline and preservation

System 13 implementation `96c54da` and acceptance `e24b5a8` are ancestors of this work. All System 01–13 branch tips listed in [the inventory](system14-file-inventory.md) are ancestors of the exact baseline `e24b5a89aa4781a66adce772fedc5a5a724dae04`. No shared branch was changed.

All 66 original migrations (12,956 lines) were reviewed and retained byte-for-byte. Critical runtime boundaries received source and caller/grant review, including Auth, uploads, rights, checkout, delivery, THE SEC, financial ingestion, analytics and notifications. Repository-wide searches and dependency audits supplement that review; they do not constitute line-by-line review of all 1,183 baseline files. No production secrets were used, copied or logged.

## Local implementation commits

- `28ae5f26f96b12fc5f4abf4f7cb5804719cc2734` — fix(security): patch dependency advisories and adapt Zod contracts
- `b6b71da9554ef6d19ca5154bb4d76c2ffe5a780d` — fix(auth): fence null roles, revoked sessions and recovery grants
- `9bd4dcbacdf2271f618b2a405898bb23a11bc10e` — fix(storage): constrain upload namespaces and bound request bodies
- `0723717cd8b97766ea5bda2a901f14f0708ad560` — fix(billing): bind Stripe customers to canonical buyer identity
- `29521eaff07dcb821089925c7cd1d6ecb01f3bd2` — fix(security): harden response headers and qualify integrated guards

The commit inventory includes the exact files staged for every implementation commit and `git show --stat --oneline` evidence. [Exact file inventory](system14-file-inventory.md). [Findings register](system14-findings-register.md). [Dependency dispositions](system14-dependency-advisories.md).

## Verified local results

| Check | Result | Retained evidence |
|---|---|---|
| `npm run test:unit -- --test-concurrency=8` | 1,898 passed; 0 failed/skipped | `unit-final-source.log` |
| `npm run test:security-pr2` | 300 passed; 0 failed/skipped | `security-final-source.log` |
| `npm run test:artist-security:gate` | 5 passed | `gates-final-source.log` |
| `npm run test:hardening` | 16 passed | `hardening-after-csp.log` |
| `npm run test:hardening:native` | 88 passed; 0 failed/skipped | `native-qualified.log` |
| `npm run test:release-replay` | All 67 migrations replayed from empty local database | `replay-qualified.log` |
| 13 system Chromium suites | 129 journey groups passed | `browser-summary-final.json`, `browser-final-*` |
| SEC intelligence + financial chart browser suites | Both passed | `browser-final-intelligence.log`, `browser-final-financial-chart.log` |
| Fresh `npm audit --json` | 0 Critical/High/Moderate/Low | `audit-before.json`, `audit-after.json` |
| `npm run typecheck` | Passed | `typecheck-final-source.log` |
| `npm run lint` | Passed; one inherited React Hook Form `watch()` compiler warning | `lint-final-source.log` |
| `npm run build` | Passed through repaired safe wrapper | `build-final-source.log` |
| `git diff --check` | Passed | `diff-final-source.log` |

Native execution was **Darwin ARM64**, Node 24.14.1 / PostgreSQL 17.11, using disposable local Unix-socket database fixtures, actual authenticated roles and a separately owned Storage schema. This is not native Linux AMD64 qualification. The native/replay run preceded the last page-header correction; SQL/native inputs did not change afterward. The full unit/security/browser/type/lint/build checks were rerun after that correction. Browser fixtures simulate providers and SMTP; they do not prove hosted Supabase, Stripe or Resend acceptance.

The new native test independently races two recovery-grant consumers and verifies exactly one success. Existing suites retain forged webhook, duplicate event/posting, cross-account asset, revoked entitlement, immutable rights/terms, Admin MFA, PostHog minimization and notification isolation coverage.

Failures were retained and corrected, not hidden: Zod 4 exposed invalid synthetic UUID fixtures; a Storage policy-count assertion needed the additive restrictive policy; the first native test used the wrong database connection role; the first browser run found global headers overriding a stronger rights-document sandbox. The final fix applies page CSP in middleware and preserves route-owned private-document headers. The final complete browser run is green.

## Database and recovery contract

Only additive migration `20261024232453_system14_security_guards.sql` was added after System 13. SHA-256: `f8899cd7236f8f71106f8b082862e6823051e3fc9466ab1238b8935d468547fc`.

It retains existing function identities/grants while making nullable role checks fail closed; fences media actor/private finance RPCs with active provider sessions; adds authenticated-only restrictive session policies to existing public RLS tables and `storage.objects`; and creates an owner-only, FORCE RLS recovery-grant table. Issuance is service-only after verified recovery OTP identity/session binding. Authenticated readiness/consume RPCs require the exact account/session/proof, expire at 15 minutes, and atomically consume once. No plaintext proof is stored in the database.

The app accepts explicit recovery OTP token-hash callbacks. Ambiguous recovery code/PKCE links are rejected; ordinary signup/PKCE flows remain supported. A password mutation consumes proof first; an uncertain provider failure requires a fresh recovery email. Provider-direct password updates are outside this application proof and remain a required hosted configuration/security test. Do not represent the application nonce as a provider-wide guarantee.

No license snapshots, financial journals, historical rights evidence or existing agreement files were rewritten. Do not roll back by restoring the vulnerable role/session policies. A separately approved hosted change must use a forward corrective migration and tested backup/recovery plan.

## Security limits and hosted prerequisites

1. Independently review these local fixes, MFA/capability behavior and migration permissions before hosted application.
2. Verify isolated Supabase Auth recovery templates, direct password-update/re-authentication policy, redirect allowlist, session revocation semantics and service-only grant access. The new restrictive session fence requires supported `auth.sessions`/JWT session identifiers; qualify actual provider behavior.
3. Qualify Storage policy authority under its real owner, private buckets, broker authentication/TLS, maximum-size streaming, ticket expiry/revocation, replacement and cross-account denial. SQL table policies do not revoke already-issued bearer URLs or public objects; the existing entitlement broker remains the delivery control.
4. Reconcile legacy Stripe Customer bindings through trusted review; do not auto-adopt by email. Use isolated provider test credentials only after authorization. Existing commerce/portal gates remain unchanged.
5. Verify production headers at the approved host. Page CSP limits framing/base/object loading; it is not a strict nonce-based script policy. Existing rights-document sandbox/no-referrer controls remain stronger and intact.
6. Complete native Linux AMD64 codec/media qualification, Firefox/WebKit/real-device/accessibility checks, external security/accounting review, operator alerts/worker scheduling, backup/recovery and owner-approved retention/deletion rules.
7. Phase A founder key custody and private Actions quota/budget verification remain Pending; the approved $1 cap is not proof of enforcement. No job was executed.

## Command Center and release decision

Command Center reconciliation completed through the existing native Sheet: Engineering row46; six findings in Security rows18–23; dependency/security history annotations; eight QA evidence-note pairs; BET-002/RISK-007 append-only notes; 18 Blueprint records at rows850–867. All239 target values read back correctly; 2,748 other read cells had no unexpected value change. All25 formal QA scenarios remain **Not Run**. All212 stage cells for53 qualification records, Founder Actions QUERY, dashboard/launch-gate/history formulas, existing validations/chips and four chart IDs/titles were preserved. No chart mutation request was sent. The connector exposes chart IDs/titles rather than full definitions; native Google rendering was unavailable, so no full chart-spec or Google-rendered visual comparison is claimed. Local implementation, hosted integration, independent review and formal acceptance are separate statuses. No readiness percentage or launch gate is promoted by these test totals.

Recommendation: System 14 is locally complete after the recorded implementation, validation and Command Center verification. Final acceptance commit and worktree preservation proof accompany this report. Hosted integration remains **NO-GO for automatic execution**. The next action is founder review of a separately scoped, isolated hosted rehearsal manifest and its unresolved prerequisites. Private Beta/real-money activation remain NO-GO. Stop after this package.

Scan/evidence: `ac21e54f-217b-4c1b-8904-f5cb961079a3`; managed scan directory is recorded in the findings register. Qualification logs, screenshots, audit JSON, migration hashes, source-freeze and preservation proofs are supplemental artifacts. Token usage could not be measured.
