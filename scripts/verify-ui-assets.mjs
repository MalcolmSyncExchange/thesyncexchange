import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const origin = process.argv[2] || 'http://127.0.0.1:3105';
const evidence = process.argv[3] ? resolve(process.argv[3]) : null;
if (evidence) mkdirSync(evidence, { recursive:true });
const browser = await chromium.launch({ headless:true });
const results = [];
try {
  for (const [name, viewport] of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]]) {
    const page = await browser.newPage({ viewport });
    const errors = [], failures = [], cancelledPrefetches = [], assets = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => {
      const failure = {url:request.url(),error:request.failure()};
      if (request.failure()?.errorText === 'net::ERR_ABORTED' && request.headers()['next-router-prefetch']) cancelledPrefetches.push(failure);
      else failures.push(failure);
    });
    page.on('response', response => {
      if (['stylesheet','script','image','font'].includes(response.request().resourceType()))
        assets.push({url:response.url(),status:response.status(),type:response.headers()['content-type']});
    });
    await page.goto(origin, {waitUntil:'networkidle'});
    const render = await page.evaluate(() => ({
      font:getComputedStyle(document.body).fontFamily,
      sheets:document.styleSheets.length,
      overflow:document.documentElement.scrollWidth > innerWidth,
      images:[...document.images].filter(image=>getComputedStyle(image).display !== 'none').map(image=>({src:image.currentSrc,loaded:image.complete && image.naturalWidth > 0}))
    }));
    if (evidence) await page.screenshot({path:resolve(evidence,`${name}.png`),fullPage:true});
    assert.ok(render.sheets >= 2, 'Global/Tailwind stylesheets must load');
    assert.ok(!render.font.includes('Times New Roman'), 'Styled typography must apply');
    assert.equal(render.overflow,false,'Responsive layout must fit viewport');
    assert.ok(render.images.length && render.images.every(image=>image.loaded),'Visible logos and hero must render');
    assert.ok(assets.some(asset=>asset.type?.includes('text/css')),'CSS must have correct MIME type');
    assert.ok(assets.some(asset=>asset.type?.includes('javascript')),'JavaScript must have correct MIME type');
    assert.ok(assets.every(asset=>asset.status===200),'All render assets must succeed');
    assert.deepEqual(errors,[],'No console or CSP errors');
    assert.deepEqual(failures,[],'No failed network requests');
    // Public navigation only; no account, analytics or payment operations.
    await page.goto(new URL('/for-buyers',origin).href,{waitUntil:'networkidle'});
    assert.ok(await page.locator('h1').isVisible(),'Public navigation must render');
    assert.deepEqual(errors,[]); assert.deepEqual(failures,[]);
    results.push({name,render,assets,errors,failures,cancelledPrefetches,navigation:'PASS'});
    await page.close();
  }
  if (evidence) writeFileSync(resolve(evidence,'results.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results.map(({name,assets,navigation})=>({name,assets:assets.length,navigation,result:'PASS'}))));
} finally { await browser.close(); }
