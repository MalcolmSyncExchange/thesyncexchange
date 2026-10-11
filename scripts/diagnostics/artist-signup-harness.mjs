import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';

export const STEPS = Object.freeze([
  'browser_initialization', 'navigation_started', 'signup_page_loaded',
  'form_located', 'form_ready', 'test_fields_populated', 'submit_initiated',
  'submit_completed', 'auth_request_observed', 'auth_response_observed',
  'navigation_or_confirmation_outcome_observed', 'profile_reconciliation_verified',
  'final_result_recorded'
]);
const ROUTES = new Set(['/signup/artist', '/onboarding', '/onboarding/artist', '/artist/dashboard', '/auth/confirm', '/login']);
const CONSOLE = new Set(['javascript_error', 'hydration_error', 'resource_load_error', 'other_console_error']);
const NETWORK = new Set(['aborted', 'timeout', 'connection_failed', 'blocked', 'other_network_failure']);
const FAILURES = new Set(['navigation_failure', 'form_readiness_failure', 'field_population_failure', 'submission_failure', 'auth_http_failure', 'auth_timeout', 'profile_reconciliation_failure', 'browser_initialization_failure', 'outcome_failure', 'harness_failure']);
const EXCEPTIONS = new Set(['timeout', 'browser_closed', 'http_failure', 'assertion_failure', 'operation_failure']);

// Error messages, stacks, URLs, and arbitrary driver fields never enter the artifact.
export class DiagnosticFailure extends Error {
  constructor(category, exceptionCategory = 'assertion_failure') {
    super('Signup diagnostic operation failed');
    this.category = FAILURES.has(category) ? category : 'harness_failure';
    this.exceptionCategory = EXCEPTIONS.has(exceptionCategory) ? exceptionCategory : 'operation_failure';
  }
}
export function safeRoute(value) {
  try {
    const path = new URL(value, 'https://diagnostic.invalid').pathname;
    return ROUTES.has(path) ? path : 'other_route';
  } catch { return 'unknown'; }
}
const safeStatus = value => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
const failureForStep = step => ({
  browser_initialization: 'browser_initialization_failure',
  navigation_started: 'navigation_failure', signup_page_loaded: 'navigation_failure',
  form_located: 'form_readiness_failure', form_ready: 'form_readiness_failure',
  test_fields_populated: 'field_population_failure', submit_initiated: 'submission_failure',
  submit_completed: 'submission_failure', auth_request_observed: 'auth_timeout',
  auth_response_observed: 'auth_timeout', navigation_or_confirmation_outcome_observed: 'outcome_failure',
  profile_reconciliation_verified: 'profile_reconciliation_failure'
})[step] || 'harness_failure';

export function createArtifactWriter(path) {
  // Atomic replacement leaves the last complete snapshot if the process is interrupted.
  return async artifact => {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const temporary = `${path}.partial`;
    await writeFile(temporary, JSON.stringify(artifact, null, 2) + '\n', { mode: 0o600, flag: 'w' });
    await rename(temporary, path);
  };
}

/** No browser, credentials, database client, or live execution entrypoint is created here. */
export async function runArtistSignupDiagnostics({ driver, writeArtifact, actionTimeoutMs = 5000, runTimeoutMs = 60000 }) {
  if (typeof writeArtifact !== 'function' || !driver || !Number.isFinite(actionTimeoutMs) || actionTimeoutMs <= 0 || !Number.isFinite(runTimeoutMs) || runTimeoutMs <= 0) {
    throw new DiagnosticFailure('harness_failure');
  }
  const started = performance.now();
  const controller = new AbortController();
  let activeStep = 'browser_initialization';
  let finalized = false;
  const state = {
    schema_version: 1, status: 'running', outcome: null, failure_category: null,
    last_completed_step: null, failed_step: null, exception_category: null, elapsed_ms: 0,
    route: 'unknown', relevant_http_status: null, submit_initiated: false,
    submission_occurred: false, auth_request_observed: false, auth_response_observed: false,
    auth_visibility: 'unknown', console_error_categories: [], network_failure_categories: [],
    checkpoints: []
  };
  const save = async () => {
    state.elapsed_ms = Math.max(0, Math.round(performance.now() - started));
    // Only this closed, internally constructed schema is serialized.
    try { await writeArtifact(structuredClone(state)); }
    catch { throw new DiagnosticFailure('harness_failure', 'operation_failure'); }
  };
  const record = (list, allowed, category) => {
    if (!finalized && allowed.has(category) && !state[list].includes(category)) state[list].push(category);
  };
  const signals = Object.freeze({
    consoleError: category => record('console_error_categories', CONSOLE, category),
    networkFailure: category => record('network_failure_categories', NETWORK, category),
    submissionObserved: () => { if (!finalized && state.submit_initiated) state.submission_occurred = true; },
    submissionResponseObserved: status => { if (!finalized && state.submit_initiated) state.relevant_http_status = safeStatus(status); },
    authRequestObserved: () => {
      if (!finalized && state.submit_initiated) {
        state.auth_request_observed = true;
        state.auth_visibility = 'trusted_server_observer';
      }
    },
    authResponseObserved: status => {
      if (!finalized && state.submit_initiated) {
        state.auth_response_observed = true;
        state.auth_visibility = 'trusted_server_observer';
        state.relevant_http_status = safeStatus(status);
      }
    }
  });
  async function step(name, operation, consume = () => {}) {
    activeStep = name;
    state.checkpoints.push({ step: name, status: 'started', elapsed_ms: Math.round(performance.now() - started) });
    await save();
    const remaining = runTimeoutMs - (performance.now() - started);
    const timeoutMs = Math.max(1, Math.min(actionTimeoutMs, remaining));
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new DiagnosticFailure(failureForStep(name), 'timeout')), timeoutMs);
    });
    let result;
    try {
      result = await Promise.race([
        Promise.resolve().then(() => operation({ timeoutMs, signal: controller.signal, signals })), timeout
      ]);
      if (performance.now() - started > runTimeoutMs) throw new DiagnosticFailure(failureForStep(name), 'timeout');
      consume(result);
    } finally { clearTimeout(timer); }
    const observedStep = name === 'auth_request_observed' || name === 'auth_response_observed';
    const notObservable = observedStep && state.auth_visibility === 'server_side_unobservable';
    state.checkpoints.at(-1).status = notObservable ? 'not_observable' : 'completed';
    if (!notObservable) state.last_completed_step = name;
    await save();
  }
  const consumeAuth = (response, kind) => {
    if (response?.visibility === 'server_side_unobservable') {
      // Never label a Next.js action POST as a server-side Supabase Auth request.
      state.auth_visibility = 'server_side_unobservable';
      return;
    }
    if (!['browser', 'trusted_server_observer'].includes(response?.visibility) || response?.observed !== true) {
      throw new DiagnosticFailure('auth_timeout', 'timeout');
    }
    state.auth_visibility = response.visibility;
    state[`auth_${kind}_observed`] = true;
    if (kind === 'response') {
      state.relevant_http_status = safeStatus(response.httpStatus);
      if (state.relevant_http_status === null) throw new DiagnosticFailure('harness_failure');
      if (state.relevant_http_status >= 400) throw new DiagnosticFailure('auth_http_failure', 'http_failure');
    }
  };
  try {
    await save();
    await step('browser_initialization', context => driver.initialize(context));
    await step('navigation_started', context => driver.startNavigation(context));
    await step('signup_page_loaded', context => driver.waitPageLoaded(context), response => {
      state.route = safeRoute(response?.route);
      state.relevant_http_status = safeStatus(response?.httpStatus);
      if (state.route !== '/signup/artist' || state.relevant_http_status === null || state.relevant_http_status >= 400) {
        throw new DiagnosticFailure('navigation_failure', 'http_failure');
      }
    });
    await step('form_located', context => driver.locateForm(context));
    await step('form_ready', context => driver.waitFormReady(context));
    await step('test_fields_populated', context => driver.populateFields(context));
    await step('submit_initiated', async context => {
      await driver.prepareSubmission(context);
      state.submit_initiated = true;
    });
    await step('submit_completed', context => driver.submit(context));
    await step('auth_request_observed', context => driver.waitAuthRequest(context), response => consumeAuth(response, 'request'));
    await step('auth_response_observed', context => driver.waitAuthResponse(context), response => consumeAuth(response, 'response'));
    await step('navigation_or_confirmation_outcome_observed', context => driver.waitOutcome(context), response => {
      state.route = safeRoute(response?.route);
      if (!['awaiting_email_confirmation', 'authenticated_session'].includes(response?.outcome)) throw new DiagnosticFailure('outcome_failure');
      if (response.outcome === 'authenticated_session' && response.sessionVerified !== true) throw new DiagnosticFailure('outcome_failure');
      state.outcome = response.outcome;
    });
    await step('profile_reconciliation_verified', context => driver.verifyProfile(context), response => {
      if (response?.persisted !== true || response?.canonicalRole !== 'artist') throw new DiagnosticFailure('profile_reconciliation_failure');
    });
    state.status = 'passed';
  } catch (error) {
    state.status = 'failed';
    state.failed_step = activeStep;
    state.failure_category = error instanceof DiagnosticFailure ? error.category : failureForStep(activeStep);
    state.exception_category = error instanceof DiagnosticFailure ? error.exceptionCategory : error?.name === 'TimeoutError' ? 'timeout' : error?.name === 'TargetClosedError' ? 'browser_closed' : 'operation_failure';
    if (state.checkpoints.at(-1)?.status === 'started') state.checkpoints.at(-1).status = 'failed';
  } finally {
    finalized = true;
    controller.abort();
    // Save BEFORE cleanup: a stuck/closed browser cannot suppress failure evidence.
    state.checkpoints.push({ step: 'final_result_recorded', status: 'completed', elapsed_ms: Math.round(performance.now() - started) });
    try {
      await save();
    } finally {
      // Preserve last_completed_step as the workflow step before failure.
      let cleanupTimer;
      try {
        await Promise.race([Promise.resolve().then(() => driver.close?.()), new Promise(resolve => { cleanupTimer = setTimeout(resolve, 1000); })]);
      } catch { /* Cleanup errors cannot replace the diagnostic result. */ }
      finally { clearTimeout(cleanupTimer); }
    }
  }
  return structuredClone(state);
}
