import test from 'node:test';
import assert from 'node:assert/strict';
import { ANALYTICS_CONTRACT_VERSION, FUNNELS } from '../lib/analytics/intelligence/contracts.ts';
import { calculateFunnel } from '../lib/analytics/intelligence/funnel.ts';
import { calculateCommerce } from '../lib/analytics/intelligence/commerce.ts';
import { projectOutboxObservation } from '../lib/analytics/intelligence/projection.ts';

const window = { startInclusive: '2026-10-01T00:00:00Z', endExclusive: '2026-10-03T00:00:00Z',
  observedThrough: '2026-10-07T00:00:00Z', maxStepLagMs: 7 * 86400000 };
let sequence = 0;
function observation(event, occurredAt, actorId = 'actor-a', extra = {}) {
  return { eventId: `event-${++sequence}`, actorId, actorRole: event.startsWith('buyer_') ? 'buyer' : 'artist',
    event, occurredAt, environment: 'preview', isTest: false, isInternal: false, ...extra };
}
function funnel(name, observations, extra = {}) {
  const role = FUNNELS[name].role;
  return calculateFunnel({ funnel: name, source: 'available', instrumentedEvents: FUNNELS[name].steps,
    observations: observations.map(row => ({ ...row, actorRole: role })), window, environment: 'preview', ...extra });
}
const at = day => `2026-10-0${day}T12:00:00Z`;
const value = metric => { assert.ok(metric.state === 'observed' || metric.state === 'zero'); return metric.value; };

test('versioned Phase 2 contracts preserve Phase 1 artist and buyer event names', () => {
  assert.equal(ANALYTICS_CONTRACT_VERSION, 2);
  assert.deepEqual(FUNNELS.artist_onboarding.steps, ['signup_completed', 'onboarding_started', 'onboarding_completed']);
  assert.deepEqual(FUNNELS.buyer_checkout.steps, ['license_selected', 'checkout_started', 'purchase_verified']);
});

test('Phase 1 outbox projection strips private properties and rejects forged or malformed rows', () => {
  const row = { id: '3a927da9-c129-4534-85ec-d7cb7f15b330',
    actor_id: '8b3f954f-0aa7-4666-969f-b1edac34ddea', actor_role: 'buyer',
    event: 'track_preview_started', occurred_at: at(1), environment: 'preview', is_test: true, is_internal: false,
    properties: { track_id: '5ba0a39e-32ae-4ec4-ba63-eaf083b3eeb4', surface: 'catalog',
      email: 'private@example.invalid', signed_url: 'https://private.invalid/audio', raw_search: 'private' } };
  const projected = projectOutboxObservation(row);
  assert.ok(projected);
  assert.deepEqual(Object.keys(projected).sort(), ['actorId', 'actorRole', 'checkoutAttemptId', 'environment', 'event',
    'eventId', 'isInternal', 'isTest', 'occurredAt', 'orderId', 'submissionAttemptId', 'trackId']);
  assert.ok(!JSON.stringify(projected).includes('private'));
  assert.equal(projectOutboxObservation({ ...row, actor_role: 'admin' }), null);
  assert.equal(projectOutboxObservation({ ...row, event: 'purchase_verified', properties: row.properties }), null);
});

test('artist acquisition, onboarding and submission complete from observed ordered events', () => {
  const signup = observation('signup_completed', at(1));
  const start = observation('onboarding_started', at(2));
  const complete = observation('onboarding_completed', at(3));
  const submissionStart = observation('submission_started', '2026-10-03T13:00:00Z', 'actor-a', { submissionAttemptId: 'attempt-1' });
  const submissionComplete = observation('submission_completed', '2026-10-03T14:00:00Z', 'actor-a', { submissionAttemptId: 'attempt-1' });
  assert.equal(value(funnel('artist_acquisition', [signup]).steps[0].actors), 1);
  const onboarding = funnel('artist_onboarding', [complete, signup, start]);
  assert.equal(value(onboarding.overallConversionPercent), 100);
  assert.equal(value(onboarding.completionMedianSeconds), 172800);
  const submission = funnel('artist_submission', [submissionComplete, submissionStart], {
    window: { ...window, startInclusive: '2026-10-03T12:00:00Z', endExclusive: '2026-10-04T00:00:00Z' }
  });
  assert.equal(value(submission.steps[1].actors), 1);
  assert.equal(value(submission.transitions[0].medianSeconds), 3600);
});

test('buyer discovery and checkout use actor, track and then order identity', () => {
  const search = observation('catalog_searched', at(1));
  const preview = observation('track_preview_started', '2026-10-01T13:00:00Z', 'actor-a', { trackId: 'track-a' });
  const select = observation('license_selected', '2026-10-01T14:00:00Z', 'actor-a', { trackId: 'track-a' });
  const checkout = observation('checkout_started', '2026-10-01T15:00:00Z', 'actor-a', { trackId: 'track-a', orderId: 'order-a', checkoutAttemptId: 'checkout-a' });
  const purchase = observation('purchase_verified', '2026-10-01T16:00:00Z', 'actor-a', { trackId: 'track-a', orderId: 'order-a' });
  assert.equal(value(funnel('buyer_discovery', [search, preview, select]).overallConversionPercent), 100);
  assert.equal(value(funnel('buyer_checkout', [select, checkout, purchase]).overallConversionPercent), 100);
  const wrongTrack = observation('license_selected', '2026-10-01T14:00:00Z', 'actor-a', { trackId: 'track-b' });
  assert.equal(value(funnel('buyer_discovery', [search, preview, wrongTrack]).steps[2].actors), 0);
  const wrongOrder = observation('purchase_verified', '2026-10-01T16:00:00Z', 'actor-a', { trackId: 'track-a', orderId: 'order-b' });
  assert.equal(value(funnel('buyer_checkout', [select, checkout, wrongOrder]).steps[2].actors), 0);
});

test('partial and missing steps never inflate earlier populations', () => {
  const search = observation('catalog_searched', at(1));
  const selection = observation('license_selected', at(2), 'actor-a', { trackId: 'track-a' });
  const report = funnel('buyer_discovery', [selection, search]);
  assert.deepEqual(report.steps.map(step => value(step.actors)), [1, 0, 0]);
  assert.equal(value(report.transitions[0].dropped), 1);
  assert.equal(value(report.transitions[0].dropOffPercent), 100);
  assert.equal(value(report.overallConversionPercent), 0);
});

test('conversion and drop-off percentages use unique actors, including repeat entrants', () => {
  const rows = [observation('catalog_searched', '2026-10-01T12:00:00Z', 'actor-a'),
    observation('catalog_searched', '2026-10-01T12:10:00Z', 'actor-a'),
    observation('catalog_searched', '2026-10-01T12:00:00Z', 'actor-b'),
    observation('track_preview_started', '2026-10-01T13:00:00Z', 'actor-a', { trackId: 'track-a' })];
  const report = funnel('buyer_discovery', rows);
  assert.deepEqual(report.steps.map(step => value(step.actors)), [2, 1, 0]);
  assert.equal(value(report.transitions[0].conversionPercent), 50);
  assert.equal(value(report.transitions[0].dropOffPercent), 50);
  assert.equal(value(report.transitions[0].attemptConversionPercent), 100 / 3);
  assert.equal(value(report.steps[0].matchedAttempts), 3);
});

test('repeated searches and previews count one actor but separate entry attempts', () => {
  const rows = [observation('catalog_searched', '2026-10-01T12:00:00Z'),
    observation('catalog_searched', '2026-10-01T12:10:00Z'),
    observation('track_preview_started', '2026-10-01T12:20:00Z', 'actor-a', { trackId: 'track-a' }),
    observation('track_preview_started', '2026-10-01T12:30:00Z', 'actor-a', { trackId: 'track-a' })];
  const report = funnel('buyer_discovery', rows);
  assert.deepEqual(report.steps.map(step => value(step.actors)), [1, 1, 0]);
  assert.deepEqual(report.steps.map(step => value(step.matchedAttempts)), [2, 2, 0]);
  assert.deepEqual(report.steps.map(step => value(step.observedEvents)), [2, 2, 0]);
});

test('multiple checkout events remain distinct observations without becoming distinct buyers', () => {
  const select = observation('license_selected', at(1), 'actor-a', { trackId: 'track-a' });
  const checkoutA = observation('checkout_started', '2026-10-01T13:00:00Z', 'actor-a', { trackId: 'track-a', orderId: 'order-a', checkoutAttemptId: 'a' });
  const checkoutB = observation('checkout_started', '2026-10-01T14:00:00Z', 'actor-a', { trackId: 'track-a', orderId: 'order-a', checkoutAttemptId: 'b' });
  const report = funnel('buyer_checkout', [select, checkoutA, checkoutB, checkoutB]);
  assert.equal(value(report.steps[1].actors), 1);
  assert.equal(value(report.steps[1].matchedAttempts), 1);
  assert.equal(value(report.steps[1].observedEvents), 2);
});

test('out-of-order delivery and late arrival use occurrence time, not array order', () => {
  const search = observation('catalog_searched', at(1));
  const preview = observation('track_preview_started', at(2), 'actor-a', { trackId: 'track-a' });
  const select = observation('license_selected', at(3), 'actor-a', { trackId: 'track-a' });
  assert.equal(value(funnel('buyer_discovery', [select, search]).steps[2].actors), 0);
  assert.equal(value(funnel('buyer_discovery', [select, preview, search]).steps[2].actors), 1);
  assert.equal(value(funnel('buyer_discovery', [select, preview, search, select]).steps[2].actors), 1);
});

test('cohort, entry date, environment and test/internal exclusions apply before counting', () => {
  const rows = [observation('catalog_searched', at(1), 'qa', { isTest: true }),
    observation('catalog_searched', at(1), 'staff', { isInternal: true }),
    observation('catalog_searched', at(1), 'buyer'),
    observation('catalog_searched', at(3), 'late'),
    observation('catalog_searched', at(1), 'other-env', { environment: 'production' })];
  assert.equal(value(funnel('buyer_discovery', rows).steps[0].actors), 1);
  assert.equal(value(funnel('buyer_discovery', rows, { cohortActorIds: new Set(['qa']), includeTest: true }).steps[0].actors), 1);
});

test('zero eligible actors, source failure, absent instrumentation and conflict have separate states', () => {
  const zero = funnel('buyer_discovery', []);
  assert.deepEqual(zero.steps[0].actors, { state: 'zero', value: 0 });
  assert.equal(zero.overallConversionPercent.state, 'not_applicable');
  assert.equal(funnel('buyer_discovery', [], { source: 'unavailable_source' }).steps[0].actors.state, 'unavailable_source');
  assert.equal(funnel('buyer_discovery', [], { instrumentedEvents: ['catalog_searched'] }).overallConversionPercent.state, 'unavailable_instrumentation');
  const first = observation('catalog_searched', at(1));
  assert.equal(funnel('buyer_discovery', [first, { ...first, actorId: 'different' }]).overallConversionPercent.state, 'insufficient_evidence');
});

const commerce = (records, extra = {}) => calculateCommerce({ source: 'available', records,
  startInclusive: window.startInclusive, endExclusive: window.endExclusive, paymentMode: 'test', ...extra });
const order = (orderId, currency, amountMinor, extra = {}) => ({ orderId, currency, amountMinor,
  refundedMinor: 0, paidAt: at(1), paymentMode: 'test', verified: true, ...extra });

test('verified commerce includes paid evidence only, dedupes orders and separates refunds', () => {
  const paid = order('order-a', 'USD', 5000, { refundedMinor: 1000 });
  const report = commerce([paid, paid, order('order-b', 'USD', 9999, { verified: false })], { currency: 'USD' });
  assert.equal(value(report.paidOrders), 1);
  assert.equal(value(report.grossMinor), 5000);
  assert.equal(value(report.refundedMinor), 1000);
  assert.equal(value(report.netMinor), 4000);
  assert.equal(report.commissionRevenueMinor.state, 'unavailable_instrumentation');
});

test('multiple currencies are never silently summed; each remains independently available', () => {
  const report = commerce([order('usd', 'USD', 5000), order('eur', 'EUR', 4000)]);
  assert.equal(value(report.paidOrders), 2);
  assert.equal(report.grossMinor.state, 'not_applicable');
  assert.deepEqual(report.byCurrency.map(row => [row.currency, value(row.grossMinor)]), [['EUR', 4000], ['USD', 5000]]);
});

test('empty verified commerce is a legitimate zero for an explicit currency; AOV is not applicable', () => {
  const report = commerce([], { currency: 'USD' });
  assert.equal(report.paidOrders.state, 'zero');
  assert.equal(report.grossMinor.state, 'zero');
  assert.equal(report.averageOrderMinor.state, 'not_applicable');
});

test('failed commerce source and contradictory persisted evidence never appear as zero', () => {
  assert.equal(commerce([], { source: 'unavailable_source' }).paidOrders.state, 'unavailable_source');
  assert.equal(commerce([order('a', 'USD', 5000, { refundedMinor: 6000 })]).paidOrders.state, 'insufficient_evidence');
  assert.equal(commerce([order('a', 'USD', 5000), order('a', 'USD', 6000)]).paidOrders.state, 'insufficient_evidence');
});
