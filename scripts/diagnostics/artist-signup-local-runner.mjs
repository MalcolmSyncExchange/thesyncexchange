import { createArtifactWriter, runArtistSignupDiagnostics, DiagnosticFailure } from './artist-signup-harness.mjs';
import { APPROVED_ORIGIN, createArtistSignupBrowserDriver } from './artist-signup-browser-driver.mjs';
import { createTrustedSignupObservers } from './artist-signup-observers.mjs';

const REQUIRED_GATES = ['callback', 'recipient', 'quota', 'credentialBinding', 'sourceAttestation', 'observerBridge'];

/** No CLI, credential loader, signup API, retry, or deployment action. */
export function prepareLocalSignupRunner({ fields, transports, pageFactory, artifactPath, readiness, serverAuthObserver }) {
  let used = false;
  const observers = createTrustedSignupObservers({ email: fields?.email, startedAt: new Date().toISOString(), transports });
  return Object.freeze({
    approvedOrigin: APPROVED_ORIGIN,
    readBaseline: observers.baseline,
    readEvidence: observers.observe,
    readDelivery: observers.delivery,
    async runOnce({ founderAuthorization } = {}) {
      // Preparation/read-only calls cannot launch a browser or submit a form.
      if (founderAuthorization !== 'authorize-one-controlled-staging-artist-signup' || used ||
          !REQUIRED_GATES.every(k => readiness?.[k] === 'PASS')) throw new DiagnosticFailure('harness_failure');
      const baseline = await observers.baseline();
      if (baseline.status !== 'observed' || !baseline.unusedIdentity) throw new DiagnosticFailure('harness_failure');
      used = true;
      const driver = createArtistSignupBrowserDriver({ pageFactory, fields, serverAuthObserver,
        profileProbe: observers.profileProbe, sessionProbe: observers.sessionProbe });
      const workflow = await runArtistSignupDiagnostics({ driver, writeArtifact: createArtifactWriter(artifactPath) });
      const persisted = await observers.observe();
      const delivered = await observers.delivery();
      const passed = workflow.status === 'passed' && persisted.status === 'observed' &&
        persisted.authCount === 1 && persisted.identities === 1 && persisted.profileCount === 1 &&
        persisted.artistRole && persisted.outboxCount === 1 && persisted.eventScopeValid &&
        !persisted.duplicates && delivered.status === 'observed' && delivered.records === 1 &&
        delivered.matched === 1 && delivered.scopeValid && !delivered.duplicates;
      // A separate, closed observer artifact cannot turn missing evidence into success.
      const evidence = { schema_version: 1, passed: Boolean(passed), baseline, persisted, delivered,
        production_impact: 'not_observable_from_staging', auth_http_visibility: serverAuthObserver ? 'trusted_observer_supplied' : 'server_side_unobservable' };
      await createArtifactWriter(artifactPath + '.observers.json')(evidence);
      return { workflow, evidence };
    }
  });
}
