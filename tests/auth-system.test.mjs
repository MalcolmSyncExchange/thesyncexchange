import * as buyerSettings from '../services/buyer/settings.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { authHarness, form, locationOf, factorId, userId, TestResponse, loadAuthModule } from './helpers/auth-system-harness.mjs';
import { hasPrivilegedAssurance, LOGIN_FAILED_MESSAGE, SIGNUP_CHECK_EMAIL_MESSAGE, isValidNewPassword } from '../services/auth/security.ts';
import { resolveEmailConfirmationUrl, buildAuthConfirmSuccessUrl } from '../services/auth/auth-flow.ts';
const signup=(role='buyer')=>form({email:' USER@fixture.invalid ',password:'SyntheticPassword!123',fullName:'Fixture Buyer',role,returnTo:'/signup/'+role});
for(const role of ['buyer','artist'])test(`${role} signup persists explicit role only after a real creation response`,async()=>{
 const h=authHarness({profile:null});const url=await locationOf(()=>h.actions.signupAction(signup(role)));
 assert.equal(url.pathname,'/signup/'+role);assert.equal(url.searchParams.get('success'),SIGNUP_CHECK_EMAIL_MESSAGE);assert.equal(h.state.rows.get(userId).role,role);
 assert.deepEqual(structuredClone(h.state.signupArgs.options.data),{full_name:'Fixture Buyer'});assert.equal(h.state.calls.includes('signIn'),false);
});
test('obfuscated duplicate signup cannot mutate role or emit signup analytics',async()=>{
 const h=authHarness({signupResponse:{data:{user:{id:userId,identities:[]},session:null},error:null}});const before=structuredClone(h.state.rows.get(userId));
 const url=await locationOf(()=>h.actions.signupAction(signup('artist')));assert.equal(url.searchParams.get('success'),SIGNUP_CHECK_EMAIL_MESSAGE);assert.deepEqual(h.state.rows.get(userId),before);assert.equal(h.state.writes.length,0);assert.equal(h.state.events.some(e=>e[0]==='signup'),false);assert.equal(h.state.calls.includes('signIn'),false);
});
test('provider duplicate-account error has the same successful response as new signup',async()=>{
 const h=authHarness({signupError:{code:'user_already_exists',message:'PRIVATE account exists'}});const url=await locationOf(()=>h.actions.signupAction(signup()));assert.equal(url.searchParams.get('success'),SIGNUP_CHECK_EMAIL_MESSAGE);assert.equal(url.searchParams.has('error'),false);assert.equal(h.state.writes.length,0);
});
test('uncertain signup transport failure cannot retry or write a profile',async()=>{
 const h=authHarness({signupThrows:true});const url=await locationOf(()=>h.actions.signupAction(signup()));assert.equal(h.state.calls.filter(c=>c==='signUp').length,1);assert.equal(h.state.writes.length,0);assert.doesNotMatch(url.href,/PRIVATE|transport/);
});
test('profile failure after signup returns resumable confirmation instructions',async()=>{
 const h=authHarness({profile:null,profileWriteFails:true});const url=await locationOf(()=>h.actions.signupAction(signup()));assert.equal(url.searchParams.get('success'),SIGNUP_CHECK_EMAIL_MESSAGE);assert.equal(h.state.events.some(e=>e[0]==='signup'),false);
});
test('admin signup and invalid new passwords are rejected before provider creation',async()=>{
 const h=authHarness();await locationOf(()=>h.actions.signupAction(signup('admin')));await locationOf(()=>h.actions.signupAction(form({email:'x@fixture.invalid',password:'short',fullName:'X',role:'buyer'})));assert.equal(h.state.calls.includes('signUp'),false);
 assert.equal(isValidNewPassword('🙂'.repeat(20)),false);
});
for(const error of [{code:'invalid_credentials',message:'PRIVATE missing account'},{code:'email_not_confirmed',message:'PRIVATE unconfirmed account'}])test(`login error ${error.code} is enumeration-safe`,async()=>{
 const h=authHarness({loginError:error});const url=await locationOf(()=>h.actions.loginAction(form({email:'USER@fixture.invalid',password:'wrong'})));assert.equal(url.searchParams.get('error'),LOGIN_FAILED_MESSAGE);assert.doesNotMatch(url.href,/PRIVATE/);
});
for(const role of ['buyer','artist','admin'])test(`${role} login uses canonical role and preserves profile state`,async()=>{
 const h=authHarness({role,metadataRole:role==='buyer'?'admin':'buyer'});const before=structuredClone(h.state.rows.get(userId));const url=await locationOf(()=>h.actions.loginAction(form({email:'USER@fixture.invalid',password:'existing-short'})));assert.equal(url.pathname,'/dashboard/'+role);assert.deepEqual(h.state.rows.get(userId),before);assert.equal(h.state.writes.length,0);
});
test('assigned buyer role cannot be switched through onboarding action',async()=>{
 const h=authHarness();const url=await locationOf(()=>h.actions.selectOnboardingRoleAction(form({role:'artist'})));assert.equal(url.pathname,'/dashboard/buyer');assert.equal(h.state.rows.get(userId).role,'buyer');assert.equal(h.state.writes.length,0);
});
test('concurrent conflicting role selection is one-time and preserves the winning role',async()=>{
 const h=authHarness({profile:{id:userId,email:'user@fixture.invalid',role:null,full_name:'Fixture',onboarding_payload:{preserve:'yes'}}});
 await Promise.all([locationOf(()=>h.actions.selectOnboardingRoleAction(form({role:'buyer'}))),locationOf(()=>h.actions.selectOnboardingRoleAction(form({role:'artist'})))]);
 assert.equal(h.state.writes.filter(w=>w.role).length,1);assert.ok(['buyer','artist'].includes(h.state.rows.get(userId).role));assert.deepEqual(h.state.rows.get(userId).onboarding_payload,{preserve:'yes'});
});
test('missing profile can resume role selection without replacing an existing identity',async()=>{
 const h=authHarness({profile:null});const url=await locationOf(()=>h.actions.selectOnboardingRoleAction(form({role:'artist'})));assert.equal(url.pathname,'/onboarding/artist');assert.equal(h.state.rows.get(userId).role,'artist');
});
test('logout provider failure still clears only this project auth cookies',async()=>{
 const h=authHarness({logoutFails:true,cookies:{'sb-127-auth-token.0':'SYNTHETIC','sb-127-auth-token-code-verifier':'SYNTHETIC','other-cookie':'keep','sync-exchange-session':'SYNTHETIC'}});const url=await locationOf(()=>h.actions.logoutAction());assert.equal(url.pathname,'/login');assert.equal(h.state.cookieValues.get('other-cookie'),'keep');assert.equal(h.state.cookieValues.size,1);assert.match(url.searchParams.get('success'),/Other sessions/);
});
test('expired password recovery cannot update a password',async()=>{
 const h=authHarness({expired:true});const url=await locationOf(()=>h.actions.updatePasswordAction(form({password:'SyntheticPassword!123',confirmPassword:'SyntheticPassword!123'})));assert.equal(url.pathname,'/forgot-password');assert.equal(h.state.calls.includes('updateUser'),false);
});
test('verified recovery updates password and signs out all sessions before returning to login',async()=>{
 const h=authHarness({recovery:true});const url=await locationOf(()=>h.actions.updatePasswordAction(form({password:'SyntheticPassword!123',confirmPassword:'SyntheticPassword!123'})));assert.equal(url.pathname,'/login');assert.match(url.searchParams.get('success'),/Password updated/);assert.ok(h.state.calls.indexOf('updateUser')<h.state.calls.indexOf('signOut:global'));
});
test('canonical admin requires a fresh verified factor and AAL2, ignoring metadata',async()=>{
 for(const opts of [{role:'admin'},{role:'admin',aal:'aal2'},{role:'admin',aal:'aal1',factors:[{id:factorId,status:'verified'}]}]){
  const h=authHarness(opts);assert.equal(await hasPrivilegedAssurance(h.client),false);const url=await locationOf(()=>h.session.requireSession('admin'));assert.equal(url.pathname,'/account/security');
 }
 const h=authHarness({role:'admin',aal:'aal2',factors:[{id:factorId,status:'verified'}]});assert.equal(await hasPrivilegedAssurance(h.client),true);assert.equal((await h.session.requireSession('admin')).role,'admin');
});
test('unknown canonical role or profile read failure cannot obtain admin authorization',async()=>{
 const h=authHarness({metadataRole:'admin',profileReadError:true});assert.equal(await h.session.getSessionUser(),null);
 const blocked=authHarness({role:'buyer',metadataRole:'admin'});const url=await locationOf(()=>blocked.session.requireSession('admin'));assert.equal(url.pathname,'/dashboard/buyer');
});
test('MFA verification rejects factors outside the authenticated account before challenge',async()=>{
 const h=authHarness({role:'admin'});const result=await h.account().verifyTotpAction({},form({factorId,code:'123456'}));assert.match(result.error,/unavailable/);assert.equal(h.state.calls.includes('challenge'),false);
});
test('MFA enrollment is restricted to canonical admins',async()=>{
 const h=authHarness({metadataRole:'admin'});const result=await h.account().enrollTotpAction();assert.match(result.error,/Only administrators/);assert.equal(h.state.calls.includes('enroll'),false);
});
test('MFA challenge verifies an owned factor and prevents an external continuation',async()=>{
 const h=authHarness({role:'admin',factors:[{id:factorId,status:'verified',factor_type:'totp'}]});const url=await locationOf(()=>h.account().verifyTotpAction({},form({factorId,code:'123456',next:'https://evil.invalid'})));assert.equal(url.pathname,'/dashboard/admin');assert.deepEqual(h.state.calls.filter(x=>['challenge','verify'].includes(x)),['challenge','verify']);
});
test('failed or expired MFA code never promotes the session',async()=>{
 const h=authHarness({role:'admin',verifyFails:true,factors:[{id:factorId,status:'verified',factor_type:'totp'}]});const result=await h.account().verifyTotpAction({},form({factorId,code:'123456'}));assert.match(result.error,/invalid or expired/);assert.equal(await hasPrivilegedAssurance(h.client),false);
});
test('email change verifies current password without replacing the original session',async()=>{
 const h=authHarness();const result=await h.account().updateAccountEmailAction({},form({email:'new@fixture.invalid',currentPassword:'old password'}));assert.ok(result.success);assert.equal(h.state.updateArgs.email,'new@fixture.invalid');assert.equal(h.state.updateOptions.emailRedirectTo,'http://127.0.0.1:3333/auth/confirm?next=%2Faccount%2Fsecurity');assert.ok(h.state.calls.includes('temporarySignOut'));
 const bad=authHarness({reauthWrongUser:true});assert.ok((await bad.account().updateAccountEmailAction({},form({email:'new@fixture.invalid',currentPassword:'bad'}))).error);assert.equal(bad.state.calls.includes('updateUser'),false);
});
for(const error of [true,false])test(`actual confirmation route persists token cookies with provider error=${error}`,async()=>{
 const h=authHarness({otpError:error});const response=await h.callback().GET(new Request('http://127.0.0.1:3333/auth/confirm?token_hash=SYNTHETIC&type=signup'));
 assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0');assert.equal(response.headers.get('referrer-policy'),'no-referrer');assert.equal(response.writes.get('sb-fixture-auth-token').value,error?'':'ROTATED_SYNTHETIC');assert.doesNotMatch(response.headers.get('location'),/SYNTHETIC|token_hash|PRIVATE/);
});
test('invalid callback types or mixed credentials are rejected before provider access',async()=>{
 for(const params of ['token_hash=SYNTHETIC&type=admin','code=SYNTHETIC&token_hash=SYNTHETIC&type=signup']){
 const h=authHarness();const response=await h.callback().GET(new Request('http://127.0.0.1:3333/auth/confirm?'+params));assert.equal(new URL(response.headers.get('location')).pathname,'/login');assert.equal(h.state.calls.includes('verifyOtp'),false);}
});
test('missing PKCE verifier never exchanges a callback code',async()=>{
 const h=authHarness();const response=await h.callback().GET(new Request('http://127.0.0.1:3333/auth/confirm?code=SYNTHETIC'));assert.equal(new URL(response.headers.get('location')).pathname,'/login');assert.equal(h.state.calls.includes('exchangeCode'),false);
});
test('confirmation links permit only exact Auth origins and endpoints',()=>{
 const app='https://app.fixture.invalid',provider='https://project.supabase.co';
 assert.ok(resolveEmailConfirmationUrl(provider+'/auth/v1/verify?token=SYNTHETIC',app,provider));
 for(const bad of ['http://project.supabase.co/auth/v1/verify','https://project.supabase.co/storage/v1/object/public/phish','https://name:password@project.supabase.co/auth/v1/verify','https://app.fixture.invalid.evil.invalid/auth/confirm',provider+'/auth/v1/verify?redirect_to=https://evil.invalid'])assert.equal(resolveEmailConfirmationUrl(bad,app,provider),null);
});
test('callback continuation strips sensitive token parameters, including mixed case',()=>{
 const url=buildAuthConfirmSuccessUrl({appOrigin:'https://app.fixture.invalid',destinationPath:'/onboarding?access_token=SYNTHETIC&REFRESH_TOKEN=SYNTHETIC&step=basics'});assert.doesNotMatch(url,/SYNTHETIC|access_token|REFRESH_TOKEN/);assert.match(url,/step=basics/);
});

test('revoked privileged sessions are denied even with a valid factor and AAL2',async()=>{
 const h=authHarness({role:'admin',aal:'aal2',revoked:true,factors:[{id:factorId,status:'verified'}]});assert.equal(await hasPrivilegedAssurance(h.client),false);const url=await locationOf(()=>h.session.requireSession('admin'));assert.equal(url.pathname,'/account/security');
});

test('admin can restart interrupted enrollment without deleting a verified authenticator',async()=>{
 const h=authHarness({role:'admin',factors:[{id:factorId,status:'unverified',factor_type:'totp'}]});
 const setup=await h.account().enrollTotpAction();assert.equal(setup.factorId,factorId);assert.ok(setup.qrCode);assert.ok(h.state.calls.includes('unenroll:'+factorId));assert.ok(h.state.calls.includes('enroll'));
 const verified=authHarness({role:'admin',factors:[{id:factorId,status:'verified',factor_type:'totp'}]});assert.ok((await verified.account().enrollTotpAction()).error);assert.equal(verified.state.calls.some(c=>c.startsWith('unenroll')),false);
});
test('recovery service treats missing-account responses exactly like successful delivery',async()=>{
 const {requestPasswordResetEmail}=await import('../services/auth/auth-flow.ts');const common={authMode:'supabase',email:'user@fixture.invalid',emailDomain:'fixture.invalid',redirectTo:'http://127.0.0.1/reset-password',logEvent:()=>{},logError:()=>{}};
 const success=await requestPasswordResetEmail({...common,supabase:{auth:{resetPasswordForEmail:async()=>({data:{},error:null})}}});
 const missing=await requestPasswordResetEmail({...common,supabase:{auth:{resetPasswordForEmail:async()=>({data:null,error:{code:'user_not_found',message:'PRIVATE_ACCOUNT_DETAIL'}})}}});assert.deepEqual(missing,success);
});

for(const expired of [true,false])test(`middleware preserves all refresh/clear cookie batches with expired=${expired}`,async()=>{
 const maintenance=await import('../lib/maintenance-mode.mjs');const h=authHarness({expired});
 h.client.auth.getUser=async()=>{h.options.cookieOptions.setAll([{name:'sb-fixture-auth-token.0',value:'',options:{maxAge:0,sameSite:'lax'}}]);h.options.cookieOptions.setAll([{name:'sb-fixture-auth-token',value:expired?'':'ROTATED_SYNTHETIC',options:{maxAge:expired?0:3600,sameSite:'lax'}}]);return {data:{user:expired?null:{id:userId}},error:expired?{code:'expired'}:null};};
 const middleware=loadAuthModule('middleware.ts',{...h.modules,'@/lib/maintenance-mode.mjs':maintenance});const url=new URL('http://127.0.0.1:3333/buyer/settings?tab=profile');
 const response=await middleware.middleware({url:url.href,nextUrl:url,cookies:h.cookieStore,method:'GET'});
 assert.equal(response.writes.size,2);assert.equal(response.writes.get('sb-fixture-auth-token.0').maxAge,0);assert.equal(response.writes.get('sb-fixture-auth-token').value,expired?'':'ROTATED_SYNTHETIC');assert.match(response.headers.get('cache-control'),/private, no-store/);
 if(expired){const location=new URL(response.headers.get('location'));assert.equal(location.pathname,'/login');assert.equal(location.searchParams.get('redirectTo'),'/buyer/settings?tab=profile');}
});
test('public auth pages refresh sessions, while marketing and similar path prefixes remain public',async()=>{
 const maintenance=await import('../lib/maintenance-mode.mjs');const h=authHarness({expired:true});const middleware=loadAuthModule('middleware.ts',{...h.modules,'@/lib/maintenance-mode.mjs':maintenance});
 for(const path of ['/login','/reset-password']){const u=new URL(path,'http://127.0.0.1:3333');const r=await middleware.middleware({url:u.href,nextUrl:u,cookies:h.cookieStore,method:'GET'});assert.equal(r.status,200);assert.match(r.headers.get('cache-control'),/no-store/);}
 const before=h.state.calls.length;for(const path of ['/','/buyers-guide','/artists-guide']){const u=new URL(path,'http://127.0.0.1:3333');assert.equal((await middleware.middleware({url:u.href,nextUrl:u,cookies:h.cookieStore,method:'GET'})).status,200);}assert.equal(h.state.calls.length,before);
});
test('interrupted recovery session/profile reads never update a password or leak provider details',async()=>{
 for(const options of [{sessionThrows:true},{profileReadError:true}]){const h=authHarness(options);const url=await locationOf(()=>h.actions.updatePasswordAction(form({password:'SyntheticPassword!123',confirmPassword:'SyntheticPassword!123'})));assert.doesNotMatch(url.href,/PRIVATE/);assert.equal(h.state.calls.includes('updateUser'),false);}
});

const accountRequest=(path,body,origin='http://127.0.0.1:3333')=>new Request('http://127.0.0.1:3333/api/user/'+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body||{})});
const accountRoute=(h,name)=>loadAuthModule('app/api/user/'+name+'/route.ts',{...h.modules,'@/services/buyer/settings':buyerSettings}).POST;
for(const route of ['change-password','change-email','logout-all'])test(`legacy ${route} rejects foreign origins, wrong canonical roles and missing sessions`,async()=>{
 for(const options of [{role:'artist'},{role:'admin',aal:'aal2',factors:[{status:'verified'}]},{expired:true}]){const h=authHarness(options);const result=await accountRoute(h,route)(accountRequest(route,{}));assert.ok([401,403].includes(result.status));assert.equal(h.state.calls.includes('updateUser'),false);}
 const h=authHarness();const result=await accountRoute(h,route)(accountRequest(route,{},'https://untrusted.invalid'));assert.equal(result.status,403);assert.equal(h.state.calls.length,0);
});
for(const route of ['change-password','change-email'])test(`legacy ${route} cannot bypass an enrolled buyer authenticator`,async()=>{
 const h=authHarness({factors:[{id:factorId,status:'verified'}]});const result=await accountRoute(h,route)(accountRequest(route,{currentPassword:'existing-password',newEmail:'next@fixture.invalid',newPassword:'SyntheticPassword!123',confirmPassword:'SyntheticPassword!123'}));assert.equal(result.status,403);assert.equal(h.state.calls.includes('updateUser'),false);
});
test('legacy password change preserves original MFA during reauthentication, revokes sessions and clears local cookies',async()=>{
 const h=authHarness({cookies:{'sb-127-auth-token':'SYNTHETIC','other-cookie':'keep'}});const result=await accountRoute(h,'change-password')(accountRequest('change-password',{currentPassword:'old password',newPassword:'SyntheticPassword!123',confirmPassword:'SyntheticPassword!123'}));assert.equal(result.status,200);assert.equal(h.state.updateArgs.password,'SyntheticPassword!123');assert.ok(h.state.calls.includes('temporarySignOut'));assert.ok(h.state.calls.includes('signOut:global'));assert.equal(h.state.calls.includes('signIn'),false);assert.equal(h.state.cookieValues.get('other-cookie'),'keep');assert.equal(h.state.cookieValues.has('sb-127-auth-token'),false);assert.match((await result.json()).redirectTo,/^\/login/);
});
test('legacy email change requires the current password and uses the protected confirmation mechanism',async()=>{
 const missing=authHarness();assert.equal((await accountRoute(missing,'change-email')(accountRequest('change-email',{newEmail:'next@fixture.invalid'}))).status,400);assert.equal(missing.state.calls.includes('updateUser'),false);
 const h=authHarness();const result=await accountRoute(h,'change-email')(accountRequest('change-email',{newEmail:'next@fixture.invalid',currentPassword:'old password'}));assert.equal(result.status,200);assert.match(h.state.updateOptions.emailRedirectTo,/^http:\/\/127\.0\.0\.1:3333\/auth\/confirm/);assert.equal(h.state.calls.includes('signIn'),false);
});
test('legacy password failure, oversized input and failed provider logout remain safe and truthful',async()=>{
 const h=authHarness({updateFails:true});const result=await accountRoute(h,'change-password')(accountRequest('change-password',{currentPassword:'old password',newPassword:'SyntheticPassword!123',confirmPassword:'SyntheticPassword!123'}));assert.equal(result.status,503);assert.doesNotMatch(JSON.stringify(await result.json()),/PRIVATE/);assert.equal(h.state.calls.includes('signOut:global'),false);
 const large=authHarness();assert.equal((await accountRoute(large,'change-email')(accountRequest('change-email',{newEmail:'x'.repeat(9000)}))).status,400);assert.equal(large.state.calls.includes('updateUser'),false);
 const logout=authHarness({logoutFails:true,cookies:{'sb-127-auth-token':'SYNTHETIC'}});const denied=await accountRoute(logout,'logout-all')(accountRequest('logout-all'));assert.match((await denied.json()).message,/Other sessions could not be confirmed/);assert.equal(logout.state.cookieValues.has('sb-127-auth-token'),false);
});
test('Buyer Settings password policy matches signup/recovery and rejects byte truncation',()=>{
 assert.equal(buyerSettings.validatePasswordChange({currentPassword:'old',newPassword:'12345678',confirmPassword:'12345678'}).ok,false);assert.equal(buyerSettings.validatePasswordChange({currentPassword:'old',newPassword:'🙂'.repeat(20),confirmPassword:'🙂'.repeat(20)}).ok,false);
});
