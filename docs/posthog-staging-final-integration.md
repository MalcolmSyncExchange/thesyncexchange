# Final staging source integration

Branch codex/posthog-staging-final-integration. Baseline is the founder-specified deployed source 5845ee54472c4143028330627e859d18ffb78529. The patch from a6997cfbbf4a103ee68e26e7c04af243d32ed5e1 was applied without conflicts. The new commit has the deployed source as its parent; routing provenance is recorded here rather than falsely claiming merge ancestry.

## Preserved release content
The original application routes/services/components/public assets, event schema/transport/outbox/deduplication, onboarding RPCs/migrations/types, authentication implementation, next.config, Netlify configuration, publication scripts, generated-deno.lock handling and package/lock files remain byte-identical to the deployed baseline. The asset-repair and its preceding site-link, CLI argument/fingerprint and Auth-origin commits are ancestors of this integration. No original migration modified or executed.

Routing shares the platform/runtime/build identity contract: exact SITE_ID, captured build stamp, platform URL, app origin, dedicated-staging classification, project-bound Supabase credential claims and demo=false. Cryptographic credential validity is independently checked by the existing publication/health RPC gates; decoded JWT claims are not presented as signature verification. Verified dedicated staging uses preview token/environment/test cohort despite Netlify production context. Actual production uses production token. Missing/invalid/mismatched/shared tokens and identity contradictions fail closed with no fallback. Analytics requires explicit true; default/false is disabled. The disabled payment/Auth identity wrapper retains its analytics=false requirement.

No source conflicts required resolution. One integration-only harness update supplies the extracted identity module to tests/staging-auth-origin.test.mjs; no Auth assertion or runtime boundary relaxed. Other harness adaptations are from the approved routing patch.

## Validation
- Unit:837 passed; analytics:197; security:65; authentication:66; publication:117; static asset tests:25.
- Typecheck PASS; lint0errors/1existing React Hook Form/compiler warning; production build PASS with analytics/payment flags disabled.
- Netlify CLI27.12.0 local offline adapter build PASS, explicit nonsecret approved staging identity. No publish command executed. Server/edge functions packaged.
- Actual adapter output .netlify/static:5CSS +55JS +53public assets matched source/build bytes. Generated redirects and headers present; withPreparedDeployConfig restores authored netlify.toml byte-for-byte. Initial artifact fingerprint043affba2a599a35f15a279efdd2e1555bb7a7eaf6a95cf8e00f9c18572a6c83,6993files. Artifact fingerprint is a local receipt, not an uploaded deploy attestation; reverify after the final approved build before publication.
- Seven localhost fixture browser cases passed at375/768/1440px; compiled application public rendering passed desktop1440/mobile390, CSS/JS MIME and assets HTTP200, logos/hero loaded, no overflow/console/network failures. Screenshots visually inspected. The temporary fixture route is absent from release output/source. No hosted login/signup/onboarding/analytics/payment test or general QA restart.
- Exact logs/hash receipts: posthog-staging-final-integration-validation.json. Generated artifacts remain ignored/outside Git.

## Read-only hosted configuration
Target site d8e851a6-ab37-4b0e-9403-9b2c1be65f13:POSTHOG_PREVIEW_TOKEN is now listed as secret,Functions-only,with a nonempty/withheld production-context entry. POSTHOG_PRODUCTION_TOKEN absent. ANALYTICS_ENABLED=false in production and preview. All six purchase capability flags on Supabase oppijylbkcbiqfuvckgj remainOFF. No token values exposed or configuration changed. Token project equality with PostHog657650 remains NOT VERIFIED because the connector withholds secrets. Earlier routing report's missing-context finding is superseded by this readback; its identity limitation remains.

## Publication readiness and remaining gates
GO for founder review and one separately authorized analytics-disabled staging replacement of this new exact commit/tree, subject to checked-publication private credential/site/RPC gates and immutable artifact verification. Preserve .netlify/static and generated adapter routing; do not publish .next directly, use incompatible CLI options or deploy an older source. This local integration does not authorize deployment; earlier approval named a6997cf, not this new candidate.
The offline adapter rehearsal does not replace the real private credential/service-role signature check. Confirm secret project binding657650 privately and verify new runtime site/stamp/origin/analytics-off/payment-off plus health/assets after separately approved deployment. NO-GO for analytics activation/event tests until their independent authorization and binding/readiness gates. Payment functionality and QA remain disabled/held.
Nothing pushed,deployed,configured,migrated or enabled; no production mutation,signup,purchase or hosted event emitted.
