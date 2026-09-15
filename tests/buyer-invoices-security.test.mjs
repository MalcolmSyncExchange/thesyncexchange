import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mapStripeInvoice } from '../services/buyer/settings.ts';
function harness(options = {}) {
  const calls = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : { id: 'verified-buyer', email: 'verified@example.invalid', user_metadata: { role: 'buyer' } } }, error: options.authError }) },
    from: table => ({ select: () => ({ eq: (key, value) => {
      assert.equal(table, 'user_profiles'); assert.equal(key, 'id'); assert.equal(value, 'verified-buyer');
      return { maybeSingle: async () => ({ data: { role: options.role || 'buyer' }, error: options.roleError }) };
    } }) })
  };
  const stripe = {
    customers: { list: async input => { calls.push(input); if (options.customerError) throw Error('stripe'); return { data: options.noCustomer ? [] : [{ id: 'cus_verified' }] }; } },
    invoices: { list: async input => { calls.push(input); if (options.invoiceError) throw Error('stripe'); return { data: [{ id: 'in_verified', created: 1770000000, amount_paid: 2500, currency: 'usd' }] }; } }
  };
  const mocks = {
    'server-only': {},
    '@/lib/env': { hasSupabaseEnv: !options.noConfig, env: { demoMode: !!options.demo } },
    '@/services/supabase/server': { createServerSupabaseClient: async () => { calls.push('session'); return client; } },
    '@/services/stripe/server': { getStripeServerClient: () => { calls.push('stripe'); return options.noStripe ? null : stripe; } },
    '@/services/buyer/settings': { mapStripeInvoice }
  };
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../services/buyer/invoices.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { run: loadedModule.exports.loadBuyerInvoices, calls };
}
test('demo credentials never trigger a real invoice lookup', async () => {
  for (const options of [{ demo: true }, { noConfig: true }]) {
    const h = harness(options); assert.equal((await h.run('victim@example.invalid')).length, 0); assert.equal(h.calls.length, 0);
  }
});
test('no user, authentication errors, forged roles and role-query errors cannot access Stripe', async () => {
  for (const options of [{ noUser: true }, { authError: true }, { role: 'artist' }, { role: 'admin' }, { roleError: true }]) {
    const h = harness(options); assert.equal((await h.run('victim@example.invalid')).length, 0); assert.equal(h.calls.length, 1);
  }
});
test('verified buyer keeps invoice mapping and uses only the verified email', async () => {
  const h = harness(); const result = await h.run('victim@example.invalid');
  assert.equal(h.calls[2].email, 'verified@example.invalid'); assert.equal(h.calls[3].customer, 'cus_verified');
  assert.equal(result[0].id, 'in_verified'); assert.equal(result[0].amountCents, 2500);
});
test('missing Stripe configuration or customer and Stripe failures preserve empty results', async () => {
  for (const options of [{ noStripe: true }, { noCustomer: true }, { customerError: true }, { invoiceError: true }]) {
    assert.equal((await harness(options).run()).length, 0);
  }
});
