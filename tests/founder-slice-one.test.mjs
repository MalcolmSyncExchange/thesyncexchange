import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as paymentMode from '../lib/payment-mode.mjs';

function configuration(overrides = {}, target = 'preview') {
  const loadedModule = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL('../lib/server-env.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'fixture', STRIPE_SECRET_KEY: 'sk_test_fixture', STRIPE_WEBHOOK_SECRET: 'fixture', ...overrides };
  vm.runInNewContext(source, {
    module: loadedModule, exports: loadedModule.exports, process: { env },
    require(name) {
      if (name === '@/lib/payment-mode.mjs') return paymentMode;
      assert.equal(name, '@/lib/env');
      return { env: { stripePublishableKey: 'pk_test_fixture' }, getDeploymentTarget: () => target,
        getPublicEnvironmentDiagnostics: () => ({ issues: [] }) };
    }
  });
  return loadedModule.exports;
}

test('reproduce PR26: missing preview mode rejects payment execution', () => {
  assert.throws(() => configuration().getPaymentRuntimeConfiguration(), /configuration is invalid/);
});

test('explicit preview build configuration survives absent Function runtime variable', () => {
  const runtime = configuration({ TSE_BUILD_PREVIEW_PAYMENT_MODE: 'test' }).getPaymentRuntimeConfiguration();
  assert.equal(runtime.paymentMode, 'test');
  assert.equal(runtime.livePaymentsEnabled, false);
});

test('preview build value cannot enable production or override an invalid runtime mode', () => {
  for (const [env, target] of [
    [{ TSE_BUILD_PREVIEW_PAYMENT_MODE: 'test' }, 'production'],
    [{ TSE_BUILD_PREVIEW_PAYMENT_MODE: 'live' }, 'preview'],
    [{ TSE_BUILD_PREVIEW_PAYMENT_MODE: 'test', SYNC_EXCHANGE_PAYMENT_MODE: 'live' }, 'preview'],
    [{ TSE_BUILD_PREVIEW_PAYMENT_MODE: 'test', SYNC_EXCHANGE_PAYMENT_MODE: '' }, 'preview'],
    [{ TSE_BUILD_PREVIEW_PAYMENT_MODE: 'test', STRIPE_SECRET_KEY: 'sk_live_fixture' }, 'preview']
  ]) assert.throws(() => configuration(env, target).getPaymentRuntimeConfiguration());
});

test('read-only payment status is safe to render while execution stays blocked', () => {
  const config = configuration();
  const status = config.getPaymentDisplayConfiguration();
  assert.equal(status.checkoutAvailable, false);
  assert.equal(status.livePaymentsEnabled, false);
  assert.equal(status.issueCodes.includes('missing_payment_mode'), true);
  assert.throws(() => config.getPaymentRuntimeConfiguration());
  const valid = configuration({ SYNC_EXCHANGE_PAYMENT_MODE: 'test' }).getPaymentDisplayConfiguration();
  assert.equal(valid.checkoutAvailable, true);
  assert.equal(valid.paymentMode, 'test');
});
