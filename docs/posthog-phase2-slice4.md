# SEC Intelligence — Phase 2, Slice 4

Baseline: `codex/posthog-phase2-slice3`, commit `9717ea8d4a5bb8a8acf15424d76fe3e0e65f2af8`.
Local implementation branch: `codex/posthog-phase2-slice4`.

## Architecture and screens

The existing admin shell links to SEC Intelligence once. `/admin/analytics` is Overview; child routes are `/funnels`, `/marketplace`, and `/event-health`. The prior operational overview remains at `/admin/analytics/operational` and is linked from the dashboard.

Server components require an admin session before reading. The existing Slice 3 adapter independently reads the authenticated user and canonical `public.user_profiles.role` before creating the privileged reader. Slice 3 supplies aggregate metric cards, funnel reports, continuous buckets, track interest and delivery states. No raw events, actor identities, orders, properties or credentials enter client props. Only the chart hydrates as a client component.

Overview includes ten requested marketplace metrics. Signup and onboarding totals are scoped to artist events. Marketplace shows active and repeat actors, previews, selections, submissions and track interest. Funnels add the complete five-step artist and buyer journeys to the existing contract/calculator rather than implementing a second calculation system. Populations distinguish actors and matched attempts; transition cards include conversion, drop-off and median times, with previous-period comparisons.

Event Health displays pending, processing, delivered, retry scheduled, held and exhausted. It describes the exact source-query scope (comparison and follow-up included). It separates delivery acknowledgement from independently verified reporting visibility. Failure categories, delivery latency and reporting visibility remain insufficient evidence because Slice 3 does not expose those aggregates. No worker, retry mutation, scheduler or provider activation was added.

## Interactions and confidence

UTC date inputs use an inclusive start and exclusive end; hourly, daily, weekly and monthly buckets preserve continuous dates. Query ranges, including previous period and four-day funnel follow-up, are limited to 93 days. The source keeps its existing 500-row pages, 10,000-row fail-closed cap, 500-track cap and five-second per-query timeout.

Each chart observation is a keyboard-focusable button with an actual value and availability in its accessible name. Hover and focus show the date, exact value, availability, coverage and aligned previous-period value in a live tooltip. Left/right arrows move between dates. Zero values have a visible baseline; unavailable points have a dashed marker. Horizontal chart scrolling contains dense hourly buckets. Metrics and funnels use the existing theme variables, typography and responsive grid patterns. Refresh is explicit GET navigation, without polling. Loading skeletons, invalid-input feedback and a retryable route error state are included.

Metric availability and reporting confidence remain separate. Observed and legitimate zero can both be provisional. Missing instrumentation, unavailable sources and insufficient evidence have null values, never fabricated zeroes. Finalized status requires the existing verified watermark and late-arrival contract. The outbox adapter currently provides neither verified coverage nor verified source freshness, so real adapter results remain provisional.

## Local validation

- `npm run test:unit`: 594 passed after supplying the already-declared PGlite dependency from the existing Slice 3 local checkout.
- Focused dashboard/read-model/intelligence tests: 55 passed.
- `npm run test:sec-intelligence-browser`: passed; Chromium checked actual hover values, zero/nonzero values, focus, arrow navigation, comparison, provisional state, four navigation links, date controls, and 390px/1280px layouts.
- `npm run typecheck`: passed.
- `npm run lint`: passed with one existing React Hook Form compiler warning in `components/forms/submit-music-form.tsx`.
- `npm run build`: passed after replacing a shared dependency symlink with an isolated dependency copy. Next emits the existing middleware convention warning.
- `git diff --check`: passed.

Initial full unit/analytics attempts failed because the original checkout's dependency installation omitted PGlite; the first build attempt rejected an external node_modules symlink. Neither required a source or lockfile change. A post-browser typecheck/build also encountered stale `.next/dev/types/validator.ts` references to the removed fixture; clearing the isolated `.next/dev` generated cache resolved the failure. The repeatable browser script temporarily installs a fixture route only for a development server bound to 127.0.0.1:3104, removes it in finally, and uses synthetic observations. It requires installed Playwright Chromium and a free port. Next dev can generate AGENTS.md/next-env.d.ts changes; these are validation artifacts and are excluded from the commit.

## Limits and Slice 5 recommendation

GO for local Slice 5 planning/development after review; NO-GO for production activation or claims of finalized PostHog reporting. Preview test/internal events are excluded by Slice 3; normal preview capture marks activity as test, so previews can have no eligible activity. Fixtures demonstrate rendering without relaxing that exclusion. Source freshness, coverage watermarks, provider-visible reporting evidence, latency and safe failure-category aggregates need a separately reviewed contract/source implementation. No hosted verification was performed. No production, Netlify, Supabase, Stripe, Resend, migrations, real accounts, purchases or workers were changed. No push or deployment is authorized by this slice.
