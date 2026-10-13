# Dedicated staging signup origin remediation

Classification: A, application signup defect. Deployed source
`0fc342c55ed7e725a8628c813764cc8024a18b36`, deployment
`6acd949d55a68b0b98ed5735`, on dedicated staging site
`d8e851a6-ab37-4b0e-9403-9b2c1be65f13`.

The single controlled retest captured one signup POST returning HTTP 500.
Historical Netlify server-handler logs at 2026-10-12 20:24:28 Phoenix
(2026-10-13T03:24:28.585Z and .593Z) report:

> Production authentication redirects must use the configured production application origin.

The stack enters configured origin validation from callback construction.
`signupAction` validates fields and selects its Supabase branch, checks trusted
profile role assignment availability, and initializes the SSR client. It then
constructs `emailRedirectTo` while evaluating arguments to `auth.signUp`.
Origin validation rejects the stable staging hostname in Netlify production
context before invoking Auth. No matching Auth user/profile or email appeared.
The Supabase unified-log query for the bounded failure window returned no
Auth/edge entries; absence is supporting evidence, not proof of invocation.
The positive stack and source ordering establish the pre-Auth exception.

The fix permits only `https://sync-exchange-posthog-staging.netlify.app` when
server-side callers supply the existing independent dedicated staging identity
proof. That proof requires matching reserved runtime site/origin, compiled site,
Supabase project URL and project-bound anon/service-role claims, disabled
analytics/demo, the explicit staging class, and compatible production context.
A staging flag alone cannot enable it. The service credential signature and
capability RPC were independently verified read-only against staging.
Production domain validation remains strict. No global deployment classification
or payment-readiness behavior changes.

Both signup/resend callback construction and `/auth/confirm` use this proof.
Token-hash verification, PKCE, safe next-path handling, role reconciliation and
analytics contracts are unchanged. Regression tests exercise the original
failure, permitted staging signup/recovery callbacks, rejected identity evidence,
and unchanged production origin restrictions.

No hosted configuration change is required: staging Auth Site URL, exact callback
allowlist, confirmation requirement and token-hash template are correct. No new
signup, Auth mutation, email, deployment or database migration occurred during
this remediation. A reviewed replacement deployment and a separately authorized
single signup/confirmation test remain necessary for hosted end-to-end proof.
