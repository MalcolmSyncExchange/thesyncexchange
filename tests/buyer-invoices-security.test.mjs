import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mapStripeInvoice } from '../services/buyer/settings.ts';
function harness(options = {}) {
  const calls = [];
  const mutations = [];
  const mutation = () => { mutations.push('unexpected mutation'); throw Error('mutation forbidden'); };
  const client = {
    auth: { getUser: async () => {
      if (options.authThrow) throw options.authThrow;
      return { data: { user: options.noUser ? null : { id: options.noId ? '' : 'verified-buyer', email: options.noEmail ? '' : 'verified@example.invalid', user_metadata: { role: 'buyer' }, app_metadata: { role: 'buyer' } } }, error: options.authError };
    } },
    from: table => ({ insert: mutation, update: mutation, delete: mutation, upsert: mutation, select: () => ({ eq: (key, value) => {
      assert.equal(table, 'user_profiles'); assert.equal(key, 'id'); assert.equal(value, 'verified-buyer');
      return { maybeSingle: async () => {
        if (options.roleThrow) throw Error('private database details');
        return { data: options.noProfile ? null : { role: Object.hasOwn(options, 'role') ? options.role : 'buyer' }, error: options.roleError };
      } };
    } }) })
  };
  const stripe = {
    customers: { create: mutation, update: mutation, del: mutation, list: async input => { calls.push(input); if (options.customerError) throw Error('private Stripe details'); return { data: options.noCustomer ? [] : [{ id: 'cus_verified' }] }; } },
    invoices: { create: mutation, update: mutation, del: mutation, pay: mutation, list: async input => { calls.push(input); if (options.invoiceError) throw Error('private Stripe details'); return { data: [{ id: 'in_verified', created: options.malformedInvoice ? NaN : 1770000000, amount_paid: 2500, currency: 'usd' }] }; } },
    subscriptions: { create: mutation, update: mutation, cancel: mutation },
    paymentIntents: { create: mutation, update: mutation, confirm: mutation }
  };
  const mocks = {
    'server-only': {},
    'next/navigation': { unstable_rethrow: error => { if (error?.framework) throw error; } },
    '@/lib/env': { hasSupabaseEnv: !options.noConfig, env: { demoMode: !!options.demo } },
    '@/services/supabase/server': { createServerSupabaseClient: async () => { calls.push('session'); if (options.clientThrow) throw Error('private client details'); return client; } },
    '@/services/stripe/server': { getStripeServerClient: () => { calls.push('stripe'); if (options.stripeThrow) throw Error('private configuration details'); return options.noStripe ? null : stripe; } },
    '@/services/buyer/settings': { mapStripeInvoice }
  };
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../services/buyer/invoices.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { run: loadedModule.exports.loadBuyerInvoices, calls, mutations };
}
test('demo credentials never trigger a real invoice lookup', async () => {
  for (const options of [{ demo: true }, { noConfig: true }]) {
    const h = harness(options); assert.equal((await h.run('victim@example.invalid')).length, 0); assert.equal(h.calls.length, 0);
  }
});
test('no user, authentication errors, forged roles and role-query errors cannot access Stripe', async () => {
  for (const options of [{ noUser: true }, { authError: true }, { noId: true }, { noEmail: true }, { noProfile: true }, { role: null }, { role: 'artist' }, { role: 'admin' }, { roleError: true }, { authThrow: Error('expired session') }, { clientThrow: true }, { roleThrow: true }]) {
    const h = harness(options); assert.equal((await h.run('victim@example.invalid')).length, 0); assert.equal(h.calls.length, 1);
    assert.equal(h.mutations.length, 0);
  }
});
test('verified buyer keeps invoice mapping and uses only the verified email', async () => {
  const h = harness(); const result = await h.run('victim@example.invalid');
  assert.equal(h.calls[2].email, 'verified@example.invalid'); assert.equal(h.calls[3].customer, 'cus_verified');
  assert.equal(result[0].id, 'in_verified'); assert.equal(result[0].amountCents, 2500);
  assert.equal(h.mutations.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(h.calls)), ['session', 'stripe', { email: 'verified@example.invalid', limit: 1 }, { customer: 'cus_verified', limit: 5 }]);
  assert.equal(JSON.stringify(result).includes('cus_verified'), false);
});
test('missing Stripe configuration or customer and Stripe failures preserve empty results', async () => {
  for (const options of [{ noStripe: true }, { stripeThrow: true }, { noCustomer: true }, { customerError: true }, { invoiceError: true }, { malformedInvoice: true }]) {
    const h = harness(options);
    assert.equal((await h.run()).length, 0);
    assert.equal(h.mutations.length, 0);
  }
});
test('Next.js framework control-flow errors are rethrown, not swallowed', async () => {
  const error = Object.assign(Error('framework control flow'), { framework: true });
  const h = harness({ authThrow: error });
  await assert.rejects(h.run(), value => value === error);
  assert.deepEqual(h.calls, ['session']);
});
