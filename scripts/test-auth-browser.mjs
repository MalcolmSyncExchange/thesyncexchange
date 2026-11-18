// Isolated loopback rehearsal only; no hosted credentials, transactions or deployments.
import {startAuthFixture,anonKey,serviceKey} from '../tests/helpers/auth-provider-fixture.mjs';
import {chromium,firefox,webkit,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
const output=path.resolve(process.env.TSE_AUTH_TEST_OUTPUT_DIR||'/private/tmp/tse-system01-auth-browser');await fs.mkdir(output,{recursive:true,mode:0o700});
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const fixture=await startAuthFixture(),origin=`http://127.0.0.1:${port}`;
const inherited=Object.fromEntries(['PATH','HOME','TMPDIR','LANG','SHELL','USER'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
const env={...inherited,NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_APP_URL:origin,NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,SYNC_EXCHANGE_PAYMENT_MODE:'disabled',SYNC_EXCHANGE_DEMO_MODE:'false',TSE_BUILD_DEPLOYMENT_TARGET:'local'};
const result={scope:'Real Next production server and Supabase SDK against synthetic loopback GoTrue/PostgREST; no hosted acceptance',browsers:[],assertions:[],errors:[],jobs:0,realTransactions:0};
let app;let browser;let lastPage;let actionId;
function command(args,log){const file=fs.open(path.join(output,log),'w');return file.then(async f=>{const child=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:['ignore',f.fd,f.fd]});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});await f.close();if(code!==0)throw Error(`Local command failed (${log}), exit${code}`);});}
const check=(name,fn)=>async()=>{await fn();result.assertions.push(name);console.log('PASS '+name);};
async function waitForApp(){for(let n=0;n<120;n++){try{const r=await fetch(origin+'/login');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Local Auth server did not become ready');}
async function clearAndLogin(page,email,password='SyntheticPassword!123'){
 await page.context().clearCookies();await page.goto(origin+'/login');await page.getByLabel('Email',{exact:true}).fill(email);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByTestId('login-submit').click();
}
try{
 await command(['node_modules/next/dist/bin/next','build'],'build.log');result.productionBuild='PASS';
 const handle=await fs.open(path.join(output,'server.log'),'w');app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env,stdio:['ignore',handle.fd,handle.fd]});await waitForApp();
 for(const [name,type]of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
  try{await fs.access(type.executablePath());}catch{result.browsers.push({name,status:'NOT AVAILABLE locally'});continue;}
  browser=await type.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();lastPage=page;
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||u.protocol==='data:'?route.continue():route.abort();});
  page.on('pageerror',e=>result.errors.push({browser:name,message:e.message}));
  page.on('request',request=>{if(request.headers()['next-action'])actionId=request.headers()['next-action'];});
  await check(name+': responsive buyer/artist signup and safe duplicate response',async()=>{
   for(const role of ['buyer','artist']){
    await context.clearCookies();await page.goto(origin+'/signup/'+role);await page.getByLabel('Full name',{exact:true}).fill('Synthetic '+role);await page.getByLabel('Email',{exact:true}).fill(`${name}-new-${role}@fixture.invalid`);await page.getByLabel('Password',{exact:true}).fill('SyntheticPassword!123');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('status').filter({hasText:'Check your email for the next step'}).waitFor();
    const a=fixture.accounts.get(`${name}-new-${role}@fixture.invalid`);assert.equal(fixture.profiles.get(a.id).role,role);
   }
   await page.setViewportSize({width:390,height:844});await page.goto(origin+'/signup/buyer');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(output,name+'-signup-mobile.png')});await page.setViewportSize({width:1440,height:1000});
   await page.getByLabel('Full name',{exact:true}).fill('Duplicate synthetic');await page.getByLabel('Email',{exact:true}).fill(`${name}-new-artist@fixture.invalid`);await page.getByLabel('Password',{exact:true}).fill('SyntheticPassword!123');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('status').filter({hasText:'Check your email for the next step'}).waitFor();assert.equal(fixture.profiles.get(fixture.accounts.get(`${name}-new-artist@fixture.invalid`).id).role,'artist');
  })();
  await check(name+': confirmation requires click, persists session and denies cross-role routes',async()=>{
   const token=fixture.latestToken(`${name}-new-buyer@fixture.invalid`,'signup');const before=fixture.calls.filter(c=>c.path==='/auth/v1/verify').length;await page.goto(origin+'/auth/email-action?flow=signup&type=signup&token_hash='+token);assert.equal(fixture.calls.filter(c=>c.path==='/auth/v1/verify').length,before);await page.getByRole('link',{name:'Confirm Email',exact:true}).click();await page.waitForURL(/\/onboarding\/buyer/);await page.reload();assert.match(page.url(),/\/onboarding\/buyer/);await page.goto(origin+'/artist/dashboard');await page.waitForURL(/\/onboarding\/buyer/);assert.equal((await context.cookies()).filter(c=>c.name.includes('auth-token')).every(c=>c.sameSite==='Lax'),true);
  })();
  await check(name+': System14 ordinary session cannot open recovery mutation; privacy and frame headers enforced',async()=>{
   await clearAndLogin(page,'buyer@fixture.invalid');await page.waitForURL(/\/onboarding\/buyer/);const response=await page.goto(origin+'/reset-password');
   assert.equal(await page.locator('input[name=confirmPassword]').count(),0);await page.getByRole('link',{name:'Request a new reset link'}).waitFor();const headers=response.headers();assert.equal(headers['x-frame-options'],'DENY');assert.equal(headers['x-content-type-options'],'nosniff');assert.match(headers['content-security-policy'],/frame-ancestors 'none'/);assert.equal(headers['referrer-policy'],'no-referrer');
  })();
  await check(name+': password recovery works in a fresh browser session and invalid replay fails safely',async()=>{
   await context.clearCookies();await page.goto(origin+'/forgot-password');await page.getByLabel('Email',{exact:true}).fill('buyer@fixture.invalid');await page.getByRole('button',{name:'Send Reset Instructions'}).click();await page.getByRole('status').filter({hasText:'If an account exists'}).waitFor();
   const token=fixture.latestToken('buyer@fixture.invalid','recovery');await context.clearCookies();await page.goto(origin+'/auth/email-action?flow=recovery&type=recovery&token_hash='+token);await page.getByRole('link',{name:'Reset Password',exact:true}).click();await page.waitForURL(/\/reset-password/);await page.getByLabel('New password',{exact:true}).fill('ChangedSynthetic!123');await page.getByLabel('Confirm password',{exact:true}).fill('ChangedSynthetic!123');await page.getByRole('button',{name:'Update Password',exact:true}).click();await page.waitForURL(/\/login/);assert.equal(fixture.buyer.password,'ChangedSynthetic!123');assert.equal((await context.cookies()).some(c=>c.name.startsWith('sb-127-auth-token')),false);
   await page.goto(origin+'/auth/confirm?type=recovery&token_hash='+token);await page.waitForURL(/\/forgot-password/);assert.equal(await page.locator('input[name=confirmPassword]').count(),0);
  })();
  await check(name+': login errors do not enumerate accounts and sessions expire safely',async()=>{
   await clearAndLogin(page,'missing@fixture.invalid','wrong');await page.getByRole('alert').waitFor();const missing=await page.getByRole('alert').innerText();await clearAndLogin(page,'artist@fixture.invalid','wrong');await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('alert').innerText(),missing);
   await clearAndLogin(page,'buyer@fixture.invalid','ChangedSynthetic!123');await page.waitForURL(/\/onboarding\/buyer/);await page.reload();assert.match(page.url(),/\/onboarding\/buyer/);
   const authCookies=(await context.cookies()).filter(c=>/^sb-127-auth-token(?:\.\d+)?$/.test(c.name)).sort((a,b)=>a.name.localeCompare(b.name));assert.ok(authCookies.length);const raw=authCookies.map(c=>c.value).join('');assert.ok(raw.startsWith('base64-'));const expired=JSON.parse(Buffer.from(raw.slice(7),'base64url'));expired.expires_at=Math.floor(Date.now()/1000)-60;const refreshBefore=fixture.calls.filter(c=>c.grantType==='refresh_token').length;await context.clearCookies();await context.addCookies([{...authCookies[0],name:'sb-127-auth-token',value:'base64-'+Buffer.from(JSON.stringify(expired)).toString('base64url')}]);await page.reload();await page.waitForURL(/\/onboarding\/buyer/);assert.ok(fixture.calls.filter(c=>c.grantType==='refresh_token').length>refreshBefore);await page.reload();assert.match(page.url(),/\/onboarding\/buyer/);
   fixture.invalidate(fixture.buyer.id);await page.goto(origin+'/buyer/settings');await page.waitForURL(/\/login/);
  })();
  await check(name+': admin MFA gates privileged access and verifies owned factors',async()=>{
   await clearAndLogin(page,'admin@fixture.invalid');await page.waitForURL(/\/account\/security/);await page.getByLabel('Authenticator code',{exact:true}).fill('000000');await page.getByRole('button',{name:'Verify authenticator'}).click();await page.getByRole('alert').waitFor();assert.match(page.url(),/\/account\/security/);await expect(page.getByRole('button',{name:'Verify authenticator'})).toBeEnabled();await expect(page.getByLabel('Authenticator code',{exact:true})).toHaveValue('');
   await page.getByLabel('Authenticator code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify authenticator'}).click();await page.waitForURL(/\/admin\//);await page.goto(origin+'/account/security');await page.getByRole('status').filter({hasText:'Authenticator verified for this session'}).waitFor();assert.equal((await page.content()).includes(serviceKey),false);await page.screenshot({path:path.join(output,name+'-account-security-desktop.png')});await page.getByRole('button',{name:'Log out',exact:true}).click();await page.waitForURL(origin+'/');assert.equal((await context.cookies()).some(c=>c.name.startsWith('sb-127-auth-token')),false);
  })();
  await check(name+': cross-origin Server Actions are rejected before Auth mutations',async()=>{
   await clearAndLogin(page,'buyer@fixture.invalid','ChangedSynthetic!123');await page.waitForURL(/\/onboarding\/buyer/);assert.ok(actionId);const before=fixture.calls.filter(c=>c.method!=='GET').length;const cookie=(await context.cookies()).map(c=>c.name+'='+c.value).join('; ');const rejected=await fetch(origin+'/account/security',{method:'POST',headers:{cookie,origin:'https://untrusted.fixture.invalid','next-action':actionId,'content-type':'text/plain;charset=UTF-8'},body:'[]',redirect:'manual'});assert.ok(rejected.status>=400);assert.equal(fixture.calls.filter(c=>c.method!=='GET').length,before);
  })();
  await check(name+': account security stays responsive and email changes require confirmation',async()=>{
   await page.setViewportSize({width:390,height:844});for(const pathname of ['/login','/forgot-password','/reset-password','/account/security']){await page.goto(origin+pathname);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
   await page.screenshot({path:path.join(output,name+'-account-security-mobile.png')});await page.getByLabel('New email',{exact:true}).fill(name+'-changed@fixture.invalid');await page.getByLabel('Current password',{exact:true}).fill('ChangedSynthetic!123');await page.getByRole('button',{name:'Request email change'}).click();await page.getByRole('status').filter({hasText:'check your current and new inboxes'}).waitFor();assert.equal(fixture.buyer.email,'buyer@fixture.invalid');const token=fixture.latestToken('buyer@fixture.invalid','email_change');assert.ok(token);await page.goto(origin+'/auth/email-action?flow=email_change&type=email_change&token_hash='+token+'&next=/account/security');await page.getByRole('link',{name:'Confirm Email Change',exact:true}).click();await page.waitForURL(/\/account\/security/);await page.getByText('Signed in as '+name+'-changed@fixture.invalid',{exact:true}).waitFor();await page.reload();assert.equal(fixture.buyer.email,name+'-changed@fixture.invalid');
   // Restore only the synthetic fixture identity for the next installed browser.
   fixture.accounts.delete(fixture.buyer.email);fixture.buyer.email='buyer@fixture.invalid';fixture.accounts.set(fixture.buyer.email,fixture.buyer);
  })();
  await check(name+': existing Buyer Settings cannot bypass roles and password changes revoke sessions',async()=>{
   await page.setViewportSize({width:1440,height:1000});await clearAndLogin(page,'admin@fixture.invalid');await page.waitForURL(/\/account\/security/);const denied=await page.request.post(origin+'/api/user/change-email',{headers:{origin},data:{newEmail:'forbidden@fixture.invalid',currentPassword:'SyntheticPassword!123'}});assert.equal(denied.status(),403);
   const profile=fixture.profiles.get(fixture.buyer.id);profile.onboarding_step='complete';profile.onboarding_completed_at=new Date().toISOString();await clearAndLogin(page,'buyer@fixture.invalid','ChangedSynthetic!123');await page.waitForURL(/\/buyer\//);await page.goto(origin+'/buyer/settings');await page.getByLabel('Current Password',{exact:true}).fill('ChangedSynthetic!123');await page.getByLabel('New Password',{exact:true}).fill('SettingsSynthetic!123');await page.getByLabel('Confirm New Password',{exact:true}).fill('SettingsSynthetic!123');await page.getByRole('button',{name:'Update Password',exact:true}).click();await page.waitForURL(/\/login/);assert.equal(fixture.buyer.password,'SettingsSynthetic!123');assert.equal((await context.cookies()).some(c=>c.name.startsWith('sb-127-auth-token')),false);
   await clearAndLogin(page,'buyer@fixture.invalid','SettingsSynthetic!123');await page.waitForURL(/\/buyer\//);const logout=await page.request.post(origin+'/api/user/logout-all',{headers:{origin}});assert.equal(logout.status(),200);assert.equal((await context.cookies()).some(c=>c.name.startsWith('sb-127-auth-token')),false);await page.goto(origin+'/buyer/settings');await page.waitForURL(/\/login/);fixture.buyer.password='ChangedSynthetic!123';profile.onboarding_step='basics';profile.onboarding_completed_at=null;
  })();
  await context.close();await browser.close();browser=null;result.browsers.push({name,status:'PASS'});
 }
 if(!result.browsers.some(b=>b.status==='PASS'))throw Error('No supported local browser installed');
 if(result.errors.length)throw Error('Browser runtime errors observed');
 result.status='PASS';await handle.close();
}catch(error){result.status='FAIL';result.failure=error.message;if(lastPage){result.lastPagePath=new URL(lastPage.url()).pathname;result.lastPageText=(await lastPage.locator('body').innerText().catch(()=>'' )).slice(-4000);await lastPage.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});}result.lastProviderCalls=fixture.calls.slice(-15);process.exitCode=1;console.error(error.message);console.error(JSON.stringify({path:result.lastPagePath,text:result.lastPageText,calls:result.lastProviderCalls}));}finally{
 await browser?.close();if(app){app.kill('SIGTERM');await new Promise(resolve=>{if(app.exitCode!==null)return resolve();app.once('exit',resolve);setTimeout(resolve,5000);});}await fixture.close();await fs.writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2)+'\n');
}
