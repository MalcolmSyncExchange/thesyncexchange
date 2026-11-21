import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import * as jsx from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import {renderToStaticMarkup} from 'react-dom/server';
import {loadAuthModule,authHarness} from './helpers/auth-system-harness.mjs';
const Link=({children,...props})=>React.createElement('a',props,children);
const Image=({priority,...props})=>React.createElement('img',props);
const user={id:'44444444-4444-4444-8444-444444444444',role:'admin',fullName:'Synthetic SEC Admin'};
function shell(props={}) {
 const {AdminShell}=loadAuthModule('components/admin-v2/admin-shell.tsx',{'react/jsx-runtime':jsx,react:React,'next/image':{default:Image},'next/link':{default:Link},'next/navigation':{usePathname:()=>'/admin/accounting'},'lucide-react':icons,'@/components/layout/brand-assets':{BrandLogo:()=>null},'@/components/layout/theme-toggle':{ThemeToggle:()=>null},'@/services/auth/actions':{logoutAction:'/unused'},'./admin-shell.module.css':{default:{}}});
 return renderToStaticMarkup(React.createElement(AdminShell,{user,...props},React.createElement('h1',null,'Finance test')));
}
test('authorized founder and full SEC Admin see a clearly named, selected Financial Dashboard before commerce',()=>{
 for(const founder of [true,false]){const html=shell({financialAccess:true,founder,capabilities:['full_admin']});assert.match(html,/<a[^>]*href="\/admin\/accounting"[^>]*aria-current="page"[^>]*>.*?Financial Dashboard/);assert.ok(html.indexOf('Financial Dashboard')<html.indexOf('People + commerce'));assert.doesNotMatch(html,/Financial accounting/);}
});
test('finance navigation survives unavailable unrelated SEC context only with affirmative financial permission',()=>{
 assert.match(shell({financialAccess:true,capabilities:[]}),/Financial Dashboard/);
 for(const props of [{},{founder:true},{capabilities:['full_admin']},{financialAccess:false,capabilities:['support']}])assert.doesNotMatch(shell(props),/href="\/admin\/accounting"/);
});
function layout({authorized=true,permission=true,rpcError=null,contextError=false,transportError=false,clientError=false,demo=false,noConfig=false}={}) {
 const calls=[];
 const modules={'@/lib/env':{hasSupabaseEnv:!noConfig,env:{demoMode:demo}},'react/jsx-runtime':jsx,'@/components/admin-v2/admin-shell':{AdminShell:()=>null},'@/services/auth/session':{requireSession:async role=>{calls.push(role);if(!authorized)throw Error('ACCESS_DENIED');return user;}},'@/services/admin/sec':{secRequest:async()=>{calls.push('context');if(contextError)throw Error('SEC_CONTEXT_RATE_LIMITED');return{capabilities:['support'],founder:false};}},'@/services/supabase/server':{createServerSupabaseClient:async()=>{calls.push('client');if(clientError)throw Error('PRIVATE client configuration');return{rpc:(name,args)=>{calls.push({name,args});return transportError?Promise.reject(Error('PRIVATE transport')):Promise.resolve({data:permission,error:rpcError});}};}}};
 return {run:loadAuthModule('app/(app)/admin/layout.tsx',modules).default,calls};
}
test('actual layout authenticates before opening the reader and checks the existing database permission',async()=>{
 const denied=layout({authorized:false});await assert.rejects(denied.run({children:null}));assert.deepEqual(denied.calls,['admin']);
 const h=layout({contextError:true});const view=await h.run({children:null});assert.equal(view.props.financialAccess,true);assert.deepEqual(JSON.parse(JSON.stringify(h.calls.find(x=>typeof x==='object'))),{name:'sec_has_capability',args:{p_cap:'full_admin'}});assert.equal(view.props.capabilities.length,0);
});
test('denied, expired/revoked or failed permission checks never become a financial navigation grant',async()=>{
 for(const options of [{permission:false},{permission:null},{rpcError:{code:'42501',message:'PRIVATE'}},{rpcError:{code:'XX000'}},{transportError:true},{clientError:true}])assert.equal((await layout(options).run({children:null})).props.financialAccess,false);
});

test('post-login routing preserves the direct finance URL only for the correct role',()=>{
 const {session}=authHarness();const path='/admin/accounting?page=2';
 assert.equal(session.resolvePostLoginRedirect({role:'admin',onboardingComplete:true},path),path);
 assert.equal(session.resolvePostLoginRedirect({role:'artist',onboardingComplete:true},path),'/dashboard/artist');
 assert.equal(session.resolvePostLoginRedirect({role:'buyer',onboardingComplete:true},path),'/dashboard/buyer');
 assert.equal(session.resolvePostLoginRedirect({role:'admin',onboardingComplete:true},'https://attacker.invalid/admin/accounting'),'/dashboard/admin');
});

test('local demo and unconfigured environments do not open a provider reader or invent financial access',async()=>{for(const options of [{demo:true},{noConfig:true}]){const h=layout(options);assert.equal((await h.run({children:null})).props.financialAccess,false);assert.equal(h.calls.includes('client'),false);}});
