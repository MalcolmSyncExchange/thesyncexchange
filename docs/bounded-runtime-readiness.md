# Admin-only bounded runtime readiness

`GET /api/admin/analytics/validation/readiness` evaluates the existing
`boundedValidationConfig` inside the running Function. It requires verified
Supabase Auth and the canonical `public.user_profiles.role` to be admin before
reading private configuration or opening any privileged client.

Only the independently verified dedicated staging site in its published context
can respond with readiness. Other environments return 404 after authorization;
non-admin callers return 403. This does not change production authentication or
analytics behavior.

The route validates the configured authorization, Artist and Admin operator UUIDs
against the current immutable database grant. The authenticated canonical Admin
must match the configured operator. It returns only status/ready and fixed
booleans, including operatorMatches and grantUsable, never identifiers, tokens,
environment values, hashes or provider errors. Responses are private/no-store.
Readiness is 200 only for a usable active grant with correct identities and six
OFF flags; a dormant/unarmed capability is 503. Non-admin or wrong-operator
callers are denied, and non-staging environments return 404.

The only privileged operations are the read-only get_admin_purchase_capabilities
and get_staging_analytics_validation_readiness RPCs, with bounded timeouts.
There is no claim, grant mutation, event enqueue, capture or transport invocation.
The rollover procedure and expected dormant readiness are documented in
[immutable renewal](immutable-staging-validation-renewal.md).

Tests use the real pure identity/configuration evaluators with isolated clients.
All non-admin roles and production are rejected; malformed configurations and
unknown/enabled capabilities fail closed. A client trap rejects any non-allowlisted
RPC or table operation. Response disclosure and disabled-analytics preservation
are asserted. POST and other mutation handlers are not exported.

Local implementation only. No hosted configuration, database change, signup,
event or deployment is performed. A separately approved replacement deployment
and authenticated admin GET are required to prove the in-process staging values.
