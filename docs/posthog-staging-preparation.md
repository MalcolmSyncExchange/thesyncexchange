# PostHog Phase 1 — code-only staging reconciliation

## Checkpoint and scope

Approved and actual base: `2d56691e0b3acc1655c83a3624c861929ec2c4d6` (main / PR #39). Remote main was rechecked through the live GitHub branch API before implementation and matched this exact SHA.

Branch: `codex/posthog-staging-reconcile`
Worktree: `/private/tmp/tse-posthog-staging`

The original checkout at `/Users/malcolmw/Documents/The Sync Exchange.2` was used as read-only reference. Its uncommitted design and prior analytics work was not edited, reset, stashed, switched, or merged. The old Phase 1 branch was not merged. New dependencies were not added; `npm ci --ignore-scripts --no-audit --no-fund` used this base's existing lockfile, including its existing PGlite test dependency.

**Analytics remains disabled. No destination token is configured. No hosted migration has been applied. No events were sent to PostHog. No deployment was performed. Production and shared security staging remain untouched. Nothing was staged, committed, or pushed.**

Explicit browser interactions → same-origin authenticated analytics API → service-role Supabase outbox → server-side PostHog HTTP ingestion. Authoritative completion events originate in existing server actions or the verified ordinary marketplace webhook.

## Events and current-code integration

| Event | Trigger | Allowed event-specific properties |
| --- | --- | --- |
| `signup_completed` | New Auth identity, then successful current `ensureAppUser` reconciliation and persisted canonical role lookup. Duplicate/obfuscated signup responses are excluded. | `confirmation_required` |
| `onboarding_started` | First form change/submit or authenticated onboarding-save attempt. Browser and server share an account-scoped dedupe key. | None |
| `onboarding_completed` | Current `finalizeOnboarding` resolves successfully. Account-scoped dedupe. | None |
| `submission_started` | First meaningful form interaction/submission attempt; one UUID for that mounted attempt. | `submission_attempt_id`, `surface` |
| `submission_completed` | Create: track, rights, and license writes succeed. Update: current `update_artist_track_atomic` succeeds and transitions into pending review. Drafts, failures, conflicts and already-pending edits do not count. | Optional `submission_attempt_id`, `track_id`, `is_resubmission` |
| `catalog_searched` | Debounced query/filter/sort change; no initial render, layout-only event, or replacement of the empty state. | `search_id`, `result_count`, `has_query`, `filter_count`, `filter_types`, `sort` |
| `track_preview_started` | Genuine `playing` event on the current shared audio provider, with active source and ready/playing state. Buyer observer only; once per track per mounted buyer workspace. Pause/resume, rerenders, failed play promises and artist auditions do not count. | `track_id`, `surface` (`catalog`, `track_detail`, `buyer_workspace`) |
| `license_selected` | Explicit radio change; unchanged default only after trusted server-side license validation. Rendering a checked radio does not count. | `track_id`, `license_type`, `selection_method` |
| `checkout_started` | Existing order-bound marketplace action/API has created and persisted a Stripe session, with expected payment mode, matching order reference and an HTTPS `checkout.stripe.com` URL. | `order_id`, `track_id`, `license_type`, `checkout_attempt_id` |
| `purchase_verified` | Ordinary signed Stripe marketplace webhook only, after mode/Connect checks, trusted session/order/amount/currency validation, paid persistence and successful enabled purchase-completion evidence processing. Durable `purchase:<order UUID>` dedupe. | `order_id`, `track_id`, `license_type`, `payment_mode` |
| `funnel_step_failed` | Explicit onboarding, submission, playback and checkout failure branches; fixed codes only. | `step`, `error_code`, `retryable` |

The purchase-completion adapter can return `{enabled:false}` without recording evidence. Analytics explicitly skips that case. Its current implementation is TEST-only and disallows the production deployment target. Consequently this reconciliation does **not** make production purchase/revenue analytics ready. The future staging purchase test requires a separately approved, enabled adapter and compatible isolated database capabilities. No adapter configuration was changed here.

Anonymous/pre-identity signup failures are not captured. Some early rejected checkout/API requests are also intentionally outside the authenticated failure instrumentation. Client interaction events are untrusted product signals; authoritative purchase success is never accepted from the browser.

Common properties are `app=the-sync-exchange`, `event_version=1`, `environment`, canonical `role`, `is_internal`, and `is_test`. `distinct_id` is the Supabase UUID. Preview always sets `is_test=true`; TEST-mode purchases remain test events even if a deployment target were production. Admins and configured internal UUIDs set `is_internal=true`.

## Privacy and identity protections

- Zod schemas strip every unknown property at the browser, API/enqueue boundary and delivery boundary; invalid known fields reject the event. Accepted strings are bounded enums or UUIDs; filter types are a bounded array of fixed names.
- No SDK or browser analytics identity store, cookies, anonymous identity, automatic event collection or user-profile traits were added.
- Browser requests contain only the event, filtered properties and expected user UUID. Supabase `auth.getUser()` and the persisted `user_profiles.role` establish identity. Metadata roles and inferred roles are not used. Logged-out and stale cross-account tabs are rejected.
- No emails, raw search strings, form contents, filenames, storage paths, private/signed music URLs, lyrics, agreement contents, rights-holder data, billing/card data, amounts, Stripe evidence/payloads, URL queries/fragments or raw errors are analytics properties. Checkout URLs and Stripe sessions are validation inputs only.
- Search values remain in the local UI. Only presence/counts/fixed filter names/sort are emitted. The audio observer receives an ID and fixed surface, never the track object or URL.
- HTTP ingestion uses a fixed US/EU host allowlist, rejects redirects, forwards no browser IP/user agent/referrer, and sends `$geoip_disable=true` and `$ip=null`. PostHog receives only the UUID profile identity and allowlisted event data.
- Ordinary analytics errors fail softly. Purchase enqueue failure remains retryable through the existing webhook 500 path; ingestion failure leaves the durable event pending.
- Session replay, autocapture, pageviews/pageleaves, console/network capture and exception capture remain absent. Existing operational application logging was not redesigned or connected to PostHog.

## Outbox and delivery

`supabase/migrations/20260915072720_analytics_purchase_outbox.sql` is ported unchanged. It was executed only in disposable in-memory PostgreSQL tests against the full current repository schema; it was not applied to any Supabase environment.

Database objects:

- `public.analytics_outbox`, with primary key `id`, environment-scoped unique `(environment,dedupe_key)`, FK to `auth.users`, bounded JSON object payloads, fixed event/environment/role checks, timestamps and lease fields.
- Indexes `analytics_outbox_pending` and `analytics_outbox_actor_time`, plus the primary/unique indexes created by table constraints.
- `public.enqueue_analytics_event(text,text,uuid,text,jsonb,text,boolean,boolean)` — advisory locking, durable dedupe, 120/minute and 3,000/day actor quotas for ordinary events, paid-order/owner/track/canonical-buyer guard for purchases.
- `public.claim_analytics_event(text,uuid)` — one-row claim with `FOR UPDATE SKIP LOCKED` and a 30-second lease.
- RLS enabled; table/RPC access revoked from PUBLIC, anon and authenticated, granted only to service_role. Both RPCs are SECURITY INVOKER with empty search paths. No permissive policies or unrelated schema changes.

Delivery is an immediate, bounded attempt after enqueue. On failure, the row remains pending. A same-origin, canonical-admin-only POST to `/api/admin/analytics/retry` retries up to 10 rows in the configured environment. There is no scheduler. Acknowledgement matches both row ID and lease ID. Retries preserve event UUID, actor and occurrence time. Delivery is at-least-once; a lost acknowledgement can resend the same event UUID.

There is no destination-project binding or historical timestamp gate in this existing outbox design. **Never point an existing nonempty outbox at a new project and drain it.** This code checkpoint does not establish hosted queue emptiness or authorize cutover/backfill. Preserve pending rows, inspect counts privately, and prefer a dedicated clean staging database rather than altering a shared queue.

## Environment configuration — not configured in this phase

No `.env.local` was copied or created. The tracked `.env.example` contains blanks, not secrets. Build validation explicitly used `ANALYTICS_ENABLED=false`.

| Variable | Current/future staging value | Where after separate approval |
| --- | --- | --- |
| `ANALYTICS_ENABLED` | `false` (missing also disables). Set `true` only for an approved controlled staging test. | Ignored worktree `.env.local` for local work; isolated Netlify preview/branch-deploy environment scope for hosted testing. |
| `POSTHOG_HOST` | Blank until project region is confirmed; exact `https://us.i.posthog.com` or `https://eu.i.posthog.com`. | Same private local file or isolated preview configuration. No default region guess. |
| `POSTHOG_PREVIEW_TOKEN` | Unset now. Future project ingestion token entered privately by the operator. | Ignored worktree `.env.local` or server-side Netlify environment-variable UI for the isolated preview only. Never chat, Git, docs, CLI arguments or shell history. |
| `POSTHOG_PRODUCTION_TOKEN` | **Unset.** Preview never falls back to it and refuses the same preview/production token. | Leave absent in every context for this phase. |
| `ANALYTICS_INTERNAL_USER_IDS` | Comma-separated staging Supabase UUIDs, if needed. | Private staging configuration. Never emails. |
| `ANALYTICS_TEST_USER_IDS` | Comma-separated staging QA UUIDs. | Private staging configuration. Preview is test traffic even without this list. |

No `NEXT_PUBLIC_POSTHOG_*` variables. Existing deployment-target resolution is preserved: Netlify Deploy Previews and branch deploys map to `preview`; the repository retains its build-time target for Functions runtime. Plain local development resolves to `local`, which disables ingestion even with a token. Do not spoof local deployment context to send events. The first integrated test should use an explicitly approved, isolated preview deployment.

Supabase credentials must belong exclusively to that future isolated staging project. Do not copy the original checkout's environment. No changes are authorized to `sgpubcpldfxcuhjjdcau`, shared security staging `xgbiypruultmzbwhhjrx`, or their users/data/security/Gate D settings.

## Future first-event checklist — not executed

1. Review/commit this code separately, then approve a dedicated staging database and preview deployment. Confirm the PostHog organization, project ID and region through an authorized read-only check. Record those non-secret IDs and a UTC test-start timestamp T0.
2. Review the staging schema baseline and this exact migration. Apply only through an explicitly approved staging migration procedure after checking the project reference. Do not use a broad migration push against a linked/shared project; this migration has an older filename than several current migrations.
3. Before adding any destination token or enabling capture, verify no pending or historical analytics rows exist in the chosen dedicated database. Do not delete, backfill or deliver shared/historical rows. Provision an already-onboarded QA buyer before activation to isolate the search test.
4. Privately configure staging values, with the production token absent and collection still disabled. Verify preview app URL, Supabase Auth redirect configuration, and resolved `environment=preview`. Only after separate approval enable staging capture and deploy that isolated preview.
5. Sign in as the intended QA buyer and confirm the canonical profile role/UUID. Open catalog: initial render must produce no search event. Change one harmless test search value once, then wait for the 500 ms debounce.
6. Inspect the same-origin `/api/analytics` request: expected UUID and allowlisted properties only; no email, query text, browser URL, music URL or payment data. Expect 204, but do not treat 204 alone as proof of enqueue/delivery: ordinary analytics is fail-soft.
7. Read only the relevant outbox row after T0: `event=catalog_searched`, correct actor, `environment=preview`, `is_test=true`, correct count/filter flags. Immediate delivery may already have populated `delivered_at` by the time the row is read.
8. Verify that `delivered_at` is populated and the exact intended PostHog project shows the corresponding event UUID with `distinct_id` equal to the QA Supabase UUID. Inspect the entire property set for prohibited data. Do not create dashboards/settings to perform this check.
9. For an approved retry test only, wait for lease expiry and use the admin retry route with an inspected, isolated queue. Confirm identical UUID/time/actor and no duplicate purchase count. Never retry against an uninspected queue.
10. Turn staging capture off after the controlled test unless continued testing is explicitly approved. Keep production disabled and leave automatic capture/recording off.

## Future purchase checklist — not executed

- Separately approve the isolated TEST-only purchase-completion adapter setup (`SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED`, `STRIPE_ACCOUNT_ID` and the relevant database capabilities). A dormant/disabled adapter deliberately produces no `purchase_verified` event. Do not enable these on shared security/Gate D staging for this analytics task.
- Use the intended QA buyer and an ordinary marketplace track/license fixture. Create a **new** order and Stripe TEST Checkout Session after T0; verify both creation timestamps. Do not replay historical orders, events or webhook deliveries.
- Use only the matching staging Stripe TEST key and test webhook secret/endpoint. Keep the existing trusted pricing, order binding, payment-mode checks and evidence contract preparation. Generic `/api/create-checkout-session` and `/api/gate-d/checkout` are excluded.
- Complete that new test checkout. Verify the signed ordinary webhook, rejection of foreign Connect context, trusted session/amount/currency validation, persisted paid order and successful purchase-completion payment evidence. A success-page visit alone must not create the event.
- Verify one environment/order dedupe row, safe properties only, eventual `delivered_at`, correct project/UUID/test flags. Only if separately approved, retry delivery of this newly created test event to confirm dedupe. No historical replay/backfill.

## Stale implementation deliberately omitted

No old `ensureAppUser` overwrite behavior; no old multi-write track-update/cleanup path; no old buyer audio implementation; no old webhook hook before current evidence processing; no Gate D/generic checkout capture; no conversion capture from browser success/return pages. Current role handling, avatar concurrency protections, pricing, payment modes, purchase-completion, Gate D routing and Next.js redirects remain in place.

## Validation and readiness

Validation results and the exact file manifest follow below. All analytics HTTP tests use injected mocks; SQL tests use new in-memory instances. Hosted verification scripts and browser/Stripe/PostHog end-to-end tests were not run because they require separate environment/configuration approval.

**Recommendation: GO for review and a code-only commit after this checkpoint; NO-GO for activation or deployment.** Required future decisions: isolated staging project, intended PostHog project/region, privately configured preview token, staging-only migration approval, empty-queue/cutover verification, and enabled TEST evidence adapter for the purchase test. Current evidence-adapter restrictions also block production purchase analytics. No scheduler, project-bound queue or historical backfill was added.

## Test results

| Command | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Existing lockfile installed; lockfile unchanged; no PostHog SDK. |
| `npm run test:analytics` | 32 passed, 0 failed (included in the full unit suite). |
| `npm run test:unit` | 496 passed, 0 failed, 0 skipped. |
| `npm run test:security-pr2` | 65 passed, 0 failed, 0 skipped. |
| `npm run typecheck` | Passed. |
| `npm run lint` | Passed, zero errors; one existing React Hook Form `watch()` / React Compiler warning. |
| `ANALYTICS_ENABLED=false npm run build` | Passed on the final code; existing middleware deprecation warning. |
| `git diff --check` | Passed. |

The first sandboxed Turbopack build stalled and was stopped after confirming the process belonged to this isolated worktree. The same build passed with expanded local build permissions; no deployment or application-server changes were made. Initial regression harness failures were resolved by adding explicit analytics mocks, preserving all prior assertions, and adding the new migration to the exact expected migration list. No tests were removed, skipped or weakened.

The outbox test runs the real SQL, including full current migration compatibility, permissions, lease recovery, stale acknowledgement, dedupe, quotas and paid-order checks. It does not prove multi-process hosted delivery or destination-specific PostHog behavior. Live integration, independent PostgreSQL connection concurrency, and hosted route checks remain future verification work. Immediate delivery adds bounded outbox/HTTP latency when enabled; each such operation has its own three-second timeout, with ordinary analytics failing softly. There is no background retry worker.

## Exact changed-file manifest

### Modified

- [.env.example](/private/tmp/tse-posthog-staging/.env.example)
- [app/(app)/artist/layout.tsx](/private/tmp/tse-posthog-staging/app/(app)/artist/layout.tsx)
- [app/(app)/buyer/catalog/[slug]/page.tsx](/private/tmp/tse-posthog-staging/app/(app)/buyer/catalog/[slug]/page.tsx)
- [app/(app)/buyer/checkout/[trackSlug]/page.tsx](/private/tmp/tse-posthog-staging/app/(app)/buyer/checkout/[trackSlug]/page.tsx)
- [app/(app)/buyer/layout.tsx](/private/tmp/tse-posthog-staging/app/(app)/buyer/layout.tsx)
- [app/api/checkout/route.ts](/private/tmp/tse-posthog-staging/app/api/checkout/route.ts)
- [app/api/webhooks/stripe/route.ts](/private/tmp/tse-posthog-staging/app/api/webhooks/stripe/route.ts)
- [app/onboarding/artist/page.tsx](/private/tmp/tse-posthog-staging/app/onboarding/artist/page.tsx)
- [app/onboarding/buyer/page.tsx](/private/tmp/tse-posthog-staging/app/onboarding/buyer/page.tsx)
- [components/audio/buyer-discovery-provider.tsx](/private/tmp/tse-posthog-staging/components/audio/buyer-discovery-provider.tsx)
- [components/audio/preview-audio-provider.tsx](/private/tmp/tse-posthog-staging/components/audio/preview-audio-provider.tsx)
- [components/catalog/buyer-catalog-browser.tsx](/private/tmp/tse-posthog-staging/components/catalog/buyer-catalog-browser.tsx)
- [components/catalog/buyer-track-card.tsx](/private/tmp/tse-posthog-staging/components/catalog/buyer-track-card.tsx)
- [components/forms/submit-music-form.tsx](/private/tmp/tse-posthog-staging/components/forms/submit-music-form.tsx)
- [package.json](/private/tmp/tse-posthog-staging/package.json)
- [services/auth/actions.ts](/private/tmp/tse-posthog-staging/services/auth/actions.ts)
- [services/buyer/actions.ts](/private/tmp/tse-posthog-staging/services/buyer/actions.ts)
- [services/tracks/actions.ts](/private/tmp/tse-posthog-staging/services/tracks/actions.ts)
- [tests/avatar-consistency.test.mjs](/private/tmp/tse-posthog-staging/tests/avatar-consistency.test.mjs)
- [tests/founder-webhook-routing.test.mjs](/private/tmp/tse-posthog-staging/tests/founder-webhook-routing.test.mjs)
- [tests/phase-2-preview-audio-security.test.mjs](/private/tmp/tse-posthog-staging/tests/phase-2-preview-audio-security.test.mjs)
- [tests/pr18-pr21-reconciliation.test.mjs](/private/tmp/tse-posthog-staging/tests/pr18-pr21-reconciliation.test.mjs)
- [tests/production-beta-payments.test.mjs](/private/tmp/tse-posthog-staging/tests/production-beta-payments.test.mjs)
- [tests/purchase-completion-webhook.test.mjs](/private/tmp/tse-posthog-staging/tests/purchase-completion-webhook.test.mjs)
- [tests/rate-limit-security.test.mjs](/private/tmp/tse-posthog-staging/tests/rate-limit-security.test.mjs)
- [tests/track-asset-security.test.mjs](/private/tmp/tse-posthog-staging/tests/track-asset-security.test.mjs)
- [types/database.ts](/private/tmp/tse-posthog-staging/types/database.ts)

### Added

- [app/api/admin/analytics/retry/route.ts](/private/tmp/tse-posthog-staging/app/api/admin/analytics/retry/route.ts)
- [app/api/analytics/route.ts](/private/tmp/tse-posthog-staging/app/api/analytics/route.ts)
- [components/analytics/license-form.tsx](/private/tmp/tse-posthog-staging/components/analytics/license-form.tsx)
- [components/analytics/onboarding-interaction.tsx](/private/tmp/tse-posthog-staging/components/analytics/onboarding-interaction.tsx)
- [components/analytics/provider.tsx](/private/tmp/tse-posthog-staging/components/analytics/provider.tsx)
- [docs/posthog-staging-preparation.md](/private/tmp/tse-posthog-staging/docs/posthog-staging-preparation.md)
- [lib/analytics/config.ts](/private/tmp/tse-posthog-staging/lib/analytics/config.ts)
- [lib/analytics/schema.ts](/private/tmp/tse-posthog-staging/lib/analytics/schema.ts)
- [lib/analytics/transport.ts](/private/tmp/tse-posthog-staging/lib/analytics/transport.ts)
- [lib/analytics/triggers.ts](/private/tmp/tse-posthog-staging/lib/analytics/triggers.ts)
- [services/analytics/actor.ts](/private/tmp/tse-posthog-staging/services/analytics/actor.ts)
- [services/analytics/checkout.ts](/private/tmp/tse-posthog-staging/services/analytics/checkout.ts)
- [services/analytics/purchase.ts](/private/tmp/tse-posthog-staging/services/analytics/purchase.ts)
- [services/analytics/server.ts](/private/tmp/tse-posthog-staging/services/analytics/server.ts)
- [supabase/migrations/20260915072720_analytics_purchase_outbox.sql](/private/tmp/tse-posthog-staging/supabase/migrations/20260915072720_analytics_purchase_outbox.sql)
- [tests/analytics-outbox.test.mjs](/private/tmp/tse-posthog-staging/tests/analytics-outbox.test.mjs)
- [tests/analytics.test.mjs](/private/tmp/tse-posthog-staging/tests/analytics.test.mjs)
