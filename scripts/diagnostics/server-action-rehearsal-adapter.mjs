// Dependency injection only: importing this module never logs in or contacts staging.
// Credentials, cookies, provider bodies and preservation identities stay private.
import {runBoundedAuthReadinessDiagnostics} from './bounded-auth-readiness-harness.mjs';
const origin='https://sync-exchange-posthog-staging.netlify.app';
const project='oppijylbkcbiqfuvckgj';
const admin='6faee3df-7b4b-4d63-ba8d-1275139ccff5';
const email='sec-admin@analytics-staging.example.test';
export function createServerActionRehearsalDriver({page,context,browser,credentialProvider,anonKey,request=fetch,now=()=>Date.now()}){
 let pending,session,sessionId,loginStartedAt,loginFinishedAt,submitted=false;
 return {
  submitLogin:async({signal})=>{
   if(submitted||signal.aborted)throw Error('invalid_submission');
   await page.goto(origin+'/login',{waitUntil:'domcontentloaded',timeout:15000});
   let password=await credentialProvider();
   try{
    if(typeof password!=='string'||!password)throw Error('credential_unavailable');
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
   }finally{password=undefined;}
   if(signal.aborted)throw Error('aborted');
   // The browser submits to Next.js; Supabase's token request is server-side.
   pending=page.waitForResponse(response=>{
    const url=new URL(response.url());
    return url.origin===origin&&url.pathname==='/login'&&response.request().method()==='POST';
   },{timeout:15000});pending.catch(()=>{});
   loginStartedAt=new Date(now()).toISOString();submitted=true;
   await page.getByTestId('login-submit').click({timeout:15000});
   return {submitted:true};
  },
  observeLoginOutcome:async({signal})=>{
   if(!submitted||!pending||signal.aborted)throw Error('invalid_outcome');
   const response=await pending;
   const httpStatus=response.status();
   if(![200,303].includes(httpStatus))return {httpStatus,completed:false,authenticatedRoute:false};
   await page.waitForURL(url=>url.origin===origin&&(url.pathname==='/admin'||url.pathname.startsWith('/admin/')||url.pathname==='/login'&&url.searchParams.has('error')),{timeout:15000,waitUntil:'domcontentloaded'});
   loginFinishedAt=new Date(now()).toISOString();
   const url=new URL(page.url());
   return {httpStatus,completed:true,authenticatedRoute:url.origin===origin&&(url.pathname==='/admin'||url.pathname.startsWith('/admin/'))};
  },
  inspectSession:async()=>{
   const prefix='sb-'+project+'-auth-token';
   const chunks=(await context.cookies(origin)).filter(c=>c.name===prefix||new RegExp('^'+prefix+'\\.\\d+$').test(c.name)).sort((a,b)=>Number(a.name.slice(prefix.length+1)||0)-Number(b.name.slice(prefix.length+1)||0));
   if(!chunks.length)return {established:false};
   try{
    let encoded=chunks.map(c=>c.value).join('');
    if(encoded.startsWith('base64-'))encoded=Buffer.from(encoded.slice(7),'base64').toString();
    session=JSON.parse(encoded);
    const claims=JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url'));
    sessionId=claims.session_id;
    return {established:claims.sub===admin&&claims.iss==='https://'+project+'.supabase.co/auth/v1'&&typeof sessionId==='string'&&Number.isFinite(claims.exp),expired:claims.exp*1000<=now()};
   }catch{session=undefined;sessionId=undefined;return {established:false};}
  },
  getUser:async({signal})=>{
   const r=await request('https://'+project+'.supabase.co/auth/v1/user',{headers:{apikey:anonKey,Authorization:'Bearer '+session.access_token},redirect:'error',signal});
   const body=await r.json();return {httpStatus:r.status,verified:r.status===200,userId:body.id};
  },
  getCanonicalRole:async({signal})=>{
   const r=await request('https://'+project+'.supabase.co/rest/v1/user_profiles?select=role&id=eq.'+admin,{headers:{apikey:anonKey,Authorization:'Bearer '+session.access_token},redirect:'error',signal});
   const rows=await r.json();return {httpStatus:r.status,role:Array.isArray(rows)&&rows.length===1?rows[0].role:null};
  },
  readinessGet:async()=>context.request.get(origin+'/api/admin/analytics/validation/readiness',{timeout:15000}),
  // Private accessor for the unchanged AUTHENTICATED_REHEARSAL comparator.
  preservationAuthorization:()=>({mode:'AUTHENTICATED_REHEARSAL',approvedAdminId:admin,environmentId:project,expectedNewSessions:1,approvedSessionId:sessionId,loginStartedAt,loginFinishedAt}),
  cleanup:async()=>{session=undefined;pending=undefined;try{await context.close();}finally{await browser.close();}}
 };
}
export function runServerActionDormantRehearsal(options){
 return runBoundedAuthReadinessDiagnostics({...options,expectedAdminId:admin,loginFlow:'server-action',readinessExpectation:'dormant'});
}
