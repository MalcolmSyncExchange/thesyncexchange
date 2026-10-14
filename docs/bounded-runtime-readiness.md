# Admin-only bounded runtime readiness

`GET /api/admin/analytics/validation/readiness` evaluates the existing
`boundedValidationConfig` inside the running Function. It requires verified
Supabase Auth and the canonical `public.user_profiles.role` to be admin before
reading private configuration or opening any privileged client.

Only the independently verified dedicated staging site in its published context
can respond with readiness. Other environments return 404 after authorization;
non-admin callers return 403. This does not change production authentication or
analytics behavior.

The route compares the two configured identifiers with the founder-approved
values fixed in server source. It returns only `status`, `ready`, and fixed
booleans: `validationEnabled`, `authorizationMatches`, `artistMatches`,
`stagingIdentityValid`, `globalAnalyticsDisabled`,
`boundedConfigurationRecognized`, `paymentCapabilitiesOff`. Successful readiness
is HTTP 200; incorrect, missing or unavailable configuration is HTTP 503. It
never returns UUIDs, tokens, configuration objects, environment values, hashes
or provider errors. Responses are private/no-store and vary by credentials.

The only privileged operation is the existing read-only
`get_admin_purchase_capabilities` RPC, with a three-second timeout and fail-closed
parsing of all six OFF flags. It is reached only after authorization, staging
identity and configuration/identifier validation. There is no grant table query,
claim, grant mutation, consumption, event enqueue, capture or transport invocation.
The diagnostic reports configuration readiness, not that a grant has been armed.
Grant absence and historical data must still be checked independently during an
explicitly authorized rollout.

Tests use the real pure identity/configuration evaluators with isolated clients.
All non-admin roles and production are rejected; malformed configurations and
unknown/enabled capabilities fail closed. A client trap rejects any non-allowlisted
RPC or table operation. Response disclosure and disabled-analytics preservation
are asserted. POST and other mutation handlers are not exported.

Local implementation only. No hosted configuration, database change, signup,
event or deployment is performed. A separately approved replacement deployment
and authenticated admin GET are required to prove the in-process staging values.
