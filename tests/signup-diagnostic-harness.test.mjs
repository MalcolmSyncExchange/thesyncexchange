import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DiagnosticFailure, STEPS, createArtifactWriter, runArtistSignupDiagnostics, safeRoute } from '../scripts/diagnostics/artist-signup-harness.mjs';
import { APPROVED_ORIGIN, createArtistSignupBrowserDriver } from '../scripts/diagnostics/artist-signup-browser-driver.mjs';

const schema = JSON.parse(await readFile(new URL('../scripts/diagnostics/signup-diagnostic.schema.json', import.meta.url), 'utf8'));
function checkSnapshot(value) {
  assert.deepEqual(Object.keys(value).sort(), schema.required.slice().sort());
  for (const [key, definition] of Object.entries(schema.properties)) {
    if (definition.enum) assert.ok(definition.enum.includes(value[key]), key);
    if (definition.type === 'boolean') assert.equal(typeof value[key], 'boolean', key);
  }
  assert.equal(value.schema_version, 1);
  assert.ok(Number.isInteger(value.elapsed_ms) && value.elapsed_ms >= 0);
  assert.ok(value.relevant_http_status === null || (Number.isInteger(value.relevant_http_status) && value.relevant_http_status >= 100 && value.relevant_http_status <= 599));
  assert.ok(value.last_completed_step === null || STEPS.includes(value.last_completed_step));
  assert.ok(value.failed_step === null || STEPS.includes(value.failed_step));
  for (const key of ['console_error_categories', 'network_failure_categories']) {
    assert.equal(new Set(value[key]).size, value[key].length);
    assert.ok(value[key].every(category => schema.properties[key].items.enum.includes(category)));
  }
  assert.ok(value.checkpoints.length <= 13);
  for (const checkpoint of value.checkpoints) {
    assert.deepEqual(Object.keys(checkpoint).sort(), ['elapsed_ms', 'status', 'step']);
    assert.ok(schema.$defs.step.enum.includes(checkpoint.step));
    assert.ok(schema.properties.checkpoints.items.properties.status.enum.includes(checkpoint.status));
    assert.ok(Number.isInteger(checkpoint.elapsed_ms) && checkpoint.elapsed_ms >= 0);
  }
}

function mockDriver(overrides = {}) {
  let signals;
  return {
    initialize: async context => { signals = context.signals; },
    startNavigation: async () => {},
    waitPageLoaded: async () => ({ route: '/signup/artist', httpStatus: 200 }),
    locateForm: async () => {}, waitFormReady: async () => {}, populateFields: async () => {},
    prepareSubmission: async () => {}, submit: async () => { signals.submissionObserved(); },
    waitAuthRequest: async () => ({ visibility: 'trusted_server_observer', observed: true }),
    waitAuthResponse: async () => ({ visibility: 'trusted_server_observer', observed: true, httpStatus: 200 }),
    waitOutcome: async () => ({ route: '/signup/artist?confirmation=required', outcome: 'awaiting_email_confirmation' }),
    verifyProfile: async () => ({ persisted: true, canonicalRole: 'artist' }),
    close: async () => {}, ...overrides
  };
}
async function run(driver, options = {}) {
  const artifacts = [];
  const result = await runArtistSignupDiagnostics({ driver, writeArtifact: async artifact => artifacts.push(artifact), actionTimeoutMs: 200, runTimeoutMs: 3000, ...options });
  artifacts.forEach(checkSnapshot);
  assert.deepEqual(artifacts.at(-1), result);
  return { result, artifacts };
}
const reject = async () => { throw new Error('private account and exception details'); };

for (const [name, method, step, category] of [
  ['navigation failure', 'startNavigation', 'navigation_started', 'navigation_failure'],
  ['form readiness failure', 'waitFormReady', 'form_ready', 'form_readiness_failure'],
  ['field population failure', 'populateFields', 'test_fields_populated', 'field_population_failure'],
  ['submission failure', 'submit', 'submit_completed', 'submission_failure'],
  ['profile reconciliation failure', 'verifyProfile', 'profile_reconciliation_verified', 'profile_reconciliation_failure']
]) {
  test(name, async () => {
    const { result, artifacts } = await run(mockDriver({ [method]: reject }));
    assert.equal(result.status, 'failed'); assert.equal(result.failed_step, step);
    assert.equal(result.failure_category, category); assert.equal(result.exception_category, 'operation_failure');
    assert.equal(result.last_completed_step, STEPS[STEPS.indexOf(step) - 1]);
    assert.equal(result.checkpoints.at(-2).status, 'failed');
    assert.equal(result.checkpoints.at(-1).step, 'final_result_recorded');
    assert.equal(artifacts.some(a => a.checkpoints.at(-1)?.step === step && a.checkpoints.at(-1).status === 'started'), true);
  });
}
test('Auth HTTP rejection is distinct from action POST failure', async () => {
  const { result } = await run(mockDriver({ waitAuthResponse: async () => ({ visibility: 'trusted_server_observer', observed: true, httpStatus: 429 }) }));
  assert.equal(result.failure_category, 'auth_http_failure');
  assert.equal(result.exception_category, 'http_failure'); assert.equal(result.relevant_http_status, 429);
  assert.equal(result.auth_request_observed, true); assert.equal(result.auth_response_observed, true);
});
test('Auth timeout retains request evidence and final artifact', async () => {
  const { result } = await run(mockDriver({ waitAuthResponse: () => new Promise(() => {}) }), { actionTimeoutMs: 15 });
  assert.equal(result.failure_category, 'auth_timeout'); assert.equal(result.exception_category, 'timeout');
  assert.equal(result.failed_step, 'auth_response_observed');
  assert.equal(result.auth_request_observed, true); assert.equal(result.auth_response_observed, false);
});
test('Auth request timeout is distinct from submission timeout', async () => {
  const { result } = await run(mockDriver({ waitAuthRequest: () => new Promise(() => {}) }), { actionTimeoutMs: 15 });
  assert.equal(result.failed_step, 'auth_request_observed');
  assert.equal(result.failure_category, 'auth_timeout');
  assert.equal(result.submission_occurred, true); assert.equal(result.auth_request_observed, false);
});
test('successful signup awaiting confirmation includes every checkpoint', async () => {
  const { result } = await run(mockDriver());
  assert.equal(result.status, 'passed'); assert.equal(result.outcome, 'awaiting_email_confirmation');
  assert.equal(result.route, '/signup/artist'); assert.equal(result.submission_occurred, true);
  assert.deepEqual(result.checkpoints.map(c => c.step), STEPS);
  assert.equal(result.checkpoints.every(c => c.status === 'completed'), true);
});
test('successful authenticated session needs independent session verification', async () => {
  const outcome = { route: '/onboarding/artist', outcome: 'authenticated_session', sessionVerified: true };
  const { result } = await run(mockDriver({ waitOutcome: async () => outcome }));
  assert.equal(result.status, 'passed'); assert.equal(result.outcome, 'authenticated_session');
  const rejected = await run(mockDriver({ waitOutcome: async () => ({ ...outcome, sessionVerified: false }) }));
  assert.equal(rejected.result.failure_category, 'outcome_failure');
});
test('server-side Auth cannot be inferred from a successful browser POST', async () => {
  const unobservable = async () => ({ visibility: 'server_side_unobservable', observed: false });
  const { result } = await run(mockDriver({ waitAuthRequest: unobservable, waitAuthResponse: unobservable }));
  assert.equal(result.status, 'passed'); assert.equal(result.submission_occurred, true);
  assert.equal(result.auth_request_observed, false); assert.equal(result.auth_response_observed, false);
  assert.equal(result.auth_visibility, 'server_side_unobservable');
  assert.equal(result.checkpoints.filter(c => c.status === 'not_observable').length, 2);
});
test('missing or noncanonical profile prevents success', async () => {
  for (const profile of [{ persisted: false, canonicalRole: 'artist' }, { persisted: true, canonicalRole: 'admin' }]) {
    const { result } = await run(mockDriver({ verifyProfile: async () => profile }));
    assert.equal(result.failure_category, 'profile_reconciliation_failure');
  }
});
test('hung initialization writes final failure on disk before bounded cleanup', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'signup-diagnostic-test-'));
  try {
    const path = join(directory, 'failure.json');
    const result = await runArtistSignupDiagnostics({ driver: mockDriver({ initialize: () => new Promise(() => {}), close: reject }), writeArtifact: createArtifactWriter(path), actionTimeoutMs: 15 });
    assert.equal(result.failed_step, 'browser_initialization'); assert.equal(result.exception_category, 'timeout');
    assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), result);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('overall deadline bounds a sequence of individually fast operations', async () => {
  const delay = () => new Promise(resolve => setTimeout(resolve, 10));
  const { result } = await run(mockDriver({ startNavigation: delay, locateForm: delay, waitFormReady: delay }), { actionTimeoutMs: 200, runTimeoutMs: 25 });
  assert.equal(result.status, 'failed'); assert.equal(result.exception_category, 'timeout');
  assert.equal(result.failure_category, 'form_readiness_failure');
});
test('late events after timeout cannot modify the terminal artifact', async () => {
  let signals;
  const { result, artifacts } = await run(mockDriver({
    initialize: async context => { signals = context.signals; },
    submit: () => new Promise(() => {})
  }), { actionTimeoutMs: 15 });
  const terminal = JSON.stringify(result);
  signals.consoleError('javascript_error'); signals.submissionObserved(); signals.authResponseObserved(401);
  assert.equal(JSON.stringify(artifacts.at(-1)), terminal);
});
test('unwritable artifact sink produces only a fixed error and still cleans up', async () => {
  let closed = false;
  await assert.rejects(runArtistSignupDiagnostics({
    driver: mockDriver({ close: async () => { closed = true; } }),
    writeArtifact: async () => { throw new Error('SECRET-CANARY sensitive path'); }
  }), error => error instanceof DiagnosticFailure && error.message === 'Signup diagnostic operation failed');
  assert.equal(closed, true);
});
test('all artifacts exclude malicious exception fields and raw driver data', async () => {
  const canary = 'SECRET-CANARY';
  const { result, artifacts } = await run(mockDriver({
    initialize: async ({ signals }) => {
      signals.consoleError(canary); signals.networkFailure(canary);
      signals.consoleError('hydration_error'); signals.networkFailure('blocked');
    },
    waitPageLoaded: async () => ({ route: `/signup/artist?email=${canary}&token=${canary}`, httpStatus: 200, cookies: canary, headers: canary, body: canary }),
    populateFields: async () => { const error = new Error(`password=${canary}`); error.name = canary; error.stack = canary; throw error; }
  }));
  assert.equal(JSON.stringify(artifacts).includes(canary), false);
  assert.deepEqual(result.console_error_categories, ['hydration_error']);
  assert.deepEqual(result.network_failure_categories, ['blocked']);
  assert.equal(result.route, '/signup/artist');
  assert.equal(safeRoute(`/private/${canary}`), 'other_route');
  assert.equal(new DiagnosticFailure(canary, canary).category, 'harness_failure');
});
test('HTTP navigation error and browser closure use bounded categories', async () => {
  const http = await run(mockDriver({ waitPageLoaded: async () => ({ route: '/signup/artist', httpStatus: 503 }) }));
  assert.equal(http.result.failure_category, 'navigation_failure'); assert.equal(http.result.relevant_http_status, 503);
  const closed = await run(mockDriver({ locateForm: async () => { const error = new Error('secret'); error.name = 'TargetClosedError'; throw error; } }));
  assert.equal(closed.result.exception_category, 'browser_closed');
});

function mockPage({ confirmation = true, responseStatus = 200, editable = true } = {}) {
  const events = new Map(), calls = [];
  let url = `${APPROVED_ORIGIN}/signup/artist`;
  const request = { url: () => `${APPROVED_ORIGIN}/signup/artist`, method: () => 'POST' };
  const response = { request: () => request, status: () => responseStatus };
  let responseWait;
  const field = name => ({
    waitFor: async options => { calls.push(['visible', name, options.timeout]); },
    isEditable: async () => editable, isEnabled: async () => true,
    inputValue: async () => 'artist', evaluate: async () => true,
    fill: async () => { calls.push(['fill', name]); },
    click: async options => {
      calls.push(['click', options.timeout]); assert.ok(responseWait, 'response wait must precede click');
      events.get('request')?.(request);
      url = confirmation ? `${APPROVED_ORIGIN}/signup/artist?confirmation=required&email=PRIVATE` : `${APPROVED_ORIGIN}/onboarding`;
      responseWait(response);
    }
  });
  const form = { waitFor: async () => {}, count: async () => 1, locator: field };
  const page = {
    setDefaultTimeout: value => calls.push(['timeout', value]),
    on: (event, listener) => events.set(event, listener), off: event => events.delete(event),
    route: async (_, handler) => { page.guard = handler; }, locator: () => form,
    goto: async (_, options) => { calls.push(['goto', options]); return { status: () => 200 }; },
    url: () => url,
    waitForResponse: (predicate, options) => {
      calls.push(['responseWait', options.timeout]);
      return new Promise(resolve => { responseWait = value => { assert.equal(predicate(value), true); resolve(value); }; });
    },
    waitForFunction: async (_, __, options) => calls.push(['outcomeWait', options.timeout])
  };
  return { page, calls, events };
}
function browserDriver(mock, options = {}) {
  return createArtistSignupBrowserDriver({ pageFactory: async () => ({ page: mock.page, close: async () => {} }), fields: { fullName: 'Fictional', email: 'fixture@example.invalid', password: 'PRIVATE-PASSWORD' }, profileProbe: async () => ({ persisted: true, canonicalRole: 'artist' }), sessionProbe: async () => ({ authenticated: true }), ...options });
}
test('browser adapter uses deterministic bounded waits and recognizes confirmation', async () => {
  const mock = mockPage();
  const { result } = await run(browserDriver(mock));
  assert.equal(result.status, 'passed'); assert.equal(result.outcome, 'awaiting_email_confirmation');
  assert.equal(result.auth_visibility, 'server_side_unobservable');
  assert.equal(mock.calls.find(c => c[0] === 'goto')[1].waitUntil, 'domcontentloaded');
  assert.equal(mock.calls.some(c => JSON.stringify(c).includes('networkidle')), false);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('browser adapter rejects noneditable forms and HTTP action failures', async () => {
  const form = await run(browserDriver(mockPage({ editable: false })));
  assert.equal(form.result.failure_category, 'form_readiness_failure'); assert.equal(form.result.submit_initiated, false);
  const action = await run(browserDriver(mockPage({ responseStatus: 500 })));
  assert.equal(action.result.failure_category, 'submission_failure'); assert.equal(action.result.submission_occurred, true);
  assert.equal(action.result.relevant_http_status, 500);
});
test('browser adapter checks authenticated session and persisted canonical role', async () => {
  const { result } = await run(browserDriver(mockPage({ confirmation: false })));
  assert.equal(result.status, 'passed'); assert.equal(result.outcome, 'authenticated_session');
});
test('browser adapter observes only sanitized trusted server Auth evidence', async () => {
  const observer = { start: async () => {}, waitRequest: async () => ({ observed: true, body: 'PRIVATE' }), waitResponse: async () => ({ observed: true, httpStatus: 422, headers: 'PRIVATE' }) };
  const { result } = await run(browserDriver(mockPage(), { serverAuthObserver: observer }));
  assert.equal(result.failure_category, 'auth_http_failure'); assert.equal(result.relevant_http_status, 422);
  assert.equal(JSON.stringify(result).includes('PRIVATE'), false);
});
test('partial Auth evidence survives a stalled action submission', async () => {
  const mock = mockPage();
  mock.page.waitForResponse = () => new Promise(() => {});
  const observer = { start: async ({ onRequestObserved }) => { mock.events.set('request', () => onRequestObserved()); } };
  // Avoid the mock's response assertion and emit only the server observation.
  const oldLocator = mock.page.locator;
  mock.page.locator = (...args) => {
    const form = oldLocator(...args), old = form.locator;
    form.locator = name => name === 'button[type="submit"]' ? {
      waitFor: async () => {}, isEnabled: async () => true,
      click: async () => { mock.events.get('request')(); }
    } : old(name);
    return form;
  };
  const { result } = await run(browserDriver(mock, { serverAuthObserver: observer }), { actionTimeoutMs: 15 });
  assert.equal(result.failure_category, 'submission_failure');
  assert.equal(result.exception_category, 'timeout'); assert.equal(result.auth_request_observed, true);
  assert.equal(result.auth_response_observed, false);
});
test('browser network guard blocks analytics, production targets and unrelated mutations', async () => {
  const mock = mockPage(); const driver = browserDriver(mock);
  const categories = [];
  await driver.initialize({ signal: new AbortController().signal, timeoutMs: 100, signals: { consoleError: c => categories.push(c), networkFailure: c => categories.push(c), submissionObserved: () => {} } });
  const attempt = async (url, method) => {
    let decision;
    await mock.page.guard({ request: () => ({ url: () => url, method: () => method }), abort: async () => { decision = 'abort'; }, continue: async () => { decision = 'continue'; } });
    return decision;
  };
  assert.equal(await attempt(`${APPROVED_ORIGIN}/api/analytics`, 'POST'), 'abort');
  assert.equal(await attempt('https://production.supabase.co/auth/v1/signup', 'POST'), 'abort');
  assert.equal(await attempt(`${APPROVED_ORIGIN}/api/checkout`, 'POST'), 'abort');
  assert.equal(await attempt(`${APPROVED_ORIGIN}/signup/artist`, 'POST'), 'continue');
  assert.equal(await attempt(`${APPROVED_ORIGIN}/signup/artist`, 'GET'), 'continue');
  mock.events.get('console')({ type: () => 'error', text: () => 'Hydration SECRET-CANARY' });
  mock.events.get('requestfailed')({ failure: () => ({ errorText: 'net::ERR_CONNECTION_REFUSED SECRET-CANARY' }) });
  assert.deepEqual(categories, ['hydration_error', 'connection_failed']);
  await driver.close();
});
