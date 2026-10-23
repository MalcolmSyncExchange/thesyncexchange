# Staging publication preparation diagnosis

Baseline: acacdfc1910b9ec5b1c9570d5c2f032a1a04489d, tree42b0288133d71b94d1da8580bc43eed01d43cd08.
Isolated branch: codex/staging-publication-diagnostics.

## Historical failure and evidence limits

The failed run exited1 during preparation before the first build output and before upload. The blanket catch discarded the original exception. Its exact substep/category cannot be reconstructed. Source/worktree checks passed immediately before that run; CLI arguments, local site link and a subsequent provider site read passed afterward. Provider-site read timeout/failure is a leading hypothesis, not a confirmed root cause. The existing provider-site request has a10-second deadline. No retry or timeout relaxation has been introduced.

Confirmed tooling defect: diagnostics suppressed all preparation error detail. This change repairs that defect; it does not claim to fix an unobserved infrastructure/network failure.

## Changes

Fixed allowlisted step identifiers: source,cli-build-help,cli-deploy-help,site-link,provider-site,credential,configuration,build,assets,fingerprint,verification,upload. Safe categories: timeout,missing-resource,access-denied,process-failure,gate-failure. Diagnostic receipt contains only fixed step/category, bounded numeric process exit code (null for non-process errors), actual build/upload-start booleans and UTC ISO failure timestamp. Nested receipts survive wrapping. No upstream message, stack,cause,stdout,stderr,credentials,variable values,headers,cookies or bodies are retained in the emitted diagnostic.

Child CLI output is captured in memory rather than inherited into logs, with bounded16MiB buffers for build/upload. Successful publication emits a fixed completion receipt; deployID must subsequently be obtained from the provider metadata. Generated deployment config restoration remains unchanged. No automatic retry is introduced. Exact source/clean/site/project/role/configuration/capability/asset gates and fingerprint comparison remain unchanged. Standalone verification does not falsely claim a build started.

## Validation

Publication150/150,unit870/870 passed; typecheck passed; lint0errors/1existing React Hook Form warning; local production build passed with analyticsfalse/test payment mode/adaptersfalse; diff checks passed. Regression tests cover credential,site-link,CLI preparation,missingconfiguration,buildfailure,uploadcommandrejection,nestedtimeout,invalidstatus,unknownstep rejection and secret-bearing exception sanitization. All tests use local fixtures. No application source, migrations,credential provider,hosted configuration or records changed.

## Release decision

Conditional GO for a separately authorized single replacement attempt using the new exact commit/tree. Provider-site availability remains a runtime gate; any failure must emit the safe receipt and stop without automatic retry. Historical exact failure remains unverified. PostHog runtime token equality remains a separate unresolved release limitation. Analytics/payments/general QA remain held. No build/upload against Netlify or hosted reads/writes were performed during this local task.
