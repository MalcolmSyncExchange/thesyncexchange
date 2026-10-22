# PK08 secure asset delivery — local implementation candidate

2026-10-22. Baseline: PK07 `d1724da`, `b7f0146`, `0435cff`, followed by
PK03/PK06 `8772e2b` and `b5af6ee`. The October 21 reconciliation and October 22
completion reports are planning/evidence inputs, not hosted acceptance.

## Architecture and boundaries

Reuse `commerce_private.asset_versions`, the original contracts/context,
entitlements, worker jobs, payment events and `can_deliver`. Seven additional
private tables describe reviewed license deliverables, download decisions,
single-use ticket digests/redemptions, preparation outcomes, administrative
restrictions and entitlement revocation history. There is no second media,
license, accounting or entitlement system.

An Admin with canonical database authority reviews an explicit set of sealed
asset versions **before any quote** for an offer. That set becomes part of the
quote hash, displayed transaction schedule, buyer acceptance, generated agreement
receipt and immutable commerce context. Missing review includes zero files.
Different offers/license types can contain different masters, instrumentals,
clean versions, stems, alternate mixes and supporting ZIP/PDF materials. Multiple
stems are separate versions. New purchases never inherit every track asset.
Existing contracts are not backfilled or granted inferred rights. Old synthetic
fixture reservations remain compatible, but cannot pass the new broker predicate.

The existing asset model retains its opaque `<asset UUID>/master` destination
even for a variant; that historical path suffix is not an access permission.
Source objects must be private, versioned and under the canonical seller's
track-audio namespace. Delivery remains in private purchase-assets. Exact track,
kind, version, SHA-256, size and MIME must match the accepted manifest, current
Storage identity and original purchase hash. Ready bytes cannot be replaced.
Retiring a version denies subsequent access while retaining the original evidence.

## Access and payment lifecycle

1. An explicit same-origin POST verifies the server session, canonical Buyer and
   RLS-scoped ownership and a database-verified, actor-bound Auth session **before** acquiring a privileged client. Session revocation is rechecked before ticket redemption and final release. GET/HEAD never
   authorize downloads, sign URLs, issue jobs or write download audits.
2. The narrow database authorization RPC independently checks buyer/order/
   entitlement, accepted manifest, verified payment, generated license, rights
   review validity, usage expiry, holds, active entitlement, asset approval,
   private Storage identity and synthetic QA designation. All capability flags
   remain OFF by default, including the new delivery_enabled switch.
3. Pending, unpaid, failed, partial/full refund, dispute, revoked entitlement,
   rights withdrawal, retired asset, expired usage and administrative restriction
   deny new delivery. Full refund revokes; conservative partial refund/dispute
   suspension is preserved. No automatic hold clearing or legal termination is
   inferred. A trusted operator resolution workflow remains separate work.
4. Audit persistence is mandatory. Fetch the exact private bytes with bounded
   memory, no redirects, a 20-second provider timeout and a 250,000,000-byte cap;
   verify size/SHA-256 before release. Recheck authorization and commit the
   preparation outcome after Storage I/O. If a refund/withdrawal commits first,
   the final check denies the bytes. SQL locks serialize adverse order updates.
5. Two outstanding authorizations per buyer, 20 attempts/minute and 1,000/day
   bound authorized API work. A duplicate request key cannot authorize twice.
   A failed/interrupted operation requires a fresh checked request, never a new
   purchase, payment, asset identity or license generation.

Already released/in-flight bytes cannot be recalled. Authorization is serialized
at the final database check, not across the client's network transfer. Outcomes
say **bytes_prepared**, not downloaded/received. An authorization with no outcome
after expiry indicates an interrupted/unused attempt; no false completion is
written. Unauthenticated/invalid-origin traffic is denied before privileged I/O;
configure sanitized infrastructure access counters during approved integration.
Authenticated role/ownership denials use a bounded actor-derived RPC and disclose
no target existence or Storage coordinates.

## Large-file runtime and hosting

Netlify documents a 6 MB buffered response ceiling (binary encoding lowers the
effective limit) and 20 MB streamed responses. Do not proxy large music through
the app Function. See [Netlify limits](https://docs.netlify.com/build/functions/configuration/).

The app streams verified attachments only up to a conservative 4,000,000 bytes.
Larger files require a separately deployed Node runtime implemented in
`services/delivery/broker.mjs`. The server returns an HTTPS broker descriptor and
a random 256-bit ticket in a private JSON response. Only the digest is persisted.
The browser POSTs the ticket in a bounded body, with no session cookies or JWTs.
The broker accepts only the exact approved app Origin, never a buyer identity,
path, bucket or provider URL. Atomic single-use redemption rechecks eligibility,
then exact-byte verification and final revocation/audit checks precede response.
GET/HEAD, Range and arbitrary paths are denied. CORS preflight is read-only.
Tickets expire with the 60-second original authorization; they never extend it.
Raw tickets must never enter application/proxy/analytics logs or URL query strings.

The standalone runtime is local code only. It is not a Netlify Function. Start
only against an explicitly approved isolated environment, with server-only
SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL,
SYNC_EXCHANGE_DELIVERY_APP_ORIGIN (exact HTTPS origin) and optional PORT.
It binds loopback unless SYNC_EXCHANGE_DELIVERY_BIND is explicitly supplied.
The app requires SYNC_EXCHANGE_DELIVERY_BROKER_URL pointing to the broker's exact
HTTPS `/download` endpoint. No setting is changed by this implementation.
Broker admission is limited to two concurrent requests per process. Plan at least
2 GiB memory for 250 MB buffering, bounded autoscaling/egress, private secrets,
TLS, request/body-log redaction, health checks and incident ownership. Validate
actual maximum-size latency/memory/platform behavior before promotion. No capacity
claim follows from the small local fixtures. No signed Storage URL is exposed.

PK06 agreement PDFs use their recorded immutable SHA-256 and size and are verified
through the app for files <=4 MB. Missing integrity evidence or larger PK06 PDFs
fail closed for operator review. Historical owner/Admin agreement access remains
available after refunds, separately from exploitation asset entitlements. Legacy
pre-PK06 agreements retain the existing deliberate POST/60-second signing path;
they are not retroactively represented as hash-verified. This is a residual legacy
integration review item; no issued agreement is regenerated.

## Schema, Storage and media integration

Candidate migration: `20261022180614_secure_asset_delivery.sql`, after the final
PK07 and PK03/PK06 candidates. Never apply it directly to shared environments.
It adds seven private RLS tables, two immutable context columns, an OFF capability,
variant/MIME/size constraints, manifest/activation guards, 12 narrow new public
RPCs and a replacement of the checkout-preparation wrapper. The previous private
fixture adapter stays isolated and cannot grant broker access. No public table
write grants or client Storage policies are broadened. No bucket is created,
made public, reconfigured or populated by this migration.

Read-only comparison of `codex/phase-2-slice-3-media-worker` identifies
`submission_media.assets` / `submissions`, private submission-source/artwork/
derived buckets, byte-level validation, worker leases and a 250 MB source ceiling.
That owner/branch is untouched. Its accepted source needs an explicit reviewed
bridge into the existing commerce version model; do not independently reserve a
new source or substitute an active submission pointer for a frozen purchased
version. This candidate supports the existing private track-audio ingestion path.
The Slice 3 bridge, canonical identity/hash mapping, real technical validation,
retained ownership and effective hosted grants must be integrated with that owner.

Existing purchase-assets Storage API limits are 50 MiB/audio-only in the foundation
specification. ZIP/PDF support and assets up to 250 MB require separately authorized
supported Storage API configuration and verification. SQL metadata constraints
are not evidence that Storage accepts those uploads. Do not mutate storage.buckets
manually to simulate platform configuration. No hosted infrastructure was inspected
anew or changed during this local implementation.

## THE SEC and reconciliation

The existing Admin orders page shows a read-only audit (latest 100 attempts and
revocations plus any administrative restriction). Canonical Admin authorization
is rechecked by the database. No Admin download bypass is added for music.
Reasoned administrative restriction is an explicit server command, append-only;
it suspends access and cannot erase financial/acceptance history. Unrestriction
requires separately reviewed policy/workflow. Existing payment state/history and
immutable purchase hashes correlate audits to reconciliation. No accounting
journal or financial balance is mutated by a download.

## Acceptance and rollback

Run `npm run test:delivery`, `test:delivery-concurrency`, `test:unit`,
`test:checkout-concurrency`, `test:security-pr2`, `test:artist-security:gate`,
typecheck, lint, build and `git diff --check`. Fixtures are synthetic/disposable.
Native tests observe independent PostgreSQL lock waits, request deduplication,
single ticket redemption and refund-before-release denial. Broker HTTP tests
transfer a >4 MB synthetic file over loopback without provider/database traffic.
These do not establish Supabase HTTP behavior, hosted capacity, browser/mobile
acceptance or a release certificate. Keep all formal QA scenarios Not Run.

Local validation: 569 unit tests PASS (44 focused delivery and the two added
agreement tests are included); 65 security regressions PASS; five security gates
PASS; native delivery and checkout contention suites PASS; typecheck/build PASS;
lint has zero errors and the existing submit-music-form warning. The unchanged
Docker-only `test:purchase-concurrency` and `test:gate-d-concurrency` commands were
attempted and fail before assertions because the Docker daemon socket is absent.
Their container execution remains unverified. Do not interpret the native tests
as evidence those Docker suites ran. Formal cases are in `pk08-qa-matrix.csv`.

Before hosted integration: exact-head/schema review, all owner holds and an
approved migration sequence; effective RLS/Storage grants and immutable byte proof;
separately approved broker/Storage setup; actual buyer/artist/admin/anon/cross-account,
expiry, refund/dispute, download interruption and max-size tests; Chrome/Firefox/
Safari/mobile downloads, keyboard/screen-reader acceptance and monitoring exercises.
Recover approved source decisions, real legal/rights/parties/economics, cleared
catalog and contributor/reconciliation operations before stage certification.

Rollback disables delivery and removes app-to-broker routing; retain original
versions, contracts, legal receipts, ticket digests and audit history. Do not drop
tables, delete purchases, unhold refunds or regenerate fulfilled agreements.
Private Beta remains NO-GO until formal exact-candidate QA and explicit founder
approval. Controlled Live and Market Launch require their additional gates.

Recommended next package: coordinate PK04's validated immutable-source bridge and
large-file isolated integration, then PK09's contributor/ledger/reconciliation
operations. Preserve separate Auth/PostHog ownership throughout.

## October 22 PK04 follow-up

The isolated immutable-source candidate now bridges the canonical media records
to the original accepted manifest. This supersedes the earlier “bridge pending”
local-code statement above; hosted compatibility/acceptance remains unverified.
See [PK04 implementation](pk04-immutable-source-integration.md),
[prepared hosted rehearsal](pk08-hosted-rehearsal-plan.md) and
[next financial assignment](pk09-financial-reconciliation-assignment.md).
Historical PK08 test counts above describe commit 64aacff and are not refreshed
acceptance of the newer candidate. No hosted rehearsal has been executed.
