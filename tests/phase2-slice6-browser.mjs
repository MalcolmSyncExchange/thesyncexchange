import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const paths=[new URL('../app/v2-sec-intelligence-fixture-local/',import.meta.url),new URL('../app/v2-sec-financial-fixture-local/',import.meta.url)];
let server,browser;const created=[];
try {
 for(let i=0;i<paths.length;i++){await mkdir(paths[i]);created.push(paths[i]);await copyFile(new URL(`./fixtures/sec-${i?'financial':'intelligence'}-page.tsx.fixture`,import.meta.url),new URL('page.tsx',paths[i]));}
 server=spawn('./node_modules/.bin/next',['dev','--hostname','127.0.0.1','--port','3106'],{env:{...process.env,ANALYTICS_ENABLED:'false',SYNC_EXCHANGE_DEMO_MODE:'true'},stdio:'ignore'});
 let ready=false;for(let i=0;i<90;i++){if(server.exitCode!==null)throw Error('Local server stopped');try{ready=(await fetch('http://127.0.0.1:3106/v2-sec-intelligence-fixture-local')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500));}assert.ok(ready);
 browser=await chromium.launch({headless:true});const page=await browser.newPage();const errors=[];const unexpected=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1'){unexpected.push(url.origin);return route.abort();}return route.continue();});
 for(const view of ['overview','funnels','marketplace','event-health']){
  await page.goto(`http://127.0.0.1:3106/v2-sec-intelligence-fixture-local?view=${view}`);
  await page.getByRole('heading',{name:'SEC Intelligence',exact:true}).waitFor();
  const nav=page.getByRole('navigation',{name:'SEC Intelligence'});assert.equal(await nav.getByRole('link').count(),4);assert.equal(await nav.locator('[aria-current="page"]').count(),1);
  assert.equal(await page.getByRole('link',{name:'Financial Intelligence',exact:true}).getAttribute('href'),'/admin/analytics/financial');
  assert.equal(await page.locator('input[name="compare"]').isChecked(),true);
  assert.match(await page.locator('body').innerText(),/Provisional/);
  if(view==='overview'){await page.locator('section select').selectOption('submission_completed');const points=page.getByRole('button',{name:/2026-01-0[123]T/});assert.equal(await points.count(),3);await points.nth(1).hover();assert.match(await page.getByRole('tooltip').innerText(),/Completed submissions: 1/);await points.nth(0).focus();await page.keyboard.press('ArrowRight');assert.match(await page.getByRole('tooltip').innerText(),/Previous: 0/);}
  if(view==='funnels')assert.equal(await page.getByRole('heading',{name:/^(Artist|Buyer) Journey$/}).count(),2);
  if(view==='event-health'){assert.match(await page.locator('body').innerText(),/reporting visibility is unavailable/);assert.match(await page.locator('body').innerText(),/Unavailable/);}
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),view+' responsive');await page.screenshot({path:`/private/tmp/slice6-${view}-${width}.png`,fullPage:true});}
 }
 await page.goto('http://127.0.0.1:3106/v2-sec-financial-fixture-local?state=unavailable');
 await page.getByRole('heading',{name:'Financial Intelligence',exact:true}).waitFor();
 const text=await page.locator('body').innerText();assert.match(text,/Source: unavailable source/);assert.match(text,/Verified paid orders: Unavailable/);assert.match(text,/bounded projection missing/);assert.match(text,/Payout status: Unavailable/);
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`/private/tmp/slice6-financial-${width}.png`,fullPage:true});}
 assert.equal(errors.length,0,JSON.stringify(errors));assert.equal(unexpected.length,0,JSON.stringify(unexpected));
 console.log('PASS: all 5 views, active navigation and financial link, comparison controls, continuous dates, hover/focus/arrow values, provisional status, unavailable financial/reporting visibility, no page errors or external requests, 390/1280px layouts. Screenshots /private/tmp/slice6-{view}-{width}.png');
}finally{await browser?.close();server?.kill('SIGTERM');for(const path of created)await rm(path,{recursive:true,force:true});}
