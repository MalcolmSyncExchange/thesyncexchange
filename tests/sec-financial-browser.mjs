import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, copyFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const fixture = new URL('../app/v2-sec-financial-fixture-local/',import.meta.url);
await mkdir(fixture);
let server, browser;
try {
 await copyFile(new URL('./fixtures/sec-financial-page.tsx.fixture',import.meta.url),new URL('page.tsx',fixture));
 server=spawn('./node_modules/.bin/next',['dev','--hostname','127.0.0.1','--port','3105'],{env:{...process.env,SYNC_EXCHANGE_DEMO_MODE:'true'},stdio:'ignore'});
 let ready=false;
 for(let i=0;i<60;i++) { if(server.exitCode!==null)throw Error('Fixture server failed');try{ready=(await fetch('http://127.0.0.1:3105/v2-sec-financial-fixture-local')).ok;}catch{}if(ready)break;await new Promise(r=>setTimeout(r,500)); }
 assert.ok(ready,'Local server readiness');
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 await page.goto('http://127.0.0.1:3105/v2-sec-financial-fixture-local');
 await page.getByRole('heading',{name:'Financial Intelligence',exact:true}).waitFor();
 assert.equal(await page.locator('select[name="mode"]').inputValue(),'test');
 assert.equal(await page.locator('select[name="interval"]').inputValue(),'day');
 assert.equal(await page.locator('input[name="compare"]').isChecked(),true);
 const chart=page.getByRole('button',{name:/2026-10-0[123]T/});assert.equal(await chart.count(),3);
 await chart.nth(1).hover();assert.match(await chart.nth(1).getAttribute('title'),/USD 10,000/);
 await chart.nth(0).focus();assert.match(await chart.nth(0).getAttribute('aria-label'),/USD 0/);
 await page.getByRole('combobox',{name:'Metric',exact:true}).selectOption('refundsMinor');
 assert.match(await chart.nth(1).getAttribute('title'),/USD 0/);
 assert.match(await page.locator('body').innerText(),/Marketplace commission: Unavailable/);
 assert.match(await page.locator('body').innerText(),/pending reconciliation: 1/);
 const html=await page.content();assert.ok(!html.includes('private-payment'));assert.ok(!html.includes('private-order'));
 for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 console.log('PASS: financial controls, currency labels, hover/focus values, refund selector, reconciliation, unavailable accounting, privacy, 390/1280px layout');
} finally {await browser?.close();if(server&&server.exitCode===null){const stopped=new Promise(resolve=>server.once('exit',resolve));server.kill('SIGTERM');await stopped;}await rm(fixture,{recursive:true,force:true});await rm(new URL("../.next/dev/types/validator.ts",import.meta.url),{force:true});}
