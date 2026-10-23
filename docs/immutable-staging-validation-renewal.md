# Immutable staging validation grant renewal

Local candidate based on `95d7d4b6cf147a067def1ef4d3b502115e55aced`.
No hosted migration, configuration, deployment, grant or event is executed here.

## Database contract

Apply `20261014050032_immutable_staging_validation_renewal.sql` only after
separate staging migration authorization. It creates no grant and preserves all
original grant fields; the legacy row receives a nullable operator column.
The old singleton uniqueness is replaced by one active-slot row. Both arming
and consumption lock this row before the grant row, serializing competing
transactions. The service role can read the audit/slot but cannot directly
insert, reset, update or delete them. Only narrowly granted RPCs can write.
RLS remains enabled; anonymous and authenticated roles receive no access.
The retired three-argument claim RPC loses service-role execution permission.

The new four-argument arming RPC takes exact authorization UUID, Artist UUID,
Admin operator UUID and `submission_started`. It requires the staging service
JWT project reference/role, canonical roles, an empty pending/leased queue,
six OFF purchase flags, and a new unused UUID. PostgreSQL generates the arming
time and expiry exactly 300 seconds later. Live grants and unfinished consumed
grants block replacement. A delivered or expired grant can be followed by a new
unique grant, without changing the old row. Expired unconsumed, completed and
legacy grants cannot be updated or deleted, even through the owner's ordinary
DML. An unfinished consumed grant can receive only monotonic finalization;
identity, expiry, consumption and event binding cannot change.

Claims require the exact bound operator and Artist, lock canonical role rows,
check payments again, enforce expiry and deduplication, and atomically consume
the grant with one test/preview outbox event. The event is held with one transport
attempt and no retry time. Existing outbox delivery and token routing are retained.
Ambiguous or held events block subsequent arming through the quiet-queue guard.
No application endpoint arms or renews a grant.

The write RPCs use SECURITY DEFINER to encapsulate audit DML while direct service
DML is revoked. Search paths are empty, execution is limited to service_role,
and each checks signed staging JWT identity. The private capability singleton is
read inside these guarded RPCs; the existing strict invoker-only purchase RPC
is unchanged. As with all PostgreSQL security contracts, a database owner can
alter functions/triggers; these protections govern ordinary clients and the
approved service-role workflow, not a malicious database owner.

## Separately authorized rollout

1. Review checksum/source, then separately authorize and apply this migration
   to staging only. Register it once in migration history; preserve the original
   expired grant and all 39 previous migration records.
2. Obtain explicit founder approval naming one **new** authorization UUID,
   Artist UUID, Admin UUID, fixed event and one attempt. UUID configuration or
   service-role possession alone does not constitute founder approval.
3. Separately authorize Functions-only configuration:
   `STAGING_ANALYTICS_VALIDATION_ENABLED=true`,
   `STAGING_ANALYTICS_VALIDATION_AUTHORIZATION=<new approved UUID>`,
   `STAGING_ANALYTICS_VALIDATION_ARTIST=9e61c9ea-ed51-4328-8937-0b989dece2c9`,
   `STAGING_ANALYTICS_VALIDATION_ADMIN=6faee3df-7b4b-4d63-ba8d-1275139ccff5`.
   Keep `ANALYTICS_ENABLED=false`, preview PostHog routing/project 657650,
   production token absent, TEST mode and six OFF flags. No secrets change.
4. Separately authorize one checked deployment. Before arming, the admin-only
   readiness GET reports `not_ready`/503 with `grantUsable=false`; this is the
   expected dormant state, not authority to arm automatically. Confirm identity,
   bounded configuration and OFF flags, plus independent preservation checks.
5. Only with explicit event/grant authorization, call
   `arm_staging_analytics_validation(p_authorization,p_artist,p_operator,p_event)`
   once through verified staging administrative access. No caller chooses expiry.
   Read back the immutable binding and database times. Perform readiness GET;
   all fixed booleans must be true (HTTP 200) before the single POST.
6. The POST derives operator from canonical authenticated Admin session and passes
   it to the four-argument claim RPC. Never retry an ambiguous outcome, reset the
   grant or generate a replacement automatically. Preserve held evidence.

Readiness uses the same config assembly as POST plus a read-only active-grant
RPC. It returns fixed booleans/status categories, never UUIDs or secret values.
An incorrect Admin UUID is denied even if its canonical role is admin.

## Local validation

`npm run test:validation-renewal:native` creates a fresh Unix-socket-only local
PostgreSQL cluster, applies local migration fixtures, runs competing transactions,
then stops and removes its own cluster. It accepts no hosted database URL and
uses synthetic identities/events only. The focused bounded, analytics, security,
publication and unit suites cover fail-closed configuration, role/operator
boundaries, historical preservation, expiry, duplicate prevention and no automatic
retry. Typecheck, lint and build remain required.
