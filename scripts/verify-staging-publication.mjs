import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { getStagingPublicationCredential } from './staging-publication-credential.mjs';
export const SITE = 'd8e851a6-ab37-4b0e-9403-9b2c1be65f13';
export const ORIGIN = 'https://sync-exchange-posthog-staging.netlify.app';
export const PROJECT = 'oppijylbkcbiqfuvckgj';
export function verifyPublicationEvidence({source,approvedSource,clean,site,compiled,functions,vars,credential,rpc}) {
  const fail=()=>{throw new Error('Staging publication identity or safety evidence failed.');};
  if(!clean || source!==approvedSource || site.id!==SITE || site.ssl_url!==ORIGIN || compiled.TSE_BUILD_NETLIFY_SITE_ID!==SITE || compiled.TSE_BUILD_DEPLOYMENT_TARGET!=='production' || functions.SITE_ID!==SITE || functions.URL!==ORIGIN) fail();
  const required={NEXT_PUBLIC_APP_URL:ORIGIN,NEXT_PUBLIC_SUPABASE_URL:`https://${PROJECT}.supabase.co`,ANALYTICS_ENABLED:'false',SYNC_EXCHANGE_DEPLOYMENT_CLASS:'dedicated-staging',SYNC_EXCHANGE_PAYMENT_MODE:'test',SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED:'false',SYNC_EXCHANGE_BILLING_PORTAL_ENABLED:'false',SYNC_EXCHANGE_DEMO_MODE:'false'};
  if(Object.entries(required).some(([key,value])=>vars[key]!==value) || !vars.NEXT_PUBLIC_SUPABASE_ANON_KEY || ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY','POSTHOG_PRODUCTION_TOKEN'].some(key=>vars[key])) fail();
  function bound(key,role){try {const c=JSON.parse(Buffer.from(key.split('.')[1],'base64url'));return c.ref===PROJECT&&c.role===role;}catch{return false;}}
  if(!bound(vars.NEXT_PUBLIC_SUPABASE_ANON_KEY,'anon') || !bound(credential,'service_role')) fail();
  const names=['foundation_enabled','asset_preparation_enabled','receipt_generation_enabled','entitlement_activation_enabled','transaction_projection_enabled','payment_adapter_enabled'];
  if(rpc.error || !Array.isArray(rpc.data) || rpc.data.length!==1 || !names.every(key=>rpc.data[0][key]===false)) fail();
  return {site:SITE,origin:ORIGIN,project:PROJECT,compiledIdentity:'PASS',functionsIdentityContract:'PASS',payments:'disabled',analytics:'disabled'};
}
export async function verifySelectedSite() {
  const token=process.env.NETLIFY_AUTH_TOKEN;
  if(!token)throw Error('Private Netlify verification credential required.');
  const response=await fetch(`https://api.netlify.com/api/v1/sites/${SITE}`,{redirect:'error',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Selected site identity read failed.');
  const site=await response.json();
  if(site.id!==SITE||site.ssl_url!==ORIGIN)throw Error('Selected site identity mismatch.');
  return {site:SITE,origin:ORIGIN};
}
export async function main() {
  const approvedSource=process.argv[2];if(!/^[a-f0-9]{40}$/.test(approvedSource||'')) throw Error('Exact approved source SHA required.');
  const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();const clean=!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
  const compiled=JSON.parse(readFileSync('.next/required-server-files.json','utf8')).config.env;
  // This command never deploys. Provider reads require a private token in memory.
  const token=process.env.NETLIFY_AUTH_TOKEN;
  if(!token)throw Error('Private provider verification credentials required; do not put keys in arguments or files.');
  const credential=await getStagingPublicationCredential();
  async function net(path){const r=await fetch('https://api.netlify.com/api/v1'+path,{redirect:'error',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Provider identity read failed.');return r.json();}
  const site=await net(`/sites/${SITE}`);if(site.id!==SITE||site.ssl_url!==ORIGIN)throw Error('Wrong staging site.');
  const shared=await net(`/accounts/${site.account_id}/env?context_name=production`);
  if(shared.length || Object.keys(site.build_settings?.env || {}).length)throw Error('Unexpected shared or legacy build configuration.');
  const env=await net(`/accounts/${site.account_id}/env?site_id=${SITE}&context_name=production`);const vars={};
  for(const x of env){vars[x.key]=(x.values.find(v=>v.context==='production') || x.values.find(v=>v.context==='all'))?.value;const privateKey=['SUPABASE_SERVICE_ROLE_KEY','POSTHOG_PREVIEW_TOKEN','POSTHOG_HOST'].includes(x.key);if(privateKey&&JSON.stringify(x.scopes)!=='["functions"]')throw Error('Private scope mismatch.');}
  for(const key of ['NEXT_PUBLIC_APP_URL','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','ANALYTICS_ENABLED','SYNC_EXCHANGE_DEPLOYMENT_CLASS','SYNC_EXCHANGE_PAYMENT_MODE','SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED','SYNC_EXCHANGE_BILLING_PORTAL_ENABLED','SYNC_EXCHANGE_DEMO_MODE'])if(!['builds','functions'].every(scope=>env.find(x=>x.key===key)?.scopes.includes(scope)))throw Error('Published scope mismatch.');
  if(!env.find(x=>x.key==='SUPABASE_SERVICE_ROLE_KEY')?.is_secret)throw Error('Functions credential must be marked secret.');
  const r=await fetch(`https://${PROJECT}.supabase.co/rest/v1/rpc/get_admin_purchase_capabilities`,{method:'POST',redirect:'error',headers:{apikey:credential,Authorization:`Bearer ${credential}`,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
  const data=await r.json();const result=verifyPublicationEvidence({source,approvedSource,clean,site,compiled,functions:{SITE_ID:site.id,URL:site.ssl_url},vars,credential,rpc:{data,error:!r.ok}});
  console.log(JSON.stringify({...result,source,tree:execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim(),actualFunctionsRuntime:'Must also pass health after separately authorized publication; no deployment performed'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{console.error('Publication verification failed; do not publish. No credentials printed.');process.exitCode=1;});
