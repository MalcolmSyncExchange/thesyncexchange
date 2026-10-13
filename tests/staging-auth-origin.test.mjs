import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {buildAuthCallbackRedirectUrl,resolveConfiguredAuthAppOrigin} from '../services/auth/auth-flow.ts';
import * as capabilities from '../lib/admin-v2/payment-readiness.ts';
const loaded={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL('../lib/health/payment-readiness.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:loaded,exports:loaded.exports,Buffer,require:()=>capabilities});
const {isDedicatedStagingIdentity}=loaded.exports;
const origin='https://sync-exchange-posthog-staging.netlify.app',site='d8e851a6-ab37-4b0e-9403-9b2c1be65f13',project='oppijylbkcbiqfuvckgj';
const jwt=(role,ref=project)=>'unit.'+Buffer.from(JSON.stringify({role,ref})).toString('base64url')+'.unsigned';
const evidence=()=>({SYNC_EXCHANGE_DEPLOYMENT_CLASS:'dedicated-staging',SITE_ID:site,TSE_BUILD_NETLIFY_SITE_ID:site,URL:origin,NEXT_PUBLIC_APP_URL:origin,NEXT_PUBLIC_SUPABASE_URL:`https://${project}.supabase.co`,NEXT_PUBLIC_SUPABASE_ANON_KEY:jwt('anon'),SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),ANALYTICS_ENABLED:'false',SYNC_EXCHANGE_DEMO_MODE:'false'});
function callback(vars,appUrl=origin,nextPath='/onboarding'){return buildAuthCallbackRedirectUrl({appUrl,deploymentTarget:'production',dedicatedStagingIdentityVerified:isDedicatedStagingIdentity(vars,'production'),nextPath});}
test('regression: approved staging signup callback succeeds in Netlify production context with independently verified identity',()=>{
 assert.throws(()=>buildAuthCallbackRedirectUrl({appUrl:origin,deploymentTarget:'production',nextPath:'/onboarding'}),/Production authentication redirects/);
 const url=new URL(callback(evidence()));assert.equal(url.origin,origin);assert.equal(url.pathname,'/auth/confirm');assert.equal(url.searchParams.get('next'),'/onboarding');
 assert.equal(resolveConfiguredAuthAppOrigin({configuredAppUrl:origin,deploymentTarget:'production',dedicatedStagingIdentityVerified:isDedicatedStagingIdentity(evidence(),'production')}),origin);
 const recovery=new URL(callback(evidence(),origin,'/reset-password'));assert.equal(recovery.searchParams.get('next'),'/reset-password');
});
for(const [name,override]of Object.entries({missingSite:{SITE_ID:undefined},wrongSite:{SITE_ID:'production-site'},missingBuild:{TSE_BUILD_NETLIFY_SITE_ID:undefined},mismatchedBuild:{TSE_BUILD_NETLIFY_SITE_ID:'production-site'},wrongProject:{NEXT_PUBLIC_SUPABASE_URL:'https://wrong.supabase.co'},wrongAnon:{NEXT_PUBLIC_SUPABASE_ANON_KEY:jwt('anon','wrong')},wrongService:{SUPABASE_SERVICE_ROLE_KEY:jwt('service_role','wrong')},missingService:{SUPABASE_SERVICE_ROLE_KEY:undefined},wrongPlatformOrigin:{URL:'https://thesyncexchange.com'},wrongApplicationOrigin:{NEXT_PUBLIC_APP_URL:'https://thesyncexchange.com'},analyticsEnabled:{ANALYTICS_ENABLED:'true'},demoEnabled:{SYNC_EXCHANGE_DEMO_MODE:'true'},previewContext:{CONTEXT:'deploy-preview'},flagAlone:{SITE_ID:undefined,TSE_BUILD_NETLIFY_SITE_ID:undefined,SUPABASE_SERVICE_ROLE_KEY:undefined}}))test('staging callback fails closed: '+name,()=>assert.throws(()=>callback({...evidence(),...override}),/Production authentication redirects/));
test('verified identity cannot allow another HTTPS origin, HTTP, paths, query, fragment or embedded credentials',()=>{
 for(const url of ['https://unapproved.example','http://sync-exchange-posthog-staging.netlify.app',origin+'/path',origin+'?x=1',origin+'#x','https://user:password@sync-exchange-posthog-staging.netlify.app'])assert.throws(()=>callback(evidence(),url));
});
test('actual production and preview origin protections remain strict',()=>{
 assert.equal(resolveConfiguredAuthAppOrigin({configuredAppUrl:'https://thesyncexchange.com',deploymentTarget:'production'}),'https://thesyncexchange.com');
 assert.throws(()=>resolveConfiguredAuthAppOrigin({configuredAppUrl:'https://thesyncexchange.com',deploymentTarget:'preview',dedicatedStagingIdentityVerified:true}),/Non-production/);
});
test('signup and token-hash confirmation both derive proof server-side; client form cannot select it',()=>{
 for(const file of ['services/auth/actions.ts','app/auth/confirm/route.ts']){const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');assert.match(source,/dedicatedStagingIdentityVerified: isDedicatedStagingIdentity\(/);assert.match(source,/TSE_BUILD_NETLIFY_SITE_ID: process\.env\.TSE_BUILD_NETLIFY_SITE_ID/);assert.doesNotMatch(source,/formData\.get\("dedicatedStagingIdentityVerified"/);}
});
