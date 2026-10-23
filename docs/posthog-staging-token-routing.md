> Historical routing-patch report. Current source integration and hosted context readback are documented in [final integration](posthog-staging-final-integration.md).

# Dedicated staging PostHog token routing correction
Local-only remediation; no hosting configuration/deployment/analytics activation.
Baseline c8bdc2b812fdd5ee79bcc0a541b695b197a2a417 retains build-site stamping and platform URL verification.

Root cause: Netlify site d8e851a6-ab37-4b0e-9403-9b2c1be65f13 publishes https://sync-exchange-posthog-staging.netlify.app in production context. Previous analytics config selected POSTHOG_PRODUCTION_TOKEN solely from deployment target.

Routing: retain platform classification production; dedicated staging uses analytics environment preview, POSTHOG_PREVIEW_TOKEN and US ingestion. Production continues selecting POSTHOG_PRODUCTION_TOKEN. Explicit ANALYTICS_ENABLED=true remains mandatory; absent/false stays disabled.
Extracted identity contract is shared with payment health: runtime SITE_ID + captured TSE_BUILD_NETLIFY_SITE_ID, exact platform URL/app origin, dedicated-staging class, Supabase project URL and anon/service-role project/role claims, demo false. Claims are metadata checks, not cryptographic authentication; independent provider/health verification remains required. Payment readiness still additionally requires analytics false and existing verified OFF capability/credential checks. No arbitrary classification flag can override production alone.
A partial/mismatched staging claim in production context fails closed. Missing/invalid chosen token, equal production/preview tokens or incorrect dedicated staging ingestion host fails closed without fallback. Token format cannot prove a token's PostHog project; privately verify actual binding before activation.

Event names/schema, dedupe UUIDs, outbox claim/ack/retry logic, transport and migrations unchanged. Preview/test classification prevents staging from entering standard SEC marketplace metrics; existing production rows cannot be sent with preview configuration.

Read-only hosted evidence:
- Exact site-scoped deployed artifact 6ace765d73e87d875135030c, ready, production context; source commit not provided by metadata.
- Supabase oppijylbkcbiqfuvckgj healthy, sync-exchange-posthog-staging.
- PostHog project657650 is The Sync Exchange, Staging; project token redacted.
- Health GET exact approved origin: ok true, deploymentTarget production, appUrl correct, paymentMode test, livePaymentsEnabled false.
- Stored production-context NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_APP_URL correct; SYNC_EXCHANGE_DEPLOYMENT_CLASS dedicated-staging; POSTHOG_HOST https://us.i.posthog.com.
- ANALYTICS_ENABLED=false in both production and deploy-preview, Builds/Functions.
- POSTHOG_PREVIEW_TOKEN exists ONLY in deploy-preview, Functions scope. It is absent from production context. No secret values logged or settings changed.
Stored values do not prove all runtime values. The candidate is not deployed; corrected runtime token routing is locally tested only.

Remaining blocker: separately authorize a Functions-only POSTHOG_PREVIEW_TOKEN binding to project657650 for this dedicated site's production context, while keeping analytics false. Do not add a production-project token or change actual production. Effective build/runtime identity and secret binding require read-only verification after separately approved disabled deployment. No test ingestion/activation or unrelated QA restart is authorized.

Decision: GO for local remediation review; NO-GO for claiming complete hosted routing readiness until context-specific staging-token binding and runtime checks are satisfied. A separately authorized disabled deployment may be reviewed independently; this report grants no deployment/configuration authority.


## Final validation
Analytics 197/197; unit 794/794; security65/65; typecheck PASS; lint zero errors with one existing React Hook Form/compiler warning; git diff --check PASS. npm run build PASS with ANALYTICS_ENABLED=false; local sandbox compilation stalls were resolved using approved local build execution outside the restrictive sandbox. No hosted build/deployment occurred.

Changed files: lib/analytics/config.ts; lib/staging-identity.ts; lib/health/payment-readiness.ts; tests/analytics.test.mjs; tests/disabled-payment-health.test.mjs; tests/founder-webhook-routing.test.mjs; this document. Harness changes stub the extracted identity module without relaxing assertions.

Deployment-token scope correction remains separately authorized work. Netlify withholds token values, so equality with PostHog project657650 was not attested. Payment-health intentionally retains its analytics-off guard; eventual activation requires a separate compatibility gate.

Validation log SHA256 receipts:
- analytics: b34dc31a5b96c40fdcdb89ce9758c7355c531a4efa53388f80642d1da4255cae
- unit: 2f7e50fa3b59823ae753c3593186b0381a313ebfe9f3ab7a931d97b7598a01f3
- security: 7ed9ebf5f6e70a65008c914284e13cbe3facbfed8d10e8baaaa18ac9f48c6ca4
- typecheck: 1dc978774d1b3625513e484becd4e50b72c451beaeb3febce7f60f430d80071f
- lint: 5ac50ac7441cf13922420c1d3e245d01b94bec4a1984834b3091df58d6a8592b
- build: 292f641a35ebb4c89217fcafcb557f43aabb2659e2ba729a1af96d068fe80bc8
