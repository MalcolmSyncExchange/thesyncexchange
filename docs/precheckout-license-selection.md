# Pre-checkout license selection — Slices 1–2

Base: `9d018ae3211c3fd629bd0ab0843215657c3b4f95`, including the approved analytics,
pgcrypto and managed-storage fixes. Remote main was rechecked before implementation
and remained `2d56691e0b3acc1655c83a3624c861929ec2c4d6`; no newer code was merged.

## Contracts and authority

| Concept | Meaning |
| --- | --- |
| License type | Reusable category, identified by `licenseTypeId`. |
| Track license offer | Active track-specific option, identified by `trackLicenseOptionId`, with trusted cents, USD currency and approved terms. |
| Buyer selection | Untrusted `licenseTypeId` intent scoped to the track route. |
| Checkout review | Buyer-authorized, freshly loaded presentation of that offer. No commerce writes. |
| Checkout attempt intent | Input to the existing payment action. A future durable attempt is outside these slices. |

The existing application currency authority remains `CHECKOUT_CURRENCY` (USD).
Hosted offers use integer database minor units, not rounded display dollars.
The session-only offer digest detects changed price/terms; it is neither a price
reservation nor a security credential. Every review starts unconfirmed. The
payment action reloads the offer and requires its current digest plus an explicit
review acknowledgment before reaching existing commerce logic.

## Buyer flow

Catalog → Track detail → Explicit license selection → Continue to Checkout →
Read-only review → Continue to Payment → Existing order/session logic.

- No initial default. Native radios, independent details disclosures, visible
  selection and keyboard focus. Back/deep-link restoration is silent.
- Only the license type identifier enters selection URLs. Paths are encoded.
- Comparison, selection and review remain available with payments off; the
  payment button is disabled. No infrastructure diagnostics are shown.
- Missing/invalid/inactive/unavailable choices return to the detail license
  section without substituting another offer.
- Review requires canonical buyer authorization, catalog eligibility, active
  track/type membership, a positive safe integer amount and server currency.
- RLS, private media, Gate D, fulfillment and purchase evidence are unchanged.

## Analytics

Only the radio change handler produces `license_selected`, filtered through the
existing schema: `track_id`, controlled `license_type`, `selection_method=explicit`.
Rendering, disclosure, navigation, restoration, review and payment retries do not
produce a license decision. Existing identity/environment/test/internal/GeoIP
metadata remains the responsibility of the unchanged analytics infrastructure.
Both checkout entry points have stopped generating `default_accepted`; its schema
value is retained for historical compatibility. `purchase_verified` is unchanged.

## Validation

`npm run test:precheckout` executes the contract, component and read-only review
tests. They also run in `npm run test:unit`. Analytics tests cover the actual action
and API with forged prices, stale review revisions, payment-off behavior and exact
event properties. Rate-limit tests exercise the new action input with the actual
offer resolver and retain their authorization/admission/side-effect assertions.

The pre-change characterization passed before intentional expectation changes.
Browser checks use credential-free local demo mode with analytics disabled;
hosted event delivery and payment execution are not part of this change.

## Slice 3 boundary

No migration or durable checkout-attempt object is introduced. Existing pending
order reuse, Stripe session creation, concurrency, expiry/cancellation and late
webhook behavior remain. The action's digest check is a fresh pre-mutation check,
not an atomic snapshot/lock across payment creation. A future Slice 3 must define
one review/attempt contract across the action and alternate checkout API, including
retry and stale pending-order behavior. The legacy Stripe cancel URL has no
selection identifier, so returning through it safely requires selecting again.

No hosted configuration, analytics events, credentials, database changes, push,
deployment or commit is part of Slices 1–2 validation.
