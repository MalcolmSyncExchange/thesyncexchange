import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import * as authSecurity from "../services/auth/security.ts";
import { renderToStaticMarkup } from "react-dom/server";
import * as readiness from "../lib/admin-v2/payment-readiness.ts";
import * as paymentMode from "../lib/payment-mode.mjs";
import * as maintenance from "../lib/maintenance-mode.mjs";
import { database, asActor, ids } from "./helpers/artist-baseline-db.mjs";

const require = createRequire(import.meta.url);
const source = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const flags = value => Object.fromEntries(Object.keys(readiness.CAPABILITY_LABELS).map(key => [key, value]));
const ready = { status: "ready", mode: "test", reasons: [] };
function load(path, imports, env = {}) {
  const loadedModule = {exports:{}};
  const js = ts.transpileModule(source(path), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(js, {module:loadedModule,exports:loadedModule.exports,process:{env},AbortSignal,
    require(name) { if (Object.hasOwn(imports,name)) return imports[name]; throw Error(`Unexpected dependency: ${name}`); }
  });
  return loadedModule.exports;
}
function harness(options = {}) {
  const raw = {SYNC_EXCHANGE_PAYMENT_MODE:"test",SUPABASE_SERVICE_ROLE_KEY:"service_secret_sentinel",
    STRIPE_SECRET_KEY:"sk_test_secret_sentinel",STRIPE_WEBHOOK_SECRET:"webhook_secret_sentinel",...options.raw};
  const env = {demoMode:false,stripePublishableKey:"pk_test_fixture",...options.env};
  const envModule = {env,getDeploymentTarget:()=>options.target || "preview",
    getPublicEnvironmentDiagnostics:()=>({issues:options.issues || []}),getMissingCoreEnvKeys:()=>options.missingCore || []};
  const config = load("lib/server-env.ts", {"@/lib/env":envModule,"@/lib/payment-mode.mjs":paymentMode}, raw);
  const calls = [];
  const authorization = load("services/auth/authorization.ts", {
    "@/services/auth/security":authSecurity,
    "@/services/supabase/server":{createServerSupabaseClient:async()=>({auth:{getUser:async()=>({data:{user:{id:ids.admin,user_metadata:{role:"admin"},factors:[{status:"verified"}]}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:"aal2"},error:null})}},rpc:async()=>({data:true,error:null})})},
    "@/services/auth/user-profiles":{selectUserProfileCompat:async()=>({data:{role:options.role || "admin"}})}
  });
  const service = load("services/admin/payment-readiness.ts", {
    "server-only":{},"@/lib/env":envModule,"@/lib/server-env":{...config,...options.config},
    "@/lib/maintenance-mode.mjs":maintenance,"@/lib/admin-v2/payment-readiness":readiness,
    "@/services/auth/authorization":{requireAccountScope:async role=>{calls.push("authorize");return authorization.requireAccountScope(role);}},
    "@/services/auth/session":{requireSession:async role=>{calls.push("demo_authorize");if(role !== (options.role || "admin")) throw Error("Denied");}},
    "@/services/supabase/admin":{createAdminSupabaseClient:()=>{
      calls.push("client"); if (options.noClient) return null;
      return {rpc(name,args){calls.push(name);assert.deepEqual(Object.keys(args),[]);return {abortSignal(signal){
        assert.ok(signal instanceof AbortSignal); calls.push("bounded_read");
        if(options.rpcThrow) throw Error("private transport stack sk_test_secret_sentinel");
        return Promise.resolve(options.rpc || {data:[flags(false)],error:null});
      }};}};
    }}
  }, raw);
  return {service, config, calls};
}
const panel = load("components/admin-v2/payment-readiness.tsx", {
  "react/jsx-runtime":require("react/jsx-runtime"),"./operations.module.css":{default:{}},"@/lib/admin-v2/payment-readiness":readiness
}).PaymentReadinessPanel;
const render = value => renderToStaticMarkup(React.createElement(panel,{readiness:value}));

test("valid preview test configuration is ready; provider and overall checkout remain unknown",async()=>{
  const {service,calls}=harness(); const result=await service.getAdminPaymentReadiness();
  assert.equal(result.paymentConfiguration.status,"ready"); assert.equal(result.paymentConfiguration.mode,"test");
  assert.equal(result.paymentProvider.status,"unknown"); assert.equal(result.checkoutReadiness.status,"unknown");
  assert.deepEqual(calls,["authorize","client","get_admin_purchase_capabilities","bounded_read"]);
});
test("explicit production live configuration is classified without asserting provider availability",async()=>{
  const {service}=harness({target:"production",raw:{SYNC_EXCHANGE_PAYMENT_MODE:"live",STRIPE_SECRET_KEY:"sk_live_fixture"},env:{stripePublishableKey:"pk_live_fixture"}});
  const result=await service.getAdminPaymentReadiness(); assert.equal(result.paymentConfiguration.status,"ready");
  assert.equal(result.paymentConfiguration.mode,"live"); assert.equal(result.checkoutReadiness.status,"unknown");
});
test("missing preview credentials block readiness even when the legacy display helper says available",async()=>{
  for(const key of ["STRIPE_SECRET_KEY","STRIPE_WEBHOOK_SECRET","SUPABASE_SERVICE_ROLE_KEY"]){
    const {service,config}=harness({raw:{[key]:undefined}});
    assert.equal(config.getPaymentDisplayConfiguration().checkoutAvailable,true);
    const result=await service.getAdminPaymentReadiness(); assert.equal(result.paymentConfiguration.status,"blocked",key);
    assert.equal(result.checkoutReadiness.status,"blocked");
  }
  assert.equal((await harness({env:{stripePublishableKey:undefined}}).service.getAdminPaymentReadiness()).paymentConfiguration.status,"blocked");
});
test("invalid/missing mode, mixed keys, missing app configuration and invalid adapter block safely",async()=>{
  for(const options of [
    {raw:{SYNC_EXCHANGE_PAYMENT_MODE:undefined}},{raw:{SYNC_EXCHANGE_PAYMENT_MODE:"private_invalid_value"}},
    {raw:{STRIPE_SECRET_KEY:"sk_live_fixture"}},{raw:{SYNC_EXCHANGE_PAYMENT_MODE:"live"}},
    {missingCore:["private_variable_name"]},{raw:{SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED:"true"}},
    {issues:[{code:"unapproved_diagnostic",message:"private_value",severity:"error"}]}
  ]) {
    const result=await harness(options).service.getAdminPaymentReadiness();
    assert.equal(result.paymentConfiguration.status,"blocked"); assert.equal(result.checkoutReadiness.status,"blocked");
    assert.doesNotMatch(render(result),/private_|unapproved_diagnostic|sk_live_/);
  }
});
test("maintenance and demo execution restrictions are visible without database evidence fabrication",async()=>{
  for(const mode of ["cutover","malformed"]){
    const result=await harness({raw:{SYNC_EXCHANGE_MAINTENANCE_MODE:mode}}).service.getAdminPaymentReadiness();
    assert.equal(result.checkoutReadiness.status,"blocked");assert.ok(result.checkoutReadiness.reasons.includes("maintenance_active"));
  }
  const {service,calls}=harness({env:{demoMode:true}}); const result=await service.getAdminPaymentReadiness();
  assert.equal(result.purchaseCapabilities.status,"unknown");assert.equal(result.purchaseCapabilities.enabledCount,null);
  assert.deepEqual(calls,["demo_authorize"]);
});
test("six OFF flags, partial flags and six ON flags are displayed accurately",()=>{
  for(const [values,count,state] of [[flags(false),0,"disabled"],[{...flags(false),foundation_enabled:true},1,"partial"],[flags(true),6,"enabled"]]){
    const result=readiness.buildPaymentReadiness(ready,[values],false);
    assert.equal(result.purchaseCapabilities.enabledCount,count);assert.equal(result.purchaseCapabilities.status,state);
    assert.match(render(result),new RegExp(`${count} of 6 enabled`));assert.equal(result.checkoutReadiness.status,"unknown");
  }
});
test("disabled adapter prerequisites block only the requested adapter, not legacy checkout",()=>{
  const result=readiness.buildPaymentReadiness(ready,[flags(false)],true);assert.equal(result.checkoutReadiness.status,"blocked");
  assert.ok(result.checkoutReadiness.reasons.includes("adapter_capabilities_disabled"));
  const partial={...flags(false),foundation_enabled:true,payment_adapter_enabled:true};
  const result2=readiness.buildPaymentReadiness(ready,[partial],true);assert.equal(result2.checkoutReadiness.status,"unknown");
  assert.ok(result2.checkoutReadiness.reasons.includes("fulfillment_capabilities_disabled"));
});
test("missing, partial, duplicate or malformed capability evidence is unknown, never zero",async()=>{
  for(const data of [null,[],[{}],[flags(false),flags(false)],[{...flags(false),foundation_enabled:"false"}]]){
    const result=await harness({rpc:{data,error:null}}).service.getAdminPaymentReadiness();
    assert.equal(result.purchaseCapabilities.status,"unknown");assert.equal(result.purchaseCapabilities.enabledCount,null);
    assert.match(render(result),/Unknown · 6 capabilities not verified/);
  }
});
test("failed reads and evaluation failures return safe unknown states without throwing",async()=>{
  for(const options of [{rpcThrow:true},{rpc:{data:[flags(true)],error:{message:"private_exception"}}},{noClient:true}]){
    const result=await harness(options).service.getAdminPaymentReadiness();
    assert.equal(result.purchaseCapabilities.status,"unknown");assert.equal(result.checkoutReadiness.status,"unknown");
    assert.doesNotMatch(render(result),/private_|secret_sentinel/);
  }
  const result=await harness({config:{getServerEnvironmentDiagnostics(){throw Error("private_exception");}}}).service.getAdminPaymentReadiness();
  assert.equal(result.paymentConfiguration.status,"unknown");assert.equal(result.checkoutReadiness.status,"unknown");
  assert.match(render(result),/Admin operations remain available/);
});
test("canonical buyer/artist denial occurs before privileged reads even with admin metadata",async()=>{
  for(const role of ["buyer","artist"]){
    const {service,calls}=harness({role});await assert.rejects(service.getAdminPaymentReadiness(),/admin access is required/);
    assert.deepEqual(calls,["authorize"]);
  }
});
test("rendered contract contains only allowlisted messages and six boolean fields",async()=>{
  const result=await harness({rpc:{data:[{...flags(false),providerAccount:"acct_private_sentinel",secret:"secret_sentinel"}],error:null}}).service.getAdminPaymentReadiness();
  const html=render(result); assert.match(html,/Payment Readiness/);assert.doesNotMatch(html,/sentinel|acct_|sk_|SUPABASE_|STRIPE_|stack/);
  assert.deepEqual(Object.keys(result.purchaseCapabilities.flags),Object.keys(readiness.CAPABILITY_LABELS));
  const filtered=readiness.buildPaymentReadiness({...ready,reasons:["unapproved_private_reason","configuration_missing"]},[flags(false)],false);
  assert.deepEqual(filtered.paymentConfiguration.reasons,["configuration_missing"]);
  assert.doesNotMatch(render(filtered),/unapproved_private_reason/);
});
test("real migration: read-only service projection, denied ordinary roles, unchanged flags",async()=>{
  const db=await database();try{
    for(const [actor,role] of [[null,"anon"],[ids.buyer,"authenticated"],[ids.a,"authenticated"],[ids.admin,"authenticated"]])
      await asActor(db,actor,()=>assert.rejects(db.query("select * from public.get_admin_purchase_capabilities()"),/permission denied/),role);
    const read=()=>asActor(db,null,()=>db.query("select * from public.get_admin_purchase_capabilities()"),"service_role");
    assert.deepEqual((await read()).rows,[flags(false)]);
    await db.exec("update commerce_private.capabilities set foundation_enabled=true,payment_adapter_enabled=true");
    const before=(await db.query("select * from commerce_private.capabilities")).rows;
    await db.exec("begin read only");const result=await read();await db.exec("commit");
    assert.equal(readiness.buildPaymentReadiness(ready,result.rows,true).purchaseCapabilities.enabledCount,2);
    assert.deepEqual((await db.query("select * from commerce_private.capabilities")).rows,before);
    await asActor(db,null,()=>assert.rejects(db.exec("update commerce_private.capabilities set foundation_enabled=false"),/permission denied/),"service_role");
    const info=(await db.query("select prosecdef,provolatile,proconfig from pg_proc where oid='public.get_admin_purchase_capabilities()'::regprocedure")).rows[0];
    assert.equal(info.prosecdef,false);assert.equal(info.provolatile,"s");assert.deepEqual(info.proconfig,['search_path=""']);
    await db.exec("delete from commerce_private.capabilities");assert.deepEqual((await read()).rows,[]);
  }finally{await db.close();}
});
