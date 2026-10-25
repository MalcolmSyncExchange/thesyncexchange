# Phase 15A — minimum hosted Alpha checklist

Status: **NO-GO for deployment now; local candidate qualification does not authorize hosted changes.** This is a synthetic, founder-only Alpha, not Private Beta or commercial launch. No new qualification repository or custom encrypted-evidence project is required.

## Actual deployment gaps (read-only metadata)

Observed 2026-10-24 Phoenix / 2026-10-25 UTC; full responses: `output/phase15a-final-integration-2026-10-24/hosted-discovery.json`.

| Environment | Published application | Database evidence | Difference from candidate |
|---|---|---|---|
| Production, Netlify `e5bcc3bc-fb1d-4e46-b302-a95cc3ed70a5` | Ready/locked deploy `6ac9982e947c950008b72816`, Git `2d56691e0b3acc1655c83a3624c861929ec2c4d6` | Supabase `sgpubcpldfxcuhjjdcau`: 11 ledger entries;20 public tables; no System14 session policies | Older application and database. Keep unchanged. Migration ledger starts after manually installed foundation;11 is not total schema age. |
| PostHog staging, Netlify `d8e851a6-ab37-4b0e-9403-9b2c1be65f13` | Ready deploy `6acfde50f68939d8d2e19252`; provider returns null Git ref | Supabase `oppijylbkcbiqfuvckgj`:40 ledger entries;23 public tables; no System14 policies | Actual source SHA cannot be recovered from deploy metadata; do not substitute old reports. Shared Auth/PostHog work; leave untouched. |
| Security staging-2, Netlify `5e65e4a7-1f97-4b86-9059-90473050161c` | Ready deploy `6abc2b3e4476215bafe87c2c`, Git `9ba69b5aec5665f5824b31655c7444f1762280f7` | Security Supabase `xgbiypruultmzbwhhjrx`:22 ledger entries;20 public tables; submission-media schema present; no System14 policies | Potential reusable Alpha resources only after founder confirms exclusive ownership/reservation and authorizes the upgrade. Current site is not visitor-protected. |
| Local integrated candidate | All14 accepted streams + bounded integration corrections | 67 exact migrations;26 public tables;27 authenticated session policies;65 private FORCE RLS tables in the local catalog | New licensing/rights/catalog/finance/SEC/analytics/email/recovery schemas and guards are absent from the inspected hosted databases. |

All three inspected hosted databases report UTC. Their own-finance getter definition hash differs from the candidate, and none has the new recovery/session functions. Existing private audio/purchase-assets/agreements buckets do not establish the new source/rights/broker authority. Security staging has private submission-source/derived/artwork buckets; the other inspected databases do not. Hosted ledger versions and source filenames differ: **do not apply an assumed numeric suffix or blindly replay67 files into an existing schema**. Preserve a snapshot, reconcile definitions/grants and prove the upgrade on a disposable isolated database first. Clean replay alone does not validate that in-place upgrade.

## Proposed minimal target and authorization boundary

Prefer reserving the existing security staging-2 application and security Supabase project exclusively for Alpha, leaving production and PostHog staging unchanged. This is a proposal, not an assignment or permission. The media broker is explicitly pinned to Supabase `xgbiypruultmzbwhhjrx` and GCP project `tse-security-staging-media` (`services/media-broker/common.mjs`); its IAM/URL/secret allowlist must remain intact. If those resources are shared/unavailable, select a fresh isolated target and implement/test its explicit binding before deployment. An arbitrary new Supabase URL will currently fail closed. Do not weaken this control.

Use a Netlify **branch-deploy/preview** identity for Alpha. Publishing a staging site's primary deploy can give `CONTEXT=production`; that would select production safeguards/analytics partitioning. Configure and verify actual build/runtime identity and exact Alpha HTTPS origin before attempting test checkout. `netlify.toml` sets test mode only for deploy previews, so a branch deploy needs its own explicit test-mode configuration.

## Required before hosted Alpha

- [ ] Founder explicitly approves exact app/database/GCP targets, confirms exclusive isolation, names the operator and sets a cost ceiling. Recheck shared ownership before writes.
- [ ] Pin candidate commit, ordered67-migration SHA-256 manifest, Node24.14.1/lockfile and media container digest. Build from the local pinned source; no push is authorized by Phase15A.
- [ ] Snapshot existing target configuration/schema and retained synthetic data. Reconcile the22-entry security schema against source, validate an isolated upgrade, then apply only separately approved SQL. Storage-owner privileges must support the policies/triggers without weakening them.
- [ ] Require **UTC** consistently for database/PostgREST and worker connections. Mid-workflow timezone changes can alter source-evidence fingerprints and cause fail-closed rights/financial holds (P15A-R01); do not rehash or rewrite historical evidence to bypass them.
- [ ] Prepare restricted app access, TLS, exact origin/redirect allowlist, canonical Artist/Buyer/Admin identities and Admin MFA/founder binding. Use synthetic names, rights/legal terms and original media only. Confirm provider-direct password-change/recovery policy and System13 TokenHash templates.
- [ ] Configure private submission/rights/purchased/agreement storage, object-owner/version/hash checks, file limits up to250,000,000 source bytes and the approved license-specific manifest. Verify anonymous/cross-account denial on the actual target.
- [ ] Build/run existing sandboxed media worker and IAM-authenticated broker on native Linux AMD64; confirm codec processing, queue recovery and maximum fixture admission there. No separate QA repository/PhaseA hosted job is needed for this Alpha route; its historical holds remain unchanged.
- [ ] Run `services/delivery/broker.mjs` behind TLS with the exact app origin, private credential and appropriate private scratch capacity/cleanup. Keep large downloads out of Netlify Functions. Verify ticket expiry, single use, revocation, interrupted streaming and source replacement.
- [ ] Use a dedicated Stripe sandbox/test account, `pk_test`/`sk_test` and matching signed webhook secret/account identity. Register the isolated provider endpoint mapping and only the narrowly required TEST capabilities. Preserve live-mode denial and issuance/rights/acceptance fences. Ensure app access protection does not block the exact authenticated provider webhook ingress.
- [ ] Configure isolated Auth SMTP/test sender and founder-controlled recipient addresses. Set notification-worker secret separately from financial-worker credentials. Exercise one explicit batch before scheduling. No real email was sent in Phase15A.
- [ ] Run financial ingestion/reconciliation explicitly with the dedicated worker bearer; inspect retry/dead-letter queues. Use simulated provider evidence/test transactions only; no payout adapter or real-money capability is required.
- [ ] Keep production analytics off. Alpha can start with analytics disabled; local source/outbox reporting remains tested. Optional preview capture uses a separate preview token, approved privacy/test partition and Admin-triggered retry; it must not block payment or delivery.
- [ ] Basic operations: restricted provider logs, counters/lease/dead-letter alerts, operator recovery notes, database/config backups and manual rollback. Test one interrupted workflow before inviting anyone beyond the founder. No custom evidence vault or general infrastructure program is required.

### Exact configuration contract (names only; never put values in Git)

| Runtime | Required configuration |
|---|---|
| App build + runtime | `NEXT_PUBLIC_APP_URL`, isolated `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`; actual preview platform identity; `SYNC_EXCHANGE_DEMO_MODE=false`; approved maintenance state |
| TEST checkout/ingestion | `SYNC_EXCHANGE_PAYMENT_MODE=test`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_ACCOUNT_ID`; approved `SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED`, `SYNC_EXCHANGE_FINANCIAL_INGESTION_ENABLED`, `SYNC_EXCHANGE_FINANCIAL_WORKER_ENABLED`; `TSE_FINANCE_ENDPOINT_ID`, `TSE_FINANCE_WORKER_SECRET`/`TSE_FINANCE_WORKER_URL` |
| Transaction notices | `TSE_EMAIL_DELIVERY_ENABLED` remains false until authorized; `RESEND_API_KEY`, `TSE_EMAIL_FROM`, `TSE_EMAIL_REPLY_TO`, `TSE_NOTIFICATION_WORKER_SECRET`, `TSE_NOTIFICATION_WORKER_URL`; signed Resend delivery webhook configuration. Native Supabase SMTP has separate provider settings. |
| Delivery | App `SYNC_EXCHANGE_DELIVERY_BROKER_URL`; broker `SYNC_EXCHANGE_DELIVERY_APP_ORIGIN`, isolated project URL/service credential, approved `PORT`/`SYNC_EXCHANGE_DELIVERY_BIND`, TLS and protected scratch |
| Media broker/dispatcher | Exact `MEDIA_ENV`, `GCP_PROJECT`, `SUPABASE_REF`, `SUPABASE_URL`, `BROKER_URL`/`BROKER_AUDIENCE`, worker/dispatcher numeric subjects and exact emails, pinned `DB_SECRET`/`STORAGE_SECRET` versions; least-privilege DB role and verified TLS CA. See existing broker README/IaC, not arbitrary endpoint overrides. |
| Optional preview analytics | `ANALYTICS_ENABLED`, `POSTHOG_PREVIEW_TOKEN`, `POSTHOG_HOST`, internal/test actor IDs; no production token fallback |

Financial runner: `node scripts/finance/worker.mjs --once`. Notification runner: `npm run worker:notifications` (one batch, max10, no body/recipient input, no installed scheduler). Analytics already has an MFA Admin retry route. Media dispatcher/worker use the existing fenced permit/IAM contracts. Exported worker functions alone are not evidence of hosted scheduling.

## Later-stage classification

| Stage | Remaining work |
|---|---|
| Before Private Beta | Hosted Alpha lifecycle and negative-access acceptance; independent security review; canonical source-hash timezone robustness/history compatibility; browser/device/accessibility and recovery drills; support/monitoring ownership; original founder-source verification where material; explicit founder stage approval. All25 formal QA remain Not Run. |
| Before real-money commerce | Approved commercial agreements, rights mandates/catalog clearance, prices/commission/splits; accounting/tax/payee/payout approval; LIVE provider configuration, reconciliation/refund/dispute acceptance and financial/independent review. Synthetic Alpha must not be held for these commercial decisions. |
| Post-launch improvement | Higher-volume automation, richer operational dashboards, extended browser/performance optimization and strict nonce CSP after compatibility validation. Actual security defects retain their required stage, not automatic deferral. |

## Expected incremental costs — planning only

Assumption: founder-only low-volume Alpha, scale-to-zero workers, existing Netlify Pro resources, existing reserved database or one additional Pro project. **Allow $0–40/month incremental; propose a separately approved $50 ceiling.** Actual account quotas/billing and enforceable budgets remain unverified, so this is not a quote or authorization. No infrastructure or transaction spend was initiated here.

Netlify currently advertises Pro from$20/month; existing team resources may avoid a new subscription but usage remains metered ([pricing](https://www.netlify.com/pricing/)). Supabase advertises Pro from$25/month with the first project included, additional projects from$10/month; reuse has no assumed new fixed compute subscription ([pricing](https://supabase.com/pricing)). Allow$0–20 for media/delivery compute, registry/logs/secrets/egress within this envelope; Cloud Run is usage/region-based and free allowances are billing-account shared ([pricing](https://cloud.google.com/run/pricing)). Founder-volume email may fit the free tier's100/day limit; confirm the actual account ([Resend pricing](https://resend.com/pricing)). These allowances require a preflight usage/budget check before authorization is exercised.

## Rollback and acceptance

Before an authorized change, record target snapshot, current deploy ID and config **names/scopes**. On failure, stop queue workers and test ingress, restore the prior app deployment/config in the reserved environment, and recover the isolated database from its snapshot or a reviewed forward correction. Do not restore vulnerable production policies, overwrite immutable records, purge ambiguous media or replay uncertain sends/payments blindly. Production remains untouched.

GO for founder hands-on Alpha only after: exact target approval/isolation, migration and Storage authority proof, valid Admin MFA/recovery, one synthetic Artist→rights/catalog→Buyer TEST payment→agreement/assets→balanced ledger→SEC journey, and unpaid/cross-account/revocation negatives on that environment. These are hosted Alpha acceptance procedures; they have not been run. Do not automatically start Phase15B.
