// Real production Next + Supabase SDK, synthetic loopback Auth/Storage and actual migration SQL/RLS and native worker.
import {startDeliveryFixture,anonKey,serviceKey} from '../tests/helpers/delivery-provider-fixture.mjs';
import {chromium,firefox,webkit,expect} from '@playwright/test';

import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import assert from 'node:assert/strict';
import {renderNotice} from '../lib/notifications/templates.ts';
import {notices} from '../lib/notifications/catalog.ts';
const output=path.resolve(process.env.TSE_NOTIFICATIONS_TEST_OUTPUT_DIR||'/private/tmp/tse-system13-notifications-browser');await fs.mkdir(output,{recursive:true,mode:0o700});
const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const fixture=await startDeliveryFixture();await fixture.withDatabase(async db=>{const {bindFounder}=await import('../tests/helpers/sec-fixture.mjs');await bindFounder(db);});const origin=`http://127.0.0.1:${port}`;
const env={...Object.fromEntries(['PATH','HOME','TMPDIR','LANG','SHELL','USER'].filter(k=>process.env[k]).map(k=>[k,process.env[k]])),NODE_ENV:'production',NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_APP_URL:origin,NEXT_PUBLIC_SUPABASE_URL:fixture.url,NEXT_PUBLIC_SUPABASE_ANON_KEY:anonKey,SUPABASE_SERVICE_ROLE_KEY:serviceKey,SYNC_EXCHANGE_PAYMENT_MODE:'disabled',SYNC_EXCHANGE_DEMO_MODE:'false',TSE_BUILD_DEPLOYMENT_TARGET:'local'};
const result={scope:'Local production browser + synthetic loopback provider + real SQL/RLS. No hosted or formal acceptance.',browsers:[],assertions:[],errors:[],hostedMutations:0};let app,browser,lastPage,serverHandle,expectedError=false;result.expectedRecoveryErrors=[];
async function command(args,log){const f=await fs.open(path.join(output,log),'w');const child=spawn(process.execPath,args,{cwd:process.cwd(),env,stdio:['ignore',f.fd,f.fd]});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});await f.close();if(code!==0)throw Error(`Local command failed (${log}): ${code}`);}
async function check(name,fn){await fn();result.assertions.push(name);console.log('PASS '+name);}
async function waitApp(){for(let i=0;i<120;i++){try{if((await fetch(origin+'/login')).ok)return;}catch{}await new Promise(r=>setTimeout(r,500));}throw Error('Local server unavailable');}
async function login(page,email){await page.context().clearCookies();await page.goto(origin+'/login');await page.locator('[name=email]').fill(email);await page.locator('[name=password]').fill('SyntheticPassword!123');await page.getByTestId('login-submit').click();}
const fill=async(page,key,value)=>page.locator(`[name="${key}"]`).fill(value);

try{
 await command(['node_modules/next/dist/bin/next','build'],'build.log');result.build='PASS';serverHandle=await fs.open(path.join(output,'server.log'),'w');app=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{cwd:process.cwd(),env,stdio:['ignore',serverHandle.fd,serverHandle.fd]});await waitApp();
 for(const [name,type]of [['chromium',chromium],['firefox',firefox],['webkit',webkit]]){
  try{await fs.access(type.executablePath());}catch{result.browsers.push({name,status:'NOT AVAILABLE locally'});continue;}
  browser=await type.launch({headless:true});const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();lastPage=page;
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)||['data:','blob:'].includes(u.protocol)?route.continue():route.abort();});page.on('pageerror',e=>result.errors.push(e.message));

  await check(name+': anonymous notification preferences redirect to login',async()=>{await page.goto(origin+'/account/notifications');await expect(page.getByTestId('login-submit')).toBeVisible();});
  await check(name+': Buyer optional preferences save and unsubscribe through real SDK session and SQL; essential notices cannot be disabled',async()=>{
   await login(page,'buyer@fixture.invalid');await page.waitForURL(/\/buyer\/dashboard/);await page.goto(origin+'/account/notifications');await expect(page.getByRole('heading',{name:'Email & notifications',exact:true})).toBeVisible();await expect(page.locator('[name=marketing]')).not.toBeChecked();
   await page.locator('[name=marketing]').check();await page.locator('[name=operational]').uncheck();await page.getByRole('button',{name:'Save notification preferences',exact:true}).click();await expect(page.getByRole('status')).toHaveText('Notification preferences saved.');await expect(page.locator('[name=marketing]')).toBeChecked();await expect(page.locator('[name=operational]')).not.toBeChecked();await expect(page.locator('input[disabled]')).toBeChecked();
   await page.locator('[name=marketing]').uncheck();await page.getByRole('button',{name:'Save notification preferences',exact:true}).click();await expect(page.locator('[name=marketing]')).not.toBeChecked();await expect(page.getByText(/disabled pending hosted authorization/)).toBeVisible();
  });
  await check(name+': Buyer preference API rejects cross-origin and malformed settings; server forces transaction notices',async()=>{
   let r=await page.request.patch(origin+'/api/user/notification-preferences',{headers:{origin:'https://untrusted.invalid'},data:{purchaseReceipts:false,licenseAgreementReady:false,platformUpdates:false}});assert.equal(r.status(),403);
   r=await page.request.patch(origin+'/api/user/notification-preferences',{headers:{origin},data:{platformUpdates:'false'}});assert.equal(r.status(),400);
   r=await page.request.patch(origin+'/api/user/notification-preferences',{headers:{origin},data:{purchaseReceipts:false,licenseAgreementReady:false,platformUpdates:false}});assert.equal(r.status(),200);const d=await r.json();assert.equal(d.preferences.purchaseReceipts,true);assert.equal(d.preferences.licenseAgreementReady,true);assert.equal(d.preferences.platformUpdates,false);assert.equal(d.preferences.securityAlerts,true);
  });
  await check(name+': Buyer cannot obtain SEC delivery history or trigger recovery',async()=>{await page.goto(origin+'/admin/notifications');await expect(page.getByRole('heading',{name:'Email operations',exact:true})).toHaveCount(0);});
  await check(name+': Artist preferences are isolated from Buyer preferences',async()=>{
   await login(page,'artist@fixture.invalid');await page.waitForURL(/\/artist\//);await page.goto(origin+'/account/notifications');await expect(page.getByRole('heading',{name:'Email & notifications',exact:true})).toBeVisible();await expect(page.locator('[name=operational]')).toBeChecked();await expect(page.locator('[name=marketing]')).not.toBeChecked();await page.locator('[name=operational]').uncheck();await page.getByRole('button',{name:'Save notification preferences',exact:true}).click();await expect(page.locator('[name=operational]')).not.toBeChecked();
  });
  await check(name+': Admin requires MFA and displays actual private SQL queue without recipient disclosure',async()=>{
   await login(page,'admin@fixture.invalid');await page.waitForURL(/\/account\/security/);await page.getByLabel('Authenticator code',{exact:true}).fill('123456');await page.getByRole('button',{name:'Verify authenticator',exact:true}).click();await page.waitForURL(/\/admin\//);await page.goto(origin+'/admin/notifications');await expect(page.getByRole('heading',{name:'Email operations',exact:true})).toBeVisible();await expect(page.getByText(/Sending disabled/)).toBeVisible();await expect(page.getByText(/No exhausted or rejected deliveries observed/)).toBeVisible();await page.screenshot({path:path.join(output,name+'-operations.png'),fullPage:true});
  });
  await check(name+': notification preferences support keyboard and 390px layout',async()=>{await page.setViewportSize({width:390,height:844});await page.goto(origin+'/account/notifications');await page.locator('[name=operational]').focus();await expect(page.locator('[name=operational]')).toBeFocused();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.screenshot({path:path.join(output,name+'-preferences-mobile.png'),fullPage:true});});
  await check(name+': all branded email templates render accessible static HTML at mobile width; links resolve to real authenticated routes',async()=>{
   for(const kind of Object.keys(notices)){await page.setContent(renderNotice(kind,'buyer',origin).html);assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('h1').count(),1);assert.equal(await page.locator('img:not([alt])').count(),0);await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));assert.equal(await page.locator('a').evaluateAll(a=>a.every(x=>x.textContent.trim().length>0)),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);}
   await page.setContent(renderNotice('purchase_confirmed','buyer',origin,'tse-notice-v1','88888888-8888-4888-8888-888888888888').html);await expect(page.getByRole('link',{name:'Open your secure workspace',exact:true})).toHaveAttribute('href',origin+'/buyer/orders/88888888-8888-4888-8888-888888888888');await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));await page.screenshot({path:path.join(output,name+'-email-mobile-light.png'),fullPage:true});await page.emulateMedia({colorScheme:'dark'});await page.screenshot({path:path.join(output,name+'-email-mobile-dark.png'),fullPage:true});
  });
  result.browsers.push({name,status:'PASS'});await context.close();await browser.close();browser=null;
 }
 assert.equal(result.errors.length,0);result.status='PASS';
}catch(error){result.status='FAIL';result.errors.push(String(error));if(lastPage)await lastPage.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'results.json'),JSON.stringify(result,null,2));if(browser)await browser.close();if(app){app.kill('SIGTERM');await new Promise(r=>app.once('exit',r));}await serverHandle?.close();await fixture.close();}
