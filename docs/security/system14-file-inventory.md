# System 14 — exact file and source inventory

Baseline: `e24b5a89aa4781a66adce772fedc5a5a724dae04`. Focused local implementation commits:

## `28ae5f26f96b12fc5f4abf4f7cb5804719cc2734` — fix(security): patch dependency advisories and adapt Zod contracts

- `components/forms/submit-music-form.tsx`
- `lib/artist/account-contract.ts`
- `lib/commerce/legacy-classifier.mjs`
- `lib/validation/onboarding.ts`
- `lib/validation/track-submission.ts`
- `package-lock.json`
- `package.json`
- `services/admin/sec.ts`
- `services/licensing/records.ts`
- `services/rights/server.ts`
- `services/storage/track-assets.ts`
- `services/tracks/actions.ts`

## `b6b71da9554ef6d19ca5154bb4d76c2ffe5a780d` — fix(auth): fence null roles, revoked sessions and recovery grants

- `app/(auth)/reset-password/page.tsx`
- `app/auth/confirm/route.ts`
- `services/auth/actions.ts`
- `services/auth/auth-flow.ts`
- `services/auth/cookies.ts`
- `services/auth/recovery.ts`
- `supabase/migrations/20261024232453_system14_security_guards.sql`
- `tests/auth-flow.test.mjs`
- `tests/auth-system.test.mjs`
- `tests/helpers/artist-baseline-db.mjs`
- `tests/helpers/auth-provider-fixture.mjs`
- `tests/helpers/auth-system-harness.mjs`
- `tests/system14-security-db.test.mjs`

## `9bd4dcbacdf2271f618b2a405898bb23a11bc10e` — fix(storage): constrain upload namespaces and bound request bodies

- `app/api/storage/upload-url/route.ts`
- `app/api/storage/upload/route.ts`
- `lib/storage.ts`
- `services/storage/assets.ts`
- `services/storage/upload-request.ts`
- `tests/rate-limit-security.test.mjs`

## `0723717cd8b97766ea5bda2a901f14f0708ad560` — fix(billing): bind Stripe customers to canonical buyer identity

- `app/api/billing/invoices/route.ts`
- `app/api/billing/portal/route.ts`
- `lib/billing-customer.ts`
- `services/buyer/invoices.ts`
- `tests/billing-portal-gate.test.mjs`
- `tests/buyer-invoices-security.test.mjs`

## `29521eaff07dcb821089925c7cd1d6ecb01f3bd2` — fix(security): harden response headers and qualify integrated guards

- `middleware.ts`
- `next.config.mjs`
- `package.json`
- `scripts/build-guard.mjs`
- `scripts/build-safe.sh`
- `scripts/test-auth-browser.mjs`
- `scripts/test-notifications-native.mjs`
- `scripts/test-security-native.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `tests/security-pr2-db.test.mjs`
- `tests/system14-hardening.test.mjs`
- `tests/system14-security-native.test.mjs`

## Acceptance documentation

- `docs/security/system14-local-acceptance.md`
- `docs/security/system14-findings-register.md`
- `docs/security/system14-dependency-advisories.md`
- `docs/security/system14-file-inventory.md`

## Preserved source stream tips

| Branch | Exact source commit | Baseline ancestor |
|---|---|---|
| `codex/system01-authentication` | `b87e943f6e2d5c7245b31149107bf0cce0150ff6` | Yes |
| `codex/system02-artist-onboarding` | `d34add3ebab4ff03fe877d2687ea4c085868cbdd` | Yes |
| `codex/system03-music-uploads` | `0899704634b4cbf08d0b255191d0c8611f051981` | Yes |
| `codex/system04-rights-verification` | `c1d23a41ef77e26a73514f0261aedd9a3d78239a` | Yes |
| `codex/system05-catalog-management` | `05e19f2b44ac12c0d7f1c2c5bb4c1b552bc5041b` | Yes |
| `codex/system06-buyer-marketplace` | `8c3d12af98441b06b0a52875a41353c06a833fc7` | Yes |
| `codex/system07-licensing` | `566979cd332b8b2cf17f6e6856cba4634450279e` | Yes |
| `codex/system08-checkout-payments` | `745f9f7c4b7cc6c0740f18e513b2e8218395ce82` | Yes |
| `codex/system09-secure-delivery` | `659bd0eb6d1be2def6c5cd866d59b7d8820c1487` | Yes |
| `codex/system10-financial-accounting` | `38c68e780da51d0667d15bf4362c7bacd1a45686` | Yes |
| `codex/system11-sec-admin` | `5c40d6858ba69dd51492cdcfc38fe2feb8af1e63` | Yes |
| `codex/system12-posthog-analytics` | `2e5c58c724805852269d2ae52e6081b67b7e0c53` | Yes |
| `codex/system13-email-notifications` | `e24b5a89aa4781a66adce772fedc5a5a724dae04` | Yes |

Only the new System 14 migration was added. All 66 baseline migration SHA-256 values are retained in `migration-integrity.json`; each matched baseline bytes. Runtime source is frozen against `source-freeze.json`. Generated `next-env.d.ts`, local Supabase CLI state, build outputs, screenshots and logs are not staged. Unrelated Auth/PostHog work remains in its original worktrees.
