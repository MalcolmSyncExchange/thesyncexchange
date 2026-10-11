# Phase 2 Slice 3: analytics read models

## Local provenance and scope

Source: `codex/posthog-phase2-slice2` at `77ccc961147140cc2c260d39f0fd018c0b53716b`.
Implementation branch: `codex/posthog-phase2-slice3`.
Isolated checkout: `/Users/malcolmw/.codex/worktrees/posthog-phase2-slice3/The Sync Exchange.2`.
No dashboard, API route, scheduler, analytics activation, hosted operation, migration application, push, or deployment is part of this slice. The primary checkout is preserved.

## Architecture and response contracts

`time.ts` owns bounded ranges, civil date buckets and previous periods. `read-models.ts` builds typed `SECReadModels` with Intelligence, Funnels, Marketplace, track engagement, Event Health and time-series collections. Every metric card carries an identifier, label, availability/value, half-open range, optional previous value with its own coverage, source type, coverage states and nullable freshness timestamp. No actor, order, event ID or event properties cross this aggregate boundary. Track IDs are retained only in aggregate track rows.

`source-reader.ts` is a dependency-injected source orchestrator for deterministic mocks. `services/analytics/read-models.ts` is its server-only Supabase wiring. Existing event schemas and Slice 1 projection validation apply before aggregation; the projection now retains the allowlisted resubmission boolean. No new event names are added. Slice 1's calculator and join semantics are unchanged.

## Funnel definitions

- Artist acquisition: observed signup completion count, using the existing single-step contract.
- Artist onboarding: signup → onboarding entry → onboarding completion.
- Artist first submission: signup → onboarding entry → onboarding completion → first matched submission completion. This additional funnel definition uses existing events; it neither changes payloads nor requires new instrumentation.
- Artist submission: submission start → completion, respecting submission-attempt and track joins.
- Buyer discovery: search → preview → license selection, respecting actor and track joins.
- Buyer checkout: license selection → checkout start → verified purchase, respecting actor, track and order joins. Abandonment means checkout actors without an observed matched purchase; provisional abandonment can change with late evidence.

Each reports unique actors, matched attempts, raw observed event counts, step conversion and drop-off, overall actor and attempt conversion, and median times. Each later event advances at most one entry attempt. Missing steps are never inferred. Repeated checkout starts remain raw attempts; they do not manufacture selection attempts. Duplicate IDs deduplicate; conflicting IDs invalidate evidence. Cohort membership is supplied as an internal actor set and never returned; separate requests compare named cohorts. Median times use each actor's shortest matched journey as in Slice 1.

First submission means the first completion matched to the observed signup journey, not a claim of lifetime-first submission across unavailable historical data. Discovery cannot prove a specific search caused a preview because existing preview contracts have no search join key. No causal attribution is invented.

## Activity, windows and time series

Active artists have observed onboarding or submission activity within the selected range. Active buyers have observed search, preview, selection, checkout or verified-purchase activity. Account existence and signup alone do not establish engagement. Repeat engagement means at least two eligible activity events in the window; it does not imply return sessions or distinct active days. Artist and buyer activity are role-filtered; test/internal events are excluded.

Activity metrics use `[start, end)`. Funnel entries use that same cohort window, with later steps allowed through `end + maxStepLag × transition count`. Queries reserve the longest four-step funnel follow-up (three transitions). A source missing any required comparison/follow-up interval produces insufficient evidence rather than zero. All lag bounds must be positive and at most seven days.

Time buckets are continuous even when no events occur. Hourly buckets are elapsed 60-minute intervals anchored to the first local hour; daily, Monday-based weekly and monthly buckets use civil timezone boundaries. First/last buckets clip to the custom range. DST days can contain 23 or 25 hours. Civil midnight resolution supports offset changes and skipped midnight; unsupported skipped calendar dates fail explicitly. Comparison periods use the same elapsed duration immediately before the selected range, rather than claiming the same number of local calendar days over DST. Time-series metrics are activity totals; funnel conversion has a separate cohort contract.

## Coverage and source availability

All cards and funnels reuse Slice 2 `assessFunnelCoverage`. Funnel finality waits for the last possible step horizon, late-arrival allowance (default 24 hours), and an independently verified source watermark. Elapsed wall time is insufficient. Missing instrumentation, source failure, insufficient evidence and zero activity remain separate metric states. Unavailable metrics cannot be marked finalized. Available counts can remain provisional with incomplete coverage metadata.

The local outbox adapter reads accepted application records regardless of transport status; it measures local observed activity, not PostHog reporting visibility. Pending, processing, retry-scheduled, held, exhausted and delivered counts are scoped to the queried interval and marketplace roles, excluding tests/internal events. They are not global queue totals. No delivery operation is invoked.

Existing outbox records provide no independent completeness watermark, verified reporting visibility, or source refresh timestamp. The adapter therefore returns `coverageVerified: false`, a non-authoritative starting watermark and `lastUpdatedAt: null`. It never manufactures finality from the latest event or delivered acknowledgement. Fixture/other future trusted sources may supply verified evidence. Instrumentation availability must be supplied explicitly by trusted server configuration after rollout review, not inferred from observed rows. Transport latency and failed-attempt totals are not exposed by this adapter; only status counts are implemented for Event Health.

## Authorization and performance safeguards

The production entrypoint imports `server-only`. Every call authenticates through `getAnalyticsActor`, which checks the session with `getUser` and canonical `public.user_profiles.role`. Only an admin may open the service-role reader. No client role or metadata is trusted. There is no new publicly callable endpoint. An unauthorized request rejects before privileged client creation.

Queries filter environment, artist/buyer roles, test/internal exclusions and occurrence-time bounds; sort by occurrence time then ID; paginate 500 rows at a time; and use a five-second abort timeout per query. Supabase range upper bounds are inclusive, so pages request `offset` through `offset + limit - 1`. See [Supabase range documentation](https://supabase.com/docs/reference/javascript/range).

The entire fetched interval, including comparisons and follow-up, is capped at 93 days. This means a comparison request with maximum lag supports a smaller selected window (for example 36 days plus 21 days of follow-up fits). Maximum read size is 10,000 rows plus one sentinel page; truncation, malformed rows, duplicate pagination rows and query errors never produce successful empty data. The sentinel may reject more than 10,000 rows, rather than silently summarizing a subset. Aggregate inputs cap at 10,000 observations; track outputs cap at 500; series cap at 2,300 buckets. Track results sort by ID and include tracks seen in either comparison period.

Offset pagination is not a database snapshot. Concurrent inserts/deletes can invalidate its completeness. Duplicate rows fail closed, and outbox coverage remains unverified. Future finalized reads need a stable ingestion cutoff/snapshot, keyset pagination or server aggregation, and verified coverage evidence. Existing Slice 1 funnel matching can be quadratic for a heavily repeated actor, and bucket/track aggregation scans bounded in-memory rows. These are explicit small-window limits, not demonstrated marketplace-scale throughput. No scalability claim follows from fixtures.

## Remaining infrastructure requirements

No Slice 3 migration is added or applied. Slice 2's local `20261011191427_analytics_delivery_reliability.sql` remains a prerequisite for delivery-state reads in any later authorized rollout.

Before larger staging/production reads, review a full index on `public.analytics_outbox (environment, occurred_at, id)`; existing pending-only and actor/time indexes do not cover all delivery states for this range query. Consider a partial variant for artist/buyer, non-test/internal rows after query-plan measurement. Also design a verified coverage/ingestion-watermark store with an immutable read cutoff and bounded aggregate RPCs or preaggregation. Exact DDL should follow separately authorized staging EXPLAIN measurements; no hosted schema assumptions or changes are made here. Historical records deleted through actor cascade cannot support historical completeness.

## Verification and Slice 4 decision

Fixtures cover complete and partial funnels, repeats, multiple checkout attempts, duplicates/conflicts, out-of-order/late evidence, continuous zero periods, hourly/daily/weekly/monthly boundaries, Phoenix midnight, DST, comparisons, cohorts, failures, missing instrumentation, incomplete/finalized coverage, unauthorized reads, date/row bounds and aggregate privacy. Database tests use local PGlite only. No real events, signups or purchases are executed.

GO for Slice 4 local dashboard contract consumption with visible provisional/unavailable states and the documented query limits. NO-GO for activating hosted analytics, asserting production finality, or enabling large-history dashboards until coverage evidence, indexing/query plans, snapshot semantics and separately authorized staging validation are complete.

## Final local validation and file inventory

- `npm run test:analytics`: 106 passed, 0 failed (includes 33 Slice 3 tests and Slice 2 reliability tests).
- `npm run test:unit`: 587 passed, 0 failed.
- `npm run typecheck`: passed.
- `npm run lint`: passed with the existing `react-hooks/incompatible-library` warning in `components/forms/submit-music-form.tsx`.
- `npm run build`: passed; existing middleware-to-proxy deprecation warning remains.
- `git diff --check`: passed.

Initial `npm run test:analytics` and `npm run test:unit` attempts failed because the shared runtime lacked pinned PGlite 0.3.14. The cached package was installed offline into a separate temporary runtime and copied into this worktree. Initial `npm run build` failed because Turbopack rejected dependencies symlinked outside the worktree; a worktree-local dependency copy resolved it. The final checks above use the local runtime. No lockfile or primary-checkout dependency change was necessary. Hosted verification commands were deliberately not run because the request forbids hosted database access/changes and external analytics activity.

Changed files:

- `lib/analytics/intelligence/contracts.ts`: adds the first-submission funnel and optional resubmission projection field.
- `lib/analytics/intelligence/projection.ts`: retains validated resubmission evidence.
- `lib/analytics/intelligence/time.ts`: bounded date windows and continuous timezone-aware buckets.
- `lib/analytics/intelligence/read-models.ts`: typed aggregate SEC read models.
- `lib/analytics/intelligence/source-reader.ts`: authorized bounded source orchestration.
- `services/analytics/read-models.ts`: server-only canonical-admin Supabase adapter.
- `tests/analytics-read-models.test.mjs`: deterministic fixture/mock verification.
- `package.json`: includes new tests in analytics and unit commands.
- `docs/posthog-phase2-read-models.md`: architecture, validation and rollout limitations.

Authorization, RLS policies, checkout/webhook behavior and existing routes are not modified. Captured actor roles are preserved; unassigned/admin signup records do not become artist/buyer funnel entries through later role reassignment. A future rollout must audit this instrumentation gap rather than infer historical signup roles from current profiles.

All nine task files are committed locally; no other files are staged. No manual production step is authorized or required for reviewing this slice. Further infrastructure work requires separate approval.
