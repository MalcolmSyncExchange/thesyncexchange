# Rate limit foundation

Migration 0021 must be applied by an approved database operator before deploying
the corresponding application code. It has not been applied by this change.
Without the RPC or service-role configuration, checkout and upload admission
fails closed with a safe 503 response (or a checkout form error).

## Policies

| RPC operation | Shared counter policies |
| --- | --- |
| checkout | checkout-minute: 5/60s; checkout-hour: 30/3600s |
| upload | upload-minute: 20/60s; upload-day: 200/86400s |
| server-upload | upload-minute: 20/60s; upload-day: 200/86400s; server-upload-minute: 10/60s |

Both checkout entry points use `checkout`. The direct-upload endpoint consumes
the same shared counters as signed-upload issuance plus its stricter counter.
Admission is atomic across all budgets: denied calls increment none of them.
Admitted attempts consume quota even when the subsequent business operation
fails. Direct uploads consume admission before parsing multipart data, so invalid
multipart submissions also consume quota. This protects body parsing work.
The checkout action consumes quota after Buyer authentication and required input
checks, before its catalog/preview lookup. Approved-track and trusted-price
validation still precede order writes and Stripe. The checkout API validates
existing order ownership and trusted pricing before admission.

Windows are fixed and aligned to database epoch time, not a rolling interval.
An allowed request at the end of one window may be followed by another in the
next window. `remaining` is the smallest remaining budget; successful `reset_at`
is the earliest applicable window end, not a promise that every budget resets.
Denial returns the latest reset among exhausted budgets and its Retry-After.

## Isolation and security

`services/security/rate-limit.ts` uses only the service-role client, never the
authenticated-client fallback. A verified user UUID is supplied by each handler
after authentication and canonical database role/ownership checks. Operations
are allowlisted in TypeScript and SQL; limits and timestamps are database-owned.
Counters have no browser grants or RLS policies. Only service_role may execute
the SECURITY DEFINER RPC, which pins its search path and checks the JWT role.
The only exposed function takes typed values, never SQL identifiers.

Namespace uses the existing deployment target resolver:
- Netlify CONTEXT=production: tse:production
- Netlify CONTEXT=branch-deploy or deploy-preview: tse:preview
- Local development: tse:local

Preview deploys intentionally share a preview namespace. All namespaces remain
stable across deploys. They are not taken from request Host headers. Verify the
Netlify CONTEXT setting; no new credentials or environment variables are needed.
The helper has a three-second request timeout and treats errors, missing rows,
malformed replies and missing configuration as unavailable. No raw backend errors,
session cookies, or credentials appear in limiter responses or logs.

Native request buffering may happen before Next.js invokes a handler. Limiting
before `request.formData()` prevents application parsing/upload work, not ingress
bandwidth. Signed-upload admission also does not replace Storage file-size
constraints, ownership policies or future byte quotas. Webhooks and trusted
internal cleanup do not use these user request budgets.

## Expired-window cleanup

Expired windows never count toward current admission. Schedule a trusted
database-operator job hourly after migration approval. Each run can execute the
following bounded statement; repeat in later runs if a backlog remains. The
one-day grace period avoids contending with in-flight window admissions.
Do not expose cleanup as a browser RPC or run it on each request.

```sql
with expired as (
  select namespace, subject_key, policy, window_start
  from rate_limit_private.counters
  where window_end < now() - interval '1 day'
  order by window_end
  limit 5000
  for update skip locked
)
delete from rate_limit_private.counters c
using expired e
where c.namespace = e.namespace and c.subject_key = e.subject_key
  and c.policy = e.policy and c.window_start = e.window_start;
```

## Verification

Run the Node rate-limit tests, checkout/storage security tests, unit suite,
typecheck, lint, build and diff check. Mocks execute the real route/action/helper
code with Stripe, Storage and RPC calls replaced. SQL structure tests are not
proof of PostgreSQL runtime concurrency. After separate approval to use an
isolated test database, apply the migration there and test concurrent RPC calls,
shared operation budgets, role grants, namespace isolation and window resets.
Never run quota or cleanup tests against production user data.
