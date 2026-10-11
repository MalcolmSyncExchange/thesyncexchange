import test from 'node:test';
import assert from 'node:assert/strict';
import { createTrustedSignupObservers, STAGING_PROJECT, POSTHOG_PROJECT } from '../scripts/diagnostics/artist-signup-observers.mjs';
import { prepareLocalSignupRunner } from '../scripts/diagnostics/artist-signup-local-runner.mjs';
import { APPROVED_ORIGIN } from '../scripts/diagnostics/artist-signup-browser-driver.mjs';
import { createReadOnlyConnectorTransports } from '../scripts/diagnostics/signup-connector-bridge.mjs';
import { createPrivateSignupBrowser } from '../scripts/diagnostics/signup-private-browser.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const USER = '00000000-0000-4000-8000-000000000001';
const EVENT = '00000000-0000-4000-8000-000000000002';
const OTHER = '00000000-0000-4000-8000-000000000003';
const EMAIL = "private'canary@example.invalid";
const START = '2026-10-11T00:00:00Z';
function fixture(options = {}) {
  const queries = [];
  const state = {
    baseline: { matching_auth: 0, matching_identities: 0, matching_profiles: 0, auth_total: 3, profile_total: 3, outbox_total: 4, signup_total: 0 },
    users: [{ user_id: USER, confirmed: false, identities: 1, sessions: 0 }],
    profiles: [{ canonical_role: 'artist' }],
    outbox: [{ event_id: EVENT, delivered: true, dedupe_valid: true, artist: true, preview: true, is_test: true }],
    events: [{ uuid: EVENT, records: 1, scoped_records: 1 }], ...options
  };
  const transports = {
    supabaseIdentity: async () => ({ id: state.dbProject ?? STAGING_PROJECT }),
    posthogIdentity: async () => ({ id: state.phProject ?? POSTHOG_PROJECT }),
    supabaseQuery: async ({ query, projectId }) => {
      queries.push(query);
      if (state.hang) return new Promise(() => {});
      if (state.dbError) throw Error(EMAIL + ' password-canary');
      const rows = query.includes('AS matching_auth') ? [state.baseline] : query.includes('FROM auth.users u') ? state.users : query.includes('canonical_role') ? state.profiles : state.outbox;
      return { projectId: state.returnedProject ?? projectId, rows };
    },
    posthogQuery: async ({ query, projectId }) => {
      queries.push(query);
      if (state.phError) throw Error('session-token-canary');
      return { projectId, rows: state.events };
    },
    browserSession: async () => state.sessionEvidence
  };
  return { state, transports, queries, observer: createTrustedSignupObservers({ email: EMAIL, startedAt: START, transports, timeoutMs: 30 }) };
}
test('unused baseline and confirmation-pending signup retain independent profile and event evidence', async () => {
  const { observer, queries } = fixture();
  assert.equal((await observer.baseline()).unusedIdentity, true);
  const r = await observer.observe();
  assert.equal(r.confirmed, false);
  assert.equal(r.artistRole, true);
  assert.equal(r.profileCount, 1);
  assert.equal(r.outboxCount, 1);
  assert.equal(r.eventScopeValid, true);
  assert.equal((await observer.delivery()).matched, 1);
  assert.ok(queries.every(q => /^SELECT\b/.test(q)));
  assert.ok(queries[0].includes("private''canary"));
  assert.ok(queries.at(-1).includes('timestamp>='));
  assert.ok(queries.at(-1).includes('timestamp<='));
  assert.ok(!JSON.stringify(r).includes(EMAIL));
  assert.ok(!JSON.stringify(r).includes(USER));
});
test('pre-existing Auth identity, orphan profile, and case-insensitive email each prevent unused status', async () => {
  for (const field of ['matching_auth', 'matching_identities', 'matching_profiles']) {
    const { state, observer } = fixture(); state.baseline[field] = 1;
    assert.equal((await observer.baseline()).unusedIdentity, false);
    assert.equal((await observer.observe()).status, 'unavailable');
  }
});
test('wrong project refuses queries; result project substitution is also rejected', async () => {
  const f = fixture({ dbProject: 'production' });
  assert.equal((await f.observer.baseline()).status, 'unavailable');
  assert.equal(f.queries.length, 0);
  const g = fixture({ returnedProject: 'production' });
  assert.equal((await g.observer.baseline()).status, 'unavailable');
});
test('successful empty reads differ from failed or timed-out observations', async () => {
  const f = fixture({ users: [] }); await f.observer.baseline();
  assert.deepEqual(await f.observer.observe(), { status: 'absent', authCount: 0 });
  f.state.dbError = true;
  assert.deepEqual(await f.observer.observe(), { status: 'unavailable' });
  const g = fixture({ hang: true });
  assert.equal((await g.observer.baseline()).status, 'unavailable');
});
test('wrong canonical role, missing profile, and duplicate outbox records cannot satisfy success', async () => {
  const f = fixture({ profiles: [{ canonical_role: 'buyer' }] }); await f.observer.baseline();
  assert.equal((await f.observer.profileProbe()).canonicalRole, null);
  f.state.profiles = [];
  assert.equal((await f.observer.profileProbe()).persisted, false);
  f.state.outbox.push({ ...f.state.outbox[0], event_id: OTHER });
  assert.equal((await f.observer.observe()).duplicates, true);
  assert.equal((await f.observer.delivery()).status, 'unavailable');
});
test('transport acknowledgement alone is not independently verified delivery', async () => {
  const f = fixture({ events: [] }); await f.observer.baseline(); await f.observer.observe();
  assert.equal((await f.observer.delivery()).status, 'absent');
  f.state.phError = true;
  assert.equal((await f.observer.delivery()).status, 'unavailable');
});
test('a later profile query failure preserves sanitized Auth evidence', async () => {
  const f = fixture(); await f.observer.baseline();
  const original = f.transports.supabaseQuery;
  f.transports.supabaseQuery = async args => {
    if (args.query.includes('canonical_role')) throw Error('PRIVATE-PROFILE-ERROR');
    return original(args);
  };
  const result = await f.observer.observe();
  assert.deepEqual(result, { status: 'unavailable', authCount: 1, identities: 1, confirmed: false, serverSessionCount: 0 });
  assert.ok(!JSON.stringify(result).includes('PRIVATE-PROFILE-ERROR'));
});
test('independent observer rejects wrong analytics project and detects same-UUID or new-UUID duplicate rows', async () => {
  const f = fixture(); await f.observer.baseline(); await f.observer.observe();
  f.state.phProject = 1;
  assert.equal((await f.observer.delivery()).status, 'unavailable');
  f.state.phProject = POSTHOG_PROJECT;
  f.state.events[0].records = 2; f.state.events[0].scoped_records = 2;
  assert.equal((await f.observer.delivery()).duplicates, true);
  f.state.events = [{ uuid: EVENT, records: 1, scoped_records: 1 }, { uuid: OTHER, records: 1, scoped_records: 1 }];
  assert.equal((await f.observer.delivery()).duplicates, true);
});
test('analytics actor scope flags and incomplete pages cannot be mistaken for exact delivery', async () => {
  const f = fixture(); await f.observer.baseline(); await f.observer.observe();
  f.state.events[0].scoped_records = 0;
  assert.equal((await f.observer.delivery()).scopeValid, false);
  f.state.events = Array.from({ length: 100 }, () => ({ uuid: EVENT, records: 1, scoped_records: 1 }));
  assert.equal((await f.observer.delivery()).status, 'unavailable');
});
test('malformed counts and raw secret-bearing errors never leak into observations', async () => {
  const f = fixture(); f.state.baseline.auth_total = null;
  assert.equal((await f.observer.baseline()).status, 'unavailable');
  f.state.baseline.auth_total = 3; await f.observer.baseline();
  f.state.users[0].sessions = -1;
  assert.deepEqual(await f.observer.observe(), { status: 'unavailable' });
  f.state.dbError = true;
  assert.ok(!JSON.stringify(await f.observer.baseline()).includes('canary'));
});
test('session records require an independent server-validated browser identity', async () => {
  const f = fixture(); await f.observer.baseline();
  assert.equal((await f.observer.sessionProbe()).authenticated, false);
  f.state.users[0].sessions = 1;
  assert.equal((await f.observer.sessionProbe()).authenticated, false);
  f.state.sessionEvidence = { authenticated: true, origin: APPROVED_ORIGIN, validatedBy: 'cookie_present', projectId: STAGING_PROJECT, userId: USER };
  assert.equal((await f.observer.sessionProbe()).authenticated, false);
  f.state.sessionEvidence.validatedBy = 'server_get_user';
  assert.equal((await f.observer.sessionProbe()).authenticated, true);
  f.state.sessionEvidence.userId = OTHER;
  assert.equal((await f.observer.sessionProbe()).authenticated, false);
});
test('runner preparation and read-only methods never initialize a browser; approval and gates fail closed', async () => {
  const f = fixture(); let launches = 0;
  const runner = prepareLocalSignupRunner({ fields: { email: EMAIL }, transports: f.transports,
    pageFactory: () => { launches++; throw Error('Must not launch'); }, artifactPath: '/private/tmp/unused-signup-artifact.json', readiness: {} });
  assert.equal((await runner.readBaseline()).status, 'observed');
  await runner.readEvidence(); await runner.readDelivery();
  await assert.rejects(runner.runOnce());
  await assert.rejects(runner.runOnce({ founderAuthorization: 'authorize-one-controlled-staging-artist-signup' }));
  assert.equal(launches, 0);
});
test('connector bridge normalizes actual connector formats and treats format drift as unavailable', async () => {
  const calls = [];
  const bridge = createReadOnlyConnectorTransports({
    supabaseGetProject: async () => ({ content: [{ type: 'text', text: JSON.stringify({ id: STAGING_PROJECT }) }] }),
    supabaseExecuteSql: async args => { calls.push(args); return { content: [{ type: 'text', text: JSON.stringify({ result: '<untrusted-data-abc>\n[{"records":0}]\n</untrusted-data-abc>' }) }] }; },
    posthogExec: async args => { calls.push(args); return { content: [{ type: 'text', text: args.command.includes('project-get') ? 'id: 657650\napi_token: SECRET-CANARY' : '<taxonomy_warnings>Unknown event</taxonomy_warnings>\n\nuuid|records|scoped_records' }] }; }
  });
  assert.equal((await bridge.supabaseIdentity()).id, STAGING_PROJECT);
  assert.equal((await bridge.posthogIdentity()).id, POSTHOG_PROJECT);
  assert.deepEqual((await bridge.supabaseQuery({ projectId: STAGING_PROJECT, query: 'SELECT count(*) AS records FROM auth.users' })).rows, [{ records: 0 }]);
  assert.deepEqual((await bridge.posthogQuery({ projectId: POSTHOG_PROJECT, query: 'SELECT uuid FROM events' })).rows, []);
  await assert.rejects(bridge.supabaseQuery({ projectId: STAGING_PROJECT, query: 'DELETE FROM auth.users' }));
  await assert.rejects(bridge.posthogQuery({ projectId: 1, query: 'SELECT uuid FROM events' }));
  assert.ok(calls.every(c => !JSON.stringify(c).includes('SECRET-CANARY')));
  const bad = createReadOnlyConnectorTransports({ posthogExec: async () => ({ content: [{ type: 'text', text: 'unknown response' }] }) });
  await assert.rejects(bad.posthogIdentity());
  await assert.rejects(bad.posthogQuery({ projectId: POSTHOG_PROJECT, query: 'SELECT uuid FROM events' }));
});

function confirmationPage(onSubmit) {
  const listeners = new Map(); let resolveResponse; let url = APPROVED_ORIGIN + '/signup/artist';
  const request = { url: () => APPROVED_ORIGIN + '/signup/artist', method: () => 'POST' };
  const field = {
    waitFor: async () => {}, isEditable: async () => true, isEnabled: async () => true,
    inputValue: async () => 'artist', evaluate: async () => true, fill: async () => {},
    click: async () => { onSubmit(); listeners.get('request')?.(request); url += '?confirmation=required&email=PRIVATE-CANARY'; resolveResponse({ request: () => request, status: () => 200 }); }
  };
  return { setDefaultTimeout() {}, on: (k, v) => listeners.set(k, v), off: k => listeners.delete(k), route: async () => {},
    locator: () => ({ waitFor: async () => {}, count: async () => 1, locator: () => field }),
    goto: async () => ({ status: () => 200 }), url: () => url,
    waitForResponse: () => new Promise(resolve => { resolveResponse = resolve; }), waitForFunction: async () => {} };
}
test('mock controlled runner is single-use and independent delivery can fail an otherwise passed workflow', async () => {
  for (const delivered of [true, false]) {
    const f = fixture({ events: delivered ? [{ uuid: EVENT, records: 1, scoped_records: 1 }] : [] });
    let submissions = 0;
    const dir = await mkdtemp(join(tmpdir(), 'signup-runner-fixture-'));
    const path = join(dir, 'result.json');
    try {
      const runner = prepareLocalSignupRunner({ fields: { fullName: 'Fixture', email: EMAIL, password: 'PRIVATE-PASSWORD-CANARY' },
        transports: f.transports, pageFactory: async () => ({ page: confirmationPage(() => { submissions++; }), close: async () => {} }), artifactPath: path,
        readiness: Object.fromEntries(['callback', 'recipient', 'quota', 'credentialBinding', 'sourceAttestation', 'observerBridge'].map(k => [k, 'PASS'])) });
      const result = await runner.runOnce({ founderAuthorization: 'authorize-one-controlled-staging-artist-signup' });
      assert.equal(result.workflow.status, 'passed');
      assert.equal(result.evidence.passed, delivered);
      await assert.rejects(runner.runOnce({ founderAuthorization: 'authorize-one-controlled-staging-artist-signup' }));
      assert.equal(submissions, 1);
      const saved = await readFile(path, 'utf8') + await readFile(path + '.observers.json', 'utf8');
      for (const secret of [EMAIL, USER, 'PRIVATE-PASSWORD-CANARY', 'PRIVATE-CANARY']) assert.ok(!saved.includes(secret));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});
test('private browser session bridge uses server getUser, blocks refresh/foreign requests, and never exports cookies', async () => {
  let launches = 0, closes = 0, options, fetched = 0;
  const deps = {
    chromium: { launch: async args => { launches++; assert.equal(args.headless, true); return {
      newContext: async config => { assert.equal(config.serviceWorkers, 'block'); return {
        newPage: async () => ({}), cookies: async () => [{ name: `sb-${STAGING_PROJECT}-auth-token`, value: 'PRIVATE-COOKIE-CANARY' }, { name: 'other', value: 'OTHER-PRIVATE' }]
      }; }, close: async () => { closes++; }
    }; } },
    createServerClient: (origin, key, config) => { options = config; assert.equal(origin, `https://${STAGING_PROJECT}.supabase.co`); assert.equal(key, 'fixture-public-key'); return { auth: { getUser: async () => ({ data: { user: { id: USER, email: EMAIL } }, error: null }) } }; },
    fetch: async (_, init) => { fetched++; assert.equal(init.redirect, 'error'); return {}; }
  };
  const bridge = createPrivateSignupBrowser({ anonKey: 'fixture-public-key', dependencies: deps });
  assert.equal(launches, 0);
  assert.equal((await bridge.browserSession()).authenticated, false);
  const resource = await bridge.pageFactory({ timeoutMs: 100, signal: new AbortController().signal });
  const session = await bridge.browserSession();
  assert.equal(session.userId, USER);
  assert.ok(!JSON.stringify(session).includes(EMAIL));
  assert.ok(!JSON.stringify(session).includes('PRIVATE-COOKIE-CANARY'));
  assert.equal((await options.cookies.getAll()).length, 1);
  assert.throws(() => options.cookies.setAll([]));
  await options.global.fetch(`https://${STAGING_PROJECT}.supabase.co/auth/v1/user`, { method: 'GET' });
  await assert.rejects(options.global.fetch(`https://${STAGING_PROJECT}.supabase.co/auth/v1/token`, { method: 'POST' }));
  await assert.rejects(options.global.fetch('https://production.invalid/auth/v1/user'));
  assert.equal(fetched, 1);
  await resource.close();
  assert.equal(closes, 1);
  assert.equal((await bridge.browserSession()).authenticated, false);
});
