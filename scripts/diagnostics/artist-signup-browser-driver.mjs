import { DiagnosticFailure } from './artist-signup-harness.mjs';

export const APPROVED_ORIGIN = 'https://6acb04b41c6d687bbab9c19f--sync-exchange-posthog-staging.netlify.app';
const AUTH_ORIGIN = 'https://oppijylbkcbiqfuvckgj.supabase.co';

function consoleCategory(message) {
  if (/hydration|hydrating/i.test(message)) return 'hydration_error';
  if (/failed to load resource/i.test(message)) return 'resource_load_error';
  return 'other_console_error';
}
function networkCategory(message) {
  if (/ERR_ABORTED/i.test(message)) return 'aborted';
  if (/TIMED_OUT/i.test(message)) return 'timeout';
  if (/CONNECTION|NAME_NOT_RESOLVED/i.test(message)) return 'connection_failed';
  if (/BLOCKED/i.test(message)) return 'blocked';
  return 'other_network_failure';
}

/**
 * Dependency-injected Playwright adapter; intentionally has no launch/CLI entrypoint.
 * Phase 1 tests inject mock pages. Live use requires separate founder authorization.
 * Browser-only observation cannot see this app's server-to-server Auth calls.
 */
export function createArtistSignupBrowserDriver({ pageFactory, fields, profileProbe, sessionProbe, serverAuthObserver }) {
  let page, resource, navigation, form;
  let signals;
  const listeners = [];
  const listen = (event, callback) => { page.on(event, callback); listeners.push([event, callback]); };
  const input = name => form.locator(`input[name="${name}"]`);
  const isAction = request => {
    const url = new URL(request.url());
    return url.origin === APPROVED_ORIGIN && url.pathname === '/signup/artist' && request.method() === 'POST';
  };
  return {
    async initialize(context) {
      signals = context.signals;
      resource = await pageFactory({ signal: context.signal, timeoutMs: context.timeoutMs });
      if (context.signal.aborted) { await resource.close?.(); return; }
      page = resource.page;
      page.setDefaultTimeout(context.timeoutMs);
      listen('console', message => { if (message.type() === 'error') signals.consoleError(consoleCategory(message.text())); });
      listen('pageerror', () => signals.consoleError('javascript_error'));
      listen('requestfailed', request => signals.networkFailure(networkCategory(request.failure()?.errorText || '')));
      listen('request', request => { if (isAction(request)) signals.submissionObserved(); });
      // No analytics delivery, unrelated mutations, or production Supabase access.
      await page.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname === '/api/analytics' || url.hostname.endsWith('.posthog.com')) return route.abort();
        if (![APPROVED_ORIGIN, AUTH_ORIGIN].includes(url.origin)) return route.abort();
        if (!['GET', 'HEAD'].includes(request.method()) && !isAction(request)) return route.abort();
        return route.continue();
      });
    },
    async startNavigation({ timeoutMs }) {
      navigation = await page.goto(`${APPROVED_ORIGIN}/signup/artist`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    },
    async waitPageLoaded() { return { route: page.url(), httpStatus: navigation?.status() }; },
    async locateForm({ timeoutMs }) {
      form = page.locator('form:has(input[name="fullName"])');
      await form.waitFor({ state: 'visible', timeout: timeoutMs });
      if (await form.count() !== 1) throw new DiagnosticFailure('form_readiness_failure');
    },
    async waitFormReady({ timeoutMs }) {
      for (const name of ['fullName', 'email', 'password']) {
        const field = input(name);
        await field.waitFor({ state: 'visible', timeout: timeoutMs });
        if (!(await field.isEditable())) throw new DiagnosticFailure('form_readiness_failure');
      }
      const submit = form.locator('button[type="submit"]');
      await submit.waitFor({ state: 'visible', timeout: timeoutMs });
      if (!(await submit.isEnabled()) || await input('role').inputValue() !== 'artist') throw new DiagnosticFailure('form_readiness_failure');
    },
    async populateFields({ timeoutMs }) {
      for (const name of ['fullName', 'email', 'password']) {
        if (typeof fields?.[name] !== 'string' || !fields[name]) throw new DiagnosticFailure('field_population_failure');
        await input(name).fill(fields[name], { timeout: timeoutMs });
        if (!(await input(name).evaluate(element => element.checkValidity()))) throw new DiagnosticFailure('field_population_failure');
      }
    },
    async prepareSubmission({ signal, timeoutMs }) {
      // Observer must collect evidence before click, using read-only diagnostics.
      await serverAuthObserver?.start?.({ signal, timeoutMs,
        onRequestObserved: signals.authRequestObserved,
        onResponseObserved: signals.authResponseObserved });
    },
    async submit({ timeoutMs }) {
      // Register response wait before click. Never use networkidle or dump bodies.
      const response = page.waitForResponse(value => isAction(value.request()), { timeout: timeoutMs });
      const [result] = await Promise.all([response, form.locator('button[type="submit"]').click({ timeout: timeoutMs })]);
      signals.submissionResponseObserved(result.status());
      if (result.status() >= 400) throw new DiagnosticFailure('submission_failure', 'http_failure');
    },
    async waitAuthRequest(context) {
      if (!serverAuthObserver) return { visibility: 'server_side_unobservable', observed: false };
      const result = await serverAuthObserver.waitRequest(context);
      if (result?.observed === true) signals.authRequestObserved();
      return { visibility: 'trusted_server_observer', observed: result?.observed === true };
    },
    async waitAuthResponse(context) {
      if (!serverAuthObserver) return { visibility: 'server_side_unobservable', observed: false };
      const result = await serverAuthObserver.waitResponse(context);
      if (result?.observed === true) signals.authResponseObserved(result.httpStatus);
      return { visibility: 'trusted_server_observer', observed: result?.observed === true, httpStatus: result?.httpStatus };
    },
    async waitOutcome({ timeoutMs, signal }) {
      await page.waitForFunction(() => {
        const url = new URL(window.location.href);
        return ['/onboarding', '/onboarding/artist', '/artist/dashboard'].includes(url.pathname)
          || (url.pathname === '/signup/artist' && (url.searchParams.get('confirmation') === 'required' || url.searchParams.has('error')));
      }, undefined, { timeout: timeoutMs });
      const url = new URL(page.url());
      if (url.origin !== APPROVED_ORIGIN) throw new DiagnosticFailure('outcome_failure');
      if (url.searchParams.has('error')) throw new DiagnosticFailure('submission_failure');
      if (url.pathname === '/signup/artist' && url.searchParams.get('confirmation') === 'required') {
        return { route: url.pathname, outcome: 'awaiting_email_confirmation' };
      }
      const session = await sessionProbe?.({ signal, timeoutMs });
      return { route: url.pathname, outcome: 'authenticated_session', sessionVerified: session?.authenticated === true };
    },
    async verifyProfile(context) {
      if (!profileProbe) throw new DiagnosticFailure('profile_reconciliation_failure');
      const result = await profileProbe(context);
      return { persisted: result?.persisted === true, canonicalRole: result?.canonicalRole === 'artist' ? 'artist' : null };
    },
    async close() {
      for (const [event, callback] of listeners) page?.off(event, callback);
      await Promise.allSettled([
        Promise.resolve().then(() => serverAuthObserver?.close?.()),
        Promise.resolve().then(() => resource?.close?.())
      ]);
    }
  };
}
