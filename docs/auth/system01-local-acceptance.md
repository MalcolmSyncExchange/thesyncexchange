# System 01 — Authentication local acceptance

Baseline: `3c5a5a1bcd0bba820776ff40032569d50d1e706f`. Isolated branch: `codex/system01-authentication`. Local implementation only; no push, deployment, hosted migration, Auth configuration change, analytics activation or commerce execution.

Existing Supabase signup/login, intentional email confirmation, canonical profile roles, recovery, onboarding redirects and profile-preserving reconciliation were retained. The baseline lacked privileged MFA, a complete Account Security interface, uniform private callback/session handling, safe duplicate-account responses and equivalent protection on the older Buyer Settings credential APIs.

Implemented:

- Buyer/Artist signup; generic duplicate responses without profile writes or implicit login; resumable profile creation and atomic one-time role selection. Metadata cannot confer application authority.
- Session refresh and cookie deletion survive redirects and multiple cookie batches. Auth responses are private/no-store with no-referrer. Hosted cookies use Secure and SameSite=Lax; Supabase SSR cookies remain SDK-readable by design.
- Exact-origin/endpoint confirmation links, bounded tokens, sensitive-query stripping, safe expired/replayed links and fresh-session recovery. New passwords require at least 12 characters and at most 72 UTF-8 bytes; existing shorter passwords remain usable for login/reauthentication.
- Account Security: password-reverified email changes with a canonical callback; owned TOTP enrollment/challenge; interrupted enrollment recovery that preserves verified factors. An administrator must provide a fresh verified factor, provider AAL2 and an active owned Auth session before privileged application access.
- The additive database guard requires canonical Admin + signed AAL2 + live owned session; finance/media helper and delivery/source audit RPC guards are aligned. Workers retain their existing explicit service boundaries.
- Legacy Buyer Settings credential APIs now enforce canonical Buyer identity, configured public Origin, bounded JSON, password reauthentication without downgrading the original MFA session, enrolled-factor checks, and reliable local cookie cleanup. Successful password changes revoke sessions and return to login. Provider logout failures produce a truthful warning.
- Existing SEC, Storage upload, agreement and analytics Admin entry points require the same assurance before privileged access. These are necessary Auth dependencies, not new feature packages.

Database change: `supabase/migrations/20261024021823_system01_authentication_guards.sql`, appended after all 53 baseline migrations. No user data, bucket, commerce flag or hosted object was changed. The migration is repeatable. On a later approved rollout, apply before publishing dependent application code; verify effective helper ownership, Auth-session SELECT access, grants and AAL canaries in the isolated target. Do not recover by weakening MFA or editing historical migrations; use a reviewed forward correction or restore the isolated target.

Local evidence (2026-10-23 America/Phoenix):

| Command | Result |
| --- | --- |
| `npm run test:auth` | 114 passed: actual actions/callbacks/middleware/APIs and SQL authorization |
| `npm run test:unit` | 1,448 passed; no skipped tests |
| `npm run test:security-pr2` | 300 passed |
| `npm run test:artist-security:gate` | 5 passed |
| `npm run test:release-replay` | Fresh native PostgreSQL 17: all 54 exact migrations plus AAL1/AAL2, foreign-session and revocation checks passed |
| `npm run test:auth:browser` | Real production Next server + installed Supabase SDK against synthetic loopback GoTrue/PostgREST; Chromium journeys, desktop/mobile, refresh/recovery, MFA, same-origin and Buyer Settings checks |
| Typecheck / lint / production build / `git diff --check` | Passed; lint retains the existing React Hook Form warning at `components/forms/submit-music-form.tsx:178` |

Broader media verification: `npm run test:release-media-native` exited 1: 1 of 34 passed; 33 failed during the already tracked Supautils registration / Storage ownership prerequisites, before the new Auth migration. No policy was weakened and no media acceptance was inferred. These remain platform qualification dependencies, not successful media assertions. The full existing unit suite remains intact.

Evidence logs and browser images are local-only under the initiating workspace's `output/system01-authentication-2026-10-23/`; browser artifacts also reside in `/private/tmp/tse-system01-auth-browser/`. Fixtures, keys, identities and transactions are synthetic. The browser runner clears inherited application configuration and blocks non-loopback browser traffic. Local simulations do not attest actual Supabase/SMTP behavior.

Hosted-only acceptance, requiring separate authorization:

1. Apply the additive migration in the isolated target and independently verify real Auth schema/grants/session deletion, RLS and API canaries with canonical Buyer/Artist/Admin accounts. Keep all commerce/analytics capabilities dormant.
2. Confirm email verification, secure email change, appropriate password policy, refresh-token rotation, JWT/session timeouts, provider rate limits/abuse controls and leaked-password protection. Verify the exact application's HTTPS URL, callback allowlist and intentional email templates through the real SMTP path.
3. Rehearse real authenticator enrollment, invalid/replayed/expired TOTP, recovery, factor removal and session revocation over TLS. Establish the initial Admin authenticator under founder control. Lost-factor Admin recovery requires independently verified founder-operated provider administration; no application bypass is provided.
4. Ordinary Supabase access JWTs can remain valid until expiry after logout; global refresh-token revocation and local deletion are implemented. Privileged application/database checks additionally require a live Auth session. Validate actual provider revocation timing and choose the approved short JWT/session policy.
5. Firefox and WebKit executables were unavailable locally. Execute actual Firefox/Safari and mobile-device recovery/confirmation, password-manager, keyboard and screen-reader acceptance. Chromium mobile viewport checks are not physical-device certification.
6. All 25 formal QA scenarios remain **Not Run**. Independent security review, hosted acceptance and founder release-stage approval remain separate gates. Private Beta/full hosted integration are not approved.

System 02 has not been started. It requires the founder's next authorization after this local Auth completion.
