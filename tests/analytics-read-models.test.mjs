import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSECReadModels } from '../lib/analytics/intelligence/read-models.ts';
import { timeBuckets, previousPeriod } from '../lib/analytics/intelligence/time.ts';
import { readAnalyticsSource, SOURCE_ROW_LIMIT } from '../lib/analytics/intelligence/source-reader.ts';
import { eventSchemas } from '../lib/analytics/schema.ts';
import fs from 'node:fs';
const range = { startInclusive: '2026-10-01T00:00:00Z', endExclusive: '2026-10-03T00:00:00Z' };
const request = { range, environment: 'preview', timezone: 'UTC', granularity: 'day', now: new Date('2026-10-12T00:00:00Z'), maxStepLagMs: 86400000, comparePrevious: true };
const source = (observations = [], extra = {}) => ({ state: 'available', type: 'fixture', observations,
  instrumentedEvents: Object.keys(eventSchemas), queriedRange: { startInclusive: '2026-09-01T00:00:00Z', endExclusive: '2026-10-10T00:00:00Z' },
  observedThrough: '2026-10-10T00:00:00Z', coverageVerified: true, lastUpdatedAt: null, ...extra });
let seq = 0;
const event = (name, hour, role = 'buyer', extra = {}) => ({ eventId: `event-${++seq}`, actorId: 'private-actor', actorRole: role, event: name,
  occurredAt: new Date(Date.parse(range.startInclusive) + hour * 3600000).toISOString(), environment: 'preview', isTest: false, isInternal: false, ...extra });
const model = (rows = [], extra = {}, req = {}) => buildSECReadModels(source(rows, extra), { ...request, ...req });
const metric = (report, id) => report.marketplace.find(card => card.id === id).metric;
const funnel = (report, id) => report.funnels.find(funnel => funnel.id === id).report;
const artist = () => ['signup_completed','onboarding_started','onboarding_completed','submission_started','submission_completed'].map((name, i) => event(name, i + 1, 'artist', { submissionAttemptId: 's', isResubmission: false }));
const buyer = () => ['catalog_searched','track_preview_started','license_selected','checkout_started','purchase_verified'].map((name, i) => event(name, i + 1, 'buyer', { trackId: name === 'catalog_searched' ? undefined : 'track', orderId: i >= 3 ? 'order' : undefined }));
test('complete artist onboarding, first submission and submission duration', () => {
  const report = model(artist());
  assert.equal(funnel(report, 'artist_first_submission').overallConversionPercent.value, 100);
  assert.equal(funnel(report, 'artist_first_submission').completionMedianSeconds.value, 14400);
  assert.equal(funnel(report, 'artist_submission').completionMedianSeconds.value, 3600);
});
test('complete buyer discovery and verified checkout', () => {
  const report = model(buyer());
  assert.equal(funnel(report, 'buyer_discovery').overallConversionPercent.value, 100);
  assert.equal(funnel(report, 'buyer_checkout').completionMedianSeconds.value, 7200);
});
test('partial conversion never infers missing preview', () => {
  const report = model([event('catalog_searched', 1), event('license_selected', 2)]);
  assert.equal(funnel(report, 'buyer_discovery').steps[1].actors.value, 0);
  assert.equal(funnel(report, 'buyer_discovery').transitions[0].dropOffPercent.value, 100);
});
test('repeat engagement requires multiple observed activities and active excludes signup only', () => {
  const report = model([event('signup_completed', 1, 'artist'), event('catalog_searched', 1), event('catalog_searched', 2)]);
  assert.equal(metric(report, 'active_artists').value, 0);
  assert.equal(metric(report, 'active_buyers').value, 1);
  assert.equal(metric(report, 'repeat_buyers').value, 1);
});
test('multiple checkout attempts and resubmissions count raw attempts separately', () => {
  const rows = buyer(); rows.push(event('checkout_started', 4.5, 'buyer', { trackId:'track', orderId:'order', checkoutAttemptId:'second' }));
  rows.push(event('submission_completed', 3, 'artist', { isResubmission:true }));
  const report = model(rows);
  assert.equal(metric(report, 'checkout_started').value, 2);
  assert.equal(metric(report, 'resubmissions').value, 1);
  assert.equal(funnel(report, 'buyer_checkout').steps[1].matchedAttempts.value, 1);
});
test('duplicate event IDs deduplicate and conflicts invalidate aggregate evidence', () => {
  const row = event('catalog_searched', 1);
  assert.equal(metric(model([row,row]), 'catalog_searched').value, 1);
  assert.equal(metric(model([row,{...row,actorId:'other'}]), 'catalog_searched').state, 'insufficient_evidence');
});
test('out of order ingestion is occurrence ordered', () => assert.equal(funnel(model(buyer().reverse()), 'buyer_checkout').overallConversionPercent.value, 100));
test('late arriving event can complete cohort after entry range', () => {
  const rows = buyer(); rows[4].occurredAt = '2026-10-03T03:00:00Z';
  const report = model(rows, {}, { maxStepLagMs:3*86400000 });
  assert.equal(funnel(report, 'buyer_checkout').steps[2].actors.value, 1);
  assert.equal(metric(report, 'purchase_verified').value, 0);
});
test('continuous dates preserve zero buckets', () => {
  const report = model([event('catalog_searched',1)]);
  assert.equal(report.series.length, 2);
  assert.equal(report.series[1].metrics.find(card => card.id === 'catalog_searched').metric.state, 'zero');
});
test('hourly half-open aggregation and daily buckets', () => {
  const report = model([event('catalog_searched',1)], {}, { granularity:'hour' });
  assert.equal(report.series.length,48);
  assert.equal(report.series[0].metrics.find(card => card.id === 'catalog_searched').metric.value,0);
  assert.equal(report.series[1].metrics.find(card => card.id === 'catalog_searched').metric.value,1);
});
test('timezone midnight uses Phoenix date boundary', () => {
  const buckets = timeBuckets(range,'day','America/Phoenix');
  assert.equal(buckets.length,3);
  assert.equal(buckets[0].endExclusive,'2026-10-01T07:00:00.000Z');
});
test('DST days and repeated hours are continuous in UTC', () => {
  const fall = { startInclusive:'2026-11-01T04:00:00Z', endExclusive:'2026-11-02T05:00:00Z' };
  assert.equal(timeBuckets(fall,'day','America/New_York').length,1);
  assert.equal(timeBuckets(fall,'hour','America/New_York').length,25);
  const spring = { startInclusive:'2026-03-08T05:00:00Z', endExclusive:'2026-03-09T04:00:00Z' };
  assert.equal(timeBuckets(spring,'day','America/New_York').length,1);
  assert.equal(timeBuckets(spring,'hour','America/New_York').length,23);
});
test('weekly Monday and calendar month boundaries', () => {
  assert.equal(timeBuckets(range,'week','UTC').length,1);
  const month = { startInclusive:'2026-01-30T00:00:00Z',endExclusive:'2026-03-02T00:00:00Z' };
  assert.equal(timeBuckets(month,'month','UTC').length,3);
});
test('previous-period comparison has exact matching duration and independent evidence', () => {
  assert.deepEqual(previousPeriod(range), { startInclusive:'2026-09-29T00:00:00.000Z', endExclusive:'2026-10-01T00:00:00.000Z' });
  const report = model([event('catalog_searched',-1),event('catalog_searched',1)]);
  assert.equal(report.marketplace.find(card => card.id==='catalog_searched').comparison.metric.value,1);
  assert.equal(metric(report,'catalog_searched').value,1);
});
test('zero activity leaves conversion not applicable', () => {
  assert.equal(metric(model(),'active_buyers').state,'zero');
  assert.equal(funnel(model(),'buyer_checkout').overallConversionPercent.state,'not_applicable');
});
test('source failure buckets and metrics remain unavailable', () => {
  const report = model([], { state:'unavailable_source' });
  assert.equal(report.series[0].metrics[0].metric.state,'unavailable_source');
  assert.equal(report.funnels[0].coverage.finalized,false);
});
test('missing instrumentation distinct from unavailable source', () => {
  const report = model([], { instrumentedEvents:[] });
  assert.equal(metric(report,'catalog_searched').state,'unavailable_instrumentation');
  assert.equal(funnel(report,'buyer_discovery').overallConversionPercent.state,'unavailable_instrumentation');
});
test('closed date range never finalizes incomplete delivery coverage', () => {
  const report = model([], { coverageVerified:false });
  assert.equal(report.funnels[0].coverage.finalized,false);
  assert.ok(report.funnels[0].coverage.states.includes('source_coverage_incomplete'));
});
test('verified watermark and elapsed follow-up plus allowance finalize coverage', () => assert.equal(model().funnels[0].coverage.finalized,true));
test('follow-up window remains provisional before deadline even when entry window closed', () => {
  assert.equal(model([],{}, { now:new Date('2026-10-04T00:00:00Z') }).funnels.find(item => item.id === 'buyer_checkout').coverage.finalized,false);
});
test('named actor cohort filters totals without exposing membership', () => {
  const report = model([event('catalog_searched',1),event('catalog_searched',2,'buyer',{actorId:'excluded'})], {}, { cohortActorIds:new Set(['private-actor']) });
  assert.equal(metric(report,'catalog_searched').value,1);
  assert.ok(!JSON.stringify(report).includes('private-actor'));
});
test('privacy-safe aggregates omit actor/order/event payloads, tests and internal actors', () => {
  const rows = buyer(); rows.push(event('catalog_searched',1,'buyer',{isTest:true}));
  const report = model(rows);
  const json = JSON.stringify(report);
  for (const key of ['actorId','orderId','eventId','properties','private-actor']) assert.ok(!json.includes(key));
  assert.equal(metric(report,'catalog_searched').value,1);
  assert.equal(report.tracks.length,1);
});
const deps = (authorizeAdmin, read = async () => ({ rows:[],error:false })) => ({ authorizeAdmin:async()=>authorizeAdmin, openReader:()=>read });
test('unauthorized access rejects before opening privileged client', async () => {
  let opened = false;
  await assert.rejects(readAnalyticsSource({ authorizeAdmin:async()=>false,openReader:()=>{opened=true;} },range,'preview',[]),/admin_required/);
  assert.equal(opened,false);
});
test('bounded date enforcement occurs before privileged read', async () => {
  await assert.rejects(readAnalyticsSource(deps(true),{...range,endExclusive:'2027-10-01'},'preview',[]),/invalid_range/);
  assert.throws(()=>model([],{}, { maxStepLagMs:Infinity }),/invalid_observation_window/);
});
test('source empty success distinct from query failure and thrown errors', async () => {
  assert.equal((await readAnalyticsSource(deps(true),range,'preview',[])).state,'available');
  assert.equal((await readAnalyticsSource(deps(true,async()=>({rows:null,error:true})),range,'preview',[])).state,'unavailable_source');
  assert.equal((await readAnalyticsSource(deps(true,async()=>{throw Error('secret');}),range,'preview',[])).state,'unavailable_source');
});
const rawRow = index => ({ id:`00000000-0000-4000-8000-${String(index).padStart(12,'0')}`, actor_id:'00000000-0000-4000-8000-000000000001',actor_role:'buyer',
  event:'catalog_searched',occurred_at:'2026-10-01T01:00:00Z',environment:'preview',is_test:false,is_internal:false,delivery_status:'pending',
  properties:{search_id:'00000000-0000-4000-8000-000000000002',result_count:0,has_query:false,filter_count:0,filter_types:[],sort:'featured'} });
test('pagination uses explicit limit, sentinel and fails closed on truncation', async () => {
  let calls=0;
  const read = async q => { calls++; assert.equal(q.limit,500); return { rows:Array.from({length:500},(_,i)=>rawRow(q.offset+i+1)),error:false }; };
  const result = await readAnalyticsSource(deps(true,read),range,'preview',Object.keys(eventSchemas));
  assert.equal(result.state,'insufficient_evidence'); assert.equal(result.observations.length,0); assert.equal(calls,SOURCE_ROW_LIMIT/500+1);
});
test('malformed source records fail closed and pending local records do not imply verified watermark', async () => {
  const result = await readAnalyticsSource(deps(true,async()=>({rows:[rawRow(1)],error:false})),range,'preview',Object.keys(eventSchemas));
  assert.equal(result.state,'available'); assert.equal(result.coverageVerified,false); assert.equal(result.delivery.pending,1);
  assert.equal((await readAnalyticsSource(deps(true,async()=>({rows:[{}],error:false})),range,'preview',[])).state,'insufficient_evidence');
});
test('server adapter uses canonical authorization, service-only import and stable bounded query', () => {
  const text = fs.readFileSync(new URL('../services/analytics/read-models.ts',import.meta.url),'utf8');
  assert.match(text,/import "server-only"/); assert.match(text,/getAnalyticsActor\(\)/); assert.match(text,/role === "admin"/);
  assert.match(text,/\.gte\("occurred_at"/); assert.match(text,/\.lt\("occurred_at"/); assert.match(text,/\.order\("id"/); assert.match(text,/\.range\(/); assert.match(text,/AbortSignal.timeout/);
});
test('missing instrumentation cannot finalize metric or funnel', () => {
  const report = model([], { instrumentedEvents:[] });
  assert.equal(report.marketplace[0].coverage.finalized,false);
  assert.equal(report.funnels[0].coverage.finalized,false);
});
test('comparison outside queried range and truncated follow-up never imply zero', () => {
  const report = model([], { queriedRange:range });
  assert.equal(report.marketplace[0].comparison.metric.state,'insufficient_evidence');
  assert.equal(funnel(report,'buyer_checkout').overallConversionPercent.state,'insufficient_evidence');
});
test('result cap and invalid timezone fail explicitly', () => {
  assert.equal(metric(model(Array.from({length:10001},()=>event('catalog_searched',1))),'catalog_searched').state,'insufficient_evidence');
  assert.throws(()=>model([],{}, {timezone:'Not/A_Zone'}),RangeError);
});
test('health cards identify the actual query window rather than selected cohort window', () => {
  const report = model([], { delivery:{pending:3} });
  assert.deepEqual(report.eventHealth[0].range,source().queriedRange);
  assert.equal(report.eventHealth[0].metric.value,3);
});
test('previous-only track remains visible with zero current engagement', () => {
  const report = model([event('track_preview_started',-1,'buyer',{trackId:'previous-track'})]);
  assert.equal(report.tracks[0].trackId,'previous-track');
  assert.equal(report.tracks[0].metrics.find(card=>card.id==='track.track_preview_started').metric.value,0);
  assert.equal(report.tracks[0].metrics.find(card=>card.id==='track.track_preview_started').comparison.metric.value,1);
});
