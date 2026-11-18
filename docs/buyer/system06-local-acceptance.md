# System 06 — Buyer Marketplace: local acceptance

Branch `codex/system06-buyer-marketplace` starts at accepted System05 `05e19f2b44ac12c0d7f1c2c5bb4c1b552bc5041b`. Systems01–04 and the frozen integrated candidate `3c5a5a1bcd0bba820776ff40032569d50d1e706f` remain ancestors. This package changes the isolated local successor only. System07 Licensing has not begun.

## Existing functionality reviewed

| Surface | Baseline finding | Result |
|---|---|---|
| Buyer shell, role routing, dashboard, account settings | Working canonical role gates, navigation, profile/security/preferences forms and disabled billing controls | Preserved; dashboard now uses bounded catalog/favorite totals and a preview queue. Existing settings and ownership regressions retained. |
| Discovery | Working track cards and basic client-side filters; downloaded the entire narrow catalog, omitted language/key/duration/subgenre/keyword controls and pagination | Replaced production reads with current approved SQL search, full filters, stable sorting and bounded pages. |
| Track details | Working selection, related cards and favorites; release/language/public credits and exact deliverables incomplete | Exact approved metadata, safe credits, private artwork/preview mediation, Artist links and bounded related music integrated. Legacy ownership percentages removed from Buyer presentation. |
| Preview player | Working shared play/pause/seek/volume/error controls, but Buyer queries constructed public legacy URLs for private managed previews | Canonical private preview endpoint, actual-duration timeline, previous/next queue, integrity and postflight authorization implemented. Approved artwork uses its distinct private bucket. |
| Artist discovery | Public/private Artist separation existed; Buyer profile/catalog route missing | Buyer-safe public profile and eligible Artist catalog implemented; no legal identity/contact/payout fields exposed. |
| License interface | Explicit radios, selection URL, read-only checkout review and payment safeguards worked | Preserved and enriched with current reviewed uses/territories/restrictions/exclusions and manifest labels. Empty manifests truthfully show agreement-only delivery. |
| Favorites | Optimistic UI existed; privileged writes could save arbitrary track IDs and the whole catalog was loaded to find saved tracks | Authenticated, idempotent explicit intent; eligible-only creation; owned removal; restrictive direct Data API policy; bounded saved search. |
| Purchase library and agreements | Owner-scoped purchase projection, pending/paid/refund/dispute states and authorized delivery already implemented | Preserved. Browser pending-order and foreign-order/agreement denial verified; existing payment/licensing/delivery regressions retained. |
| Recovery/accessibility | First-use states existed; new server boundary initially required explicit refresh on retry; filter selects had unstable implicit names | Safe loading/empty/error states, functional server refresh, explicit filter names, keyboard controls, responsive menu and 320/390px layout checks. |

## Implemented Buyer behavior

`/buyer/catalog` uses URL-backed server search. Title/Artist/approved-keyword full-text search and partial title/Artist matching are supported. Genre, subgenre, mood, BPM bounds, key, duration bounds in seconds, instrumental/vocal/mixed, explicit classification, language and current reviewed license type combine. Optional exact title/Artist/keyword fields narrow results further. Relevance, featured, title, recently approved, price, both tempo orders and shortest-first sorts have deterministic ID tie-breaks. Buyers choose10/20/50 results per page; empty/out-of-range pages and clear/reset links are honest. Filter facets include only current eligible catalog values. Unknown classifications never silently match Clean or Instrumental.

`/buyer/favorites` uses the same search, sorting and pagination scoped to the canonical Buyer. An unavailable recording stays saved privately and disappears from eligible results immediately. It can be removed by its owner. Current publication and rights are rechecked on reads; no cached index needs a cron to remove revoked music. An actor-level advisory lock serializes quota checks, and track row locks plus the unique Buyer/track key prevent stale or duplicate saves.

`/buyer/artists/[artist]` projects only public profile ID/name/bio/location and public presentation links, and is available only while the Artist has eligible music. External links require bounded HTTPS URLs without embedded credentials and use safe new-tab attributes. Track and Artist navigation work in both directions.

The existing design system, approved logo assets, workspace navigation, explicit selection and PK06/PK07 checkout controls are retained. Existing demo data remains explicitly noncommercial; demonstration IDs and filters are supported without provider access. No new category, commercial price, licensing term or entitlement is invented.

## Private preview and artwork authority

`GET /api/buyer/preview/[track]` serves only the approved limited preview; `?kind=artwork` serves only the current accepted cover image. `kind=master`, arbitrary paths and unknown kinds are rejected. No original master, rights evidence or purchased asset is accessible through this route.

The server verifies the session and canonical persisted Buyer role, then obtains an active-session/publication check through the authenticated client **before** creating privileged access. The service-only locator validates the exact Buyer/session, current catalog/rights/source/offer eligibility, current accepted asset, private bucket and object ID/path/version. Preview bytes are limited to4MB in `submission-derived`; artwork to10MB in `submission-artwork`, with allowed image MIME types. Bytes are fetched server-side, SHA-256 checked, and authenticated eligibility plus exact locator equality checked again before responding. A replacement, revocation, missing object, corrupt body, invalid session or Storage failure returns no authorized bytes.

Responses are private/no-store, no-referrer, nosniff, inline and same-origin CORP. One bounded HTTP byte range supports browser seeking; malformed, multiple and unsatisfiable ranges receive416. The browser receives only same-origin track-based URLs, never privileged Storage locators, credentials or signing tokens. Private images use unoptimized same-origin image requests so the Next image optimizer cannot strip the Buyer's session. The player timeline uses actual preview duration instead of advertising full-master duration before metadata arrives. Previously buffered authorized bytes cannot be remotely erased; new requests reauthorize.

## Database changes and dependencies

Migration59: `supabase/migrations/20261024070934_system06_buyer_marketplace.sql`.

SHA-256: `435565c26590d2f8907852ffe82bcabfe48a6c105c14e8f30f88403330084fa5`.

All58 predecessor migrations are byte-identical to System05. The new migration requires verified postgres installer ownership and System05. It creates no new tables and changes no Storage buckets, Auth policies, legal snapshots, generated agreements, checkout/payment/finance contracts or capability flags.

- Replaces `public.catalog_search` in place, preserving its signature/OID and existing approved eligibility; adds safe Artist/slug/saved/exclusion filters, partial matching and reviewed price/featured/descending-tempo ordering. Direct SQL range validation is tightened to the same BPM bound as the UI.
- Adds private `catalog_private.marketplace_buyer` and `catalog_private.marketplace_track` helpers, with empty search paths and no API-role grants.
- Adds authenticated Buyer RPCs `marketplace_search`, `marketplace_facets`, `marketplace_artist`, `marketplace_set_favorite`, `marketplace_preview_check`. Canonical role and active sessions are independently checked in SQL. Anonymous, Artist, Admin-as-Buyer, missing/revoked sessions and caller-supplied ownership cannot substitute for Buyer authority.
- Adds service-only `marketplace_preview_locator`; authenticated/anonymous callers cannot retrieve private locators directly.
- Adds restrictive `Marketplace own Buyer favorites` RLS policy. The application favorite action now uses authenticated SSR RPC access, validates UUID/intent, and bounds revalidation targets to Buyer routes.
- Projects approved public metadata and current reviewed offer scope/manifest labels; private parties/evidence/ownership allocations/object paths do not enter the Buyer DTO.

Purchase quotes/acceptance, payment verification, license issuance, asset entitlements, refunds/disputes and immutable financial journals remain governed by the accepted packages. Read-only selection creates neither orders nor payments. Unpublication continues to preserve already issued historical licenses according to System05; this package changes new marketplace visibility, not historical entitlement policy.

Search analytics preserve500ms debounce and layout/pagination deduplication. Closed enums were extended for the new filter/sort names; only counts, booleans and fixed classifications leave the component. Search strings, Artist names, filter values and legal data remain local. Existing PostHog deployment/configuration and independent worktrees are unchanged; analytics was not enabled.

## Executed validation

| Command / scope | Verified result |
|---|---|
| `npm run test:unit` | 1,603 PASS; zero failures/skips. Retains licensing, checkout, delivery, finance, Auth, media and PostHog coverage. |
| `npm run test:buyer-marketplace` | 29 PASS (17 SQL/integration +12 handler/adapter/preview); included in unit count. |
| `npm run test:buyer-marketplace:native` | 50 PASS:5 Buyer native concurrency/privacy/preview/artwork plus45 retained Catalog/Rights/provider/media tests. |
| `npm run test:security-pr2` / `npm run test:artist-security:gate` | 300 /5 PASS. |
| `npm run test:release-replay` | 59 exact migrations replayed on fresh native PostgreSQL17.11; default-off capabilities, Auth and Artist guards PASS. |
| Browser suites | Buyer15, Catalog12, Rights10, Uploads11, Artist9, Auth8 Chromium journey groups PASS:65 total; zero runtime errors. Firefox/WebKit unavailable locally. |
| `npm run typecheck`, `npm run lint`, production Next builds, `git diff --check` | PASS; zero lint errors and one pre-existing React Hook Form warning. All six browser suites rebuilt production source using synthetic-only configuration. |

Counts overlap; do not add unit, focused, analytics or security counts into a readiness percentage. Native tests run on Darwin ARM64/PostgreSQL17.11 using the verified genuine local Supautils provider library and pinned FFmpeg tools. This is not Linux AMD64 or hosted Supabase acceptance.

The production browser harness uses the actual Next app and Supabase SDK against synthetic loopback Auth, real migration SQL/RLS and private Storage transport. It generates deterministic synthetic PCM→AAC and PNG fixtures, decodes actual media/images, checks play/pause/seek/progress/previous/next, injected Storage and server failures, explicit license selection/no payment, persistent favorites, public Artist discovery, owned pending purchases, foreign agreement denial, publication suspension, pagination and mobile menus. External browser network requests are blocked. Synthetic worker-completion facts do not substitute for hosted provider/codec qualification; the retained native media suite validates actual tools and provider boundaries separately.

Initial failing development runs are retained in the ignored evidence folder; only final named logs/results establish current status. Test adapters were reconciled with the new bounded search contract and stricter favorite policy; no production authorization was relaxed to make tests pass. Lint retains the pre-existing React Hook Form warning at `components/forms/submit-music-form.tsx:178`.

## Security assessment and remaining hosted requirements

No known Critical Buyer Marketplace defect remains after local validation. This is scoped engineering validation, not independent security or legal approval.

Before separately authorized hosted acceptance:

1. Inventory and apply the exact59-migration sequence only to a dedicated isolated environment, with verified installer/provider ownership, active-session semantics and direct Data API grants/RLS. Do not silently enroll legacy catalog records or rebase historical transactions.
2. Verify actual private preview/artwork objects, bucket/version/size/hash, server credentials, authenticated retrieval, TLS, deployment transport/time/memory limits, range/CORP/no-store behavior, revocation during fetch and unavailable-object recovery. No hosted Storage changes were performed here.
3. Qualify native Linux AMD64 and remaining PhaseA provider/media scenarios under separate authorization. Custody/quota/budget holds and all53 qualification records remain intact.
4. Use a genuinely cleared representative catalog and approved commercial licenses/manifest terms to test discovery usefulness, rights/terms expiry, Artist identities, real account settings, agreements and purchase library integration. Synthetic fixtures are not legal clearance or commercial pricing approval.
5. Complete independent security/legal review, human accessibility and screen-reader checks, Firefox/WebKit and physical Safari/Android device testing. Those executables were unavailable locally. Run actual load/latency and media egress measurements before setting hosted SLOs.
6. Configure hosted per-user/edge preview request and egress budgets plus monitoring before broad external scale. This package bounds and authorizes each request but does not add distributed preview throttling; authenticated repeated fetch cost remains an operational hardening item.
7. Preserve PK03/04/06/07/08/09/financial safeguards, default-off commerce and dormant capabilities. No live or test provider transactions, application deployment, pushes, shared migrations or hosted infrastructure changes were executed.

Rollback is an application-level return to an approved isolated baseline while retaining private schema/evidence and withholding new routes. No destructive down migration, historical rewrite, object deletion or agreement regeneration is proposed. A prior app version does not establish hosted compatibility; validate the chosen rollback candidate separately.

## Command Center and release boundary

Native workbook update completed and all143 written cells verified through API readback. Engineering A38:O38 records Complete — Not Live, built/tested true and merged/deployed/production-verified false. Blueprint A774:G782 adds9 System06 evidence records while prior rows767:773 remain byte-for-byte unchanged. Relevant Product/UX, Security, Master Tracker and QA evidence/notes were updated; the commercial license model remains Needs Verification.

All25 formal QA statuses remain Not Run. All53 qualification-stage records, four Progress History chart IDs/titles, Founder Actions QUERY formula, existing native validations and historical records were preserved. New rows inherit formatting/validation and verified WRAP. No actual Buyer prospect, invite, real catalog/rightsholder clearance, production state or release-stage gate was advanced. Native formatting metadata was checked; Google-rendered visual fit was not independently verified. Readback evidence: original workspace `output/system06-buyer-marketplace-2026-10-24/command-center-reconciliation.json`.

Implementation commit `8abbeb20f86c3b082aa6f5d2e9a4b3b221b0d93d` contains41 implementation/test files. This acceptance report is committed separately after verified Command Center reconciliation. The final isolated HEAD and exact `git show --stat --oneline HEAD` are recorded in `output/system06-buyer-marketplace-2026-10-24/completion.json` and `git-show-stat.txt` in the original workspace. File inventory follows. Accepted Systems01–05 and the original dirty Auth/PostHog checkout are preserved and verified independently.

System06 local engineering completion is separate from hosted integration, independent review and formal acceptance. Private Beta and real-money transactions remain NO-GO. **Stop after System06. System07 Licensing requires the founder's next authorization.**

## Exact task file inventory

- `app/(app)/buyer/artists/[artist]/page.tsx`
- `app/(app)/buyer/catalog/[slug]/page.tsx`
- `app/(app)/buyer/catalog/page.tsx`
- `app/(app)/buyer/dashboard/page.tsx`
- `app/(app)/buyer/error.tsx`
- `app/(app)/buyer/favorites/page.tsx`
- `app/(app)/buyer/loading.tsx`
- `app/api/buyer/preview/[track]/route.ts`
- `components/audio/buyer-discovery-provider.tsx`
- `components/audio/preview-audio-provider.module.css`
- `components/audio/preview-audio-provider.tsx`
- `components/buyer/buyer-search.tsx`
- `components/catalog/buyer-catalog-browser.tsx`
- `components/catalog/buyer-license-selector.tsx`
- `components/catalog/buyer-track-card.tsx`
- `components/catalog/license-option-card.tsx`
- `docs/buyer/system06-local-acceptance.md`
- `lib/analytics/schema.ts`
- `lib/buyer-marketplace.ts`
- `lib/catalog-discovery.ts`
- `lib/licenses/selection.ts`
- `package.json`
- `scripts/test-buyer-marketplace-browser.mjs`
- `scripts/test-buyer-marketplace-native.mjs`
- `services/buyer/actions.ts`
- `services/buyer/marketplace.ts`
- `services/buyer/preview.ts`
- `services/buyer/queries.ts`
- `services/orders/license-offers.ts`
- `supabase/migrations/20261024070934_system06_buyer_marketplace.sql`
- `tests/analytics.test.mjs`
- `tests/buyer-marketplace-api.test.mjs`
- `tests/buyer-marketplace-db.test.mjs`
- `tests/buyer-marketplace-native.test.mjs`
- `tests/helpers/artist-onboarding-provider-fixture.mjs`
- `tests/helpers/buyer-marketplace-provider-fixture.mjs`
- `tests/helpers/immutable-source-fixture.mjs`
- `tests/pr18-pr21-reconciliation.test.mjs`
- `tests/release-candidate-replay.test.mjs`
- `tests/security-pr2-db.test.mjs`
- `tests/track-moderation-security.test.mjs`
- `types/models.ts`
