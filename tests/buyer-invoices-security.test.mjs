import Stripe from "stripe";
import { isAuthSessionMissingError, AuthSessionMissingError } from "@supabase/supabase-js";
import { selectBuyerCustomer } from "../lib/billing-customer.ts";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mapStripeInvoice } from '../services/buyer/settings.ts';
function harness(options = {}) {
  const calls = [];
  const mutations = [];
  const logs = [];
  const mutation = () => { mutations.push('unexpected mutation'); throw Error('mutation forbidden'); };
  const client = {
    rpc: async name => { assert.equal(name, "auth_session_is_active"); return { data: !options.revoked, error: options.activeError }; },
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
    customers: { create: mutation, update: mutation, del: mutation, list: async input => { calls.push(input); if (options.customerError) throw options.customerError; return { data: options.noCustomer ? [] : [{ id: 'cus_verified', metadata: {supabaseUserId: options.foreignCustomer ? 'different-buyer' : 'verified-buyer'} }] }; } },
    invoices: { create: mutation, update: mutation, del: mutation, pay: mutation, list: async input => { calls.push(input); if (options.invoiceError) throw options.invoiceError; return { data: options.empty ? [] : [{ id: 'in_verified', created: options.malformedInvoice ? NaN : 1770000000, amount_paid: 2500, currency: 'usd' }] }; } },
    subscriptions: { create: mutation, update: mutation, cancel: mutation },
    paymentIntents: { create: mutation, update: mutation, confirm: mutation }
  };
  const mocks = {
    '@/lib/monitoring': { reportOperationalEvent: (...args) => logs.push(args) },
    'stripe': {default: Stripe}, '@supabase/supabase-js': {isAuthSessionMissingError}, 'server-only': {}, '@/lib/billing-customer': {selectBuyerCustomer},
    'next/navigation': { unstable_rethrow: error => { if (error?.framework) throw error; } },
    '@/lib/env': { hasSupabaseEnv: !options.noConfig, env: { demoMode: !!options.demo } },
    '@/services/supabase/server': { createServerSupabaseClient: async () => { calls.push('session'); if (options.clientThrow) throw Error('private client details'); return client; } },
    '@/services/stripe/server': { getStripeServerClient: () => { calls.push('stripe'); if (options.stripeThrow) throw Error('private configuration details'); return options.noStripe ? null : stripe; } },
    '@/services/buyer/settings': { mapStripeInvoice }
  };
  const loadedModule = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL('../services/buyer/invoices.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { module: loadedModule, exports: loadedModule.exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; } });
  return { run: loadedModule.exports.loadBuyerInvoices, calls, mutations, logs };
}
test('demo is empty; missing configuration is unavailable without a provider lookup', async () => {
  for (const options of [{ demo: true }, { noConfig: true }]) {
    const h = harness(options), result=await h.run(); assert.equal(result.invoices.length,0); assert.equal(result.status,options.demo?'available':'unavailable'); assert.equal(h.calls.length,0);
  }
});
test('ordinary signed-out and nonbuyer cases deny all provider access', async () => {
  for (const options of [{noUser:true},{noId:true},{noEmail:true},{authError:new AuthSessionMissingError()},{noProfile:true},{role:'artist'},{role:'admin'}]) {
    const h=harness(options); assert.equal((await h.run()).invoices.length,0); assert.deepEqual(h.calls,['session']); assert.equal(h.mutations.length,0);
  }
});
test('returned Auth 500, SQLSTATE 42501 and XX000, and revoked sessions fail closed', async () => {
  for (const options of [{authError:{status:500,message:'SECRET auth canary'}},{roleError:{code:'42501',message:'SECRET access canary'}},{roleError:{code:'XX000',message:'SECRET database canary'}},{activeError:{code:'42501'}},{revoked:true},{authThrow:Error('expired session')},{clientThrow:true},{roleThrow:true}]) {
    const h=harness(options); await assert.rejects(h.run()); assert.deepEqual(h.calls,['session']); assert.equal(h.mutations.length,0);
  }
});
test('verified buyer lookup uses session email and immutable ownership; no mutations', async () => {
  const h=harness(), result=await h.run('victim@example.invalid'); assert.equal(result.status,'available'); assert.equal(result.invoices[0].id,'in_verified'); assert.equal(h.calls[2].email,'verified@example.invalid'); assert.equal(h.calls[3].customer,'cus_verified'); assert.equal(h.mutations.length,0);
  const foreign=harness({foreignCustomer:true}); assert.equal((await foreign.run()).invoices.length,0); assert.equal(foreign.calls.length,3);
});
test('expected provider outages are unavailable, never empty-success or raw error responses', async () => {
  for (const Type of [Stripe.errors.StripeConnectionError,Stripe.errors.StripeAPIError,Stripe.errors.StripeAuthenticationError,Stripe.errors.StripePermissionError,Stripe.errors.StripeRateLimitError]) {
    for (const key of ['customerError','invoiceError']) {
      const h=harness({[key]:new Type({message:'SECRET email@canary.invalid signed-url?token=SECRET /storage/SECRET',statusCode:500})}), result=await h.run();
      assert.equal(result.status,'unavailable'); assert.equal(result.invoices.length,0); assert.doesNotMatch(JSON.stringify([result,h.logs]),/SECRET|canary/); assert.equal(h.mutations.length,0);
    }
  }
});
test('successful empty invoice history is available; missing Stripe is unavailable', async () => {
  assert.equal((await harness({empty:true}).run()).status,'available'); assert.equal((await harness({noStripe:true}).run()).status,'unavailable');
  for (const options of [{stripeThrow:true},{malformedInvoice:true},{invoiceError:Error('unexpected programming or ownership failure')}]) await assert.rejects(harness(options).run());
});
test('framework control flow propagates',async()=>{const error=Object.assign(Error('control flow'),{framework:true});await assert.rejects(harness({authThrow:error}).run(),e=>e===error);});
