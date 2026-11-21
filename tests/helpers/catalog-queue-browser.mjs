import {expect} from '@playwright/test';
import assert from 'node:assert/strict';

// Intercept only list reads. Authentication, navigation and later workflows use the local fixture.
export async function verifyCatalogQueue({page,origin,track,output,name}) {
 const url=origin+'/admin/review-queue?view=catalog';
 const empty=page.getByRole('heading',{name:'No catalog submissions awaiting review',exact:true});
 const record=page.getByRole('link',{name:'Open review for Queue state regression recording',exact:true});
 const data={items:[{id:track,title:'Queue state regression recording',state:'submitted',visible:false,blockers:[]}],total:1,page_count:1};
 let response={status:200,body:data},release;
 let hold=true;
 const requests=[];
 const pending=[];
 const sensitive='PRIVATE_RESPONSE_SENTINEL';
 const consoleMessages=[];
 const onConsole=message=>consoleMessages.push(message.text());
 page.on('console',onConsole);
 const handler=async route=>{
  const body=route.request().postDataJSON();
  if(body.action!=='list')return route.fallback();
  requests.push(body);
  const selected=response;
  if(hold)await new Promise(resolve=>{release=resolve;pending.push(resolve);});
  const reply=selected.delayed?selected:response;
  await route.fulfill('raw' in reply?{status:reply.status,contentType:'text/plain',body:reply.raw}:{status:reply.status,json:reply.body});
 };
 // Establish that the actual SQL-backed request returns the fixture's submitted record.
 await page.goto(url);
 await expect(page.getByRole('link',{name:'Open review for live',exact:true})).toBeVisible();
 await page.route('**/api/catalog',handler);
 try {
  await page.reload();
  await expect(page.getByRole('status')).toHaveText('Loading catalog…');
  await expect(empty).toHaveCount(0);
  await expect(record).toHaveCount(0);
  await expect(page.getByLabel('Review status')).toHaveValue('submitted');
  await expect.poll(()=>typeof release).toBe('function');release();hold=false;
  await expect(record).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('1 catalog record loaded.');
  hold=true;release=undefined;
  await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();
  await expect(page.getByRole('status')).toHaveText('Refreshing catalog results…');
  await expect(record).toBeVisible();await expect(empty).toHaveCount(0);
  await expect.poll(()=>typeof release).toBe('function');
  response={status:503,body:{error:'CATALOG_UNAVAILABLE',private:'do not render diagnostics'}};release();hold=false;
  await expect(page.locator('p[role=alert]')).toContainText('Previously loaded results');
  await expect(record).toBeVisible();await expect(empty).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('do not render diagnostics');
  response={status:200,body:{items:[],total:0,page_count:0}};
  const retry=page.getByRole('button',{name:'Retry catalog request',exact:true});
  await retry.focus();await expect(retry).toBeFocused();await page.keyboard.press('Enter');
  await expect(empty).toBeVisible();await expect(record).toHaveCount(0);await expect(page.locator('p[role=alert]')).toHaveCount(0);
  await captureQueue(page,output,name,'after-empty');
  response={status:200,body:data};await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();await expect(record).toBeVisible();
  response={status:403,body:{error:'ACCESS_DENIED'}};await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();
  await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');await expect(record).toHaveCount(0);await expect(empty).toHaveCount(0);
  response={status:401,raw:'PRIVATE proxy diagnostic'};await page.getByRole('button',{name:'Check catalog access again',exact:true}).click();
  await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');await expect(record).toHaveCount(0);await expect(page.locator('body')).not.toContainText('PRIVATE proxy diagnostic');
  response={status:503,body:{error:'CATALOG_UNAVAILABLE'}};await page.getByRole('button',{name:'Check catalog access again',exact:true}).click();
  await expect(page.locator('p[role=alert]')).toContainText('could not be loaded');await expect(empty).toHaveCount(0);await expect(record).toHaveCount(0);
  response={status:200,body:data};await page.getByRole('button',{name:'Retry catalog request',exact:true}).click();await expect(record).toBeVisible();
  // Each null denial starts with populated records; a failed access check must never restore them.
  for(const status of [401,403]){
   response={status,body:null};await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();
   await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');await expect(record).toHaveCount(0);await expect(empty).toHaveCount(0);
   response={status:503,body:{error:sensitive}};await page.getByRole('button',{name:'Check catalog access again',exact:true}).click();
   await expect(page.locator('p[role=alert]')).toContainText('could not be loaded');await expect(record).toHaveCount(0);await expect(empty).toHaveCount(0);
   response={status:200,body:data};await page.getByRole('button',{name:'Retry catalog request',exact:true}).click();await expect(record).toBeVisible();
  }
  // Null, arrays, empty, malformed and non-JSON bodies cannot turn an HTTP denial into an error.
  for(const status of [401,403])for(const body of [{body:[]},{raw:''},{raw:'{'},{raw:sensitive}]){
   response={status,...body};await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();
   await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');await expect(record).toHaveCount(0);
   response={status:200,body:data};await page.getByRole('button',{name:'Check catalog access again',exact:true}).click();await expect(record).toBeVisible();
  }
  for(const body of [{body:null},{body:[]},{raw:''},{raw:'{'},{raw:sensitive}]){
   response={status:503,...body};await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();
   await expect(page.locator('p[role=alert]')).toContainText('could not be loaded');await expect(empty).toHaveCount(0);
   response={status:200,body:data};await page.getByRole('button',{name:'Retry catalog request',exact:true}).click();await expect(record).toBeVisible();
  }
  // Obsolete successful requests must not restore records after denial, even for the same filter.
  hold=true;release=undefined;response={status:200,body:data,delayed:true};
  await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();
  await expect.poll(()=>typeof release).toBe('function');const obsolete=release;hold=false;
  response={status:403,body:null};await page.getByLabel('Review status').selectOption('approved');
  await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');
  await page.getByLabel('Review status').selectOption('submitted');await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');
  const delayedResponse=page.waitForResponse(r=>r.url().endsWith('/api/catalog')&&r.status()===200);obsolete();const completed=await delayedResponse;await completed.finished();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');await expect(record).toHaveCount(0);
  // A completed retry gives React a further render after the obsolete response arrives.
  response={status:503,body:null};await page.getByRole('button',{name:'Check catalog access again',exact:true}).click();
  await expect(page.locator('p[role=alert]')).toContainText('could not be loaded');await expect(record).toHaveCount(0);await expect(empty).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(sensitive);assert.ok(consoleMessages.every(message=>!message.includes(sensitive)));
  response={status:200,body:data};await page.getByRole('button',{name:'Retry catalog request',exact:true}).click();await expect(record).toBeVisible();
  await captureQueue(page,output,name,'after-populated');
  assert.ok(requests.length>=8);
  assert.ok(requests.every(r=>r.admin===true&&['submitted','approved'].includes(r.state)&&r.page===1));
  await page.getByLabel('Review status').selectOption('');
  await expect(page).toHaveURL(/status=all/);
  await expect(record).toBeVisible();
  response={status:200,body:{...data,total:21,page_count:2}};
  await page.getByRole('button',{name:'Refresh catalog results'}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(record).toBeVisible();
  await record.click();
  await expect(page).toHaveURL(new RegExp('/admin/catalog\\?.*track='+track));
  const back=page.getByRole('link',{name:'Back to Catalog Reviews'});
  const returnPath=await back.getAttribute('href');
  assert.equal(new URL(returnPath,origin).searchParams.get('page'),'2');
  assert.equal(new URL(returnPath,origin).searchParams.get('status'),'all');
  await page.goBack();
  await expect(page.getByLabel('Review status')).toHaveValue('');
  await expect(page.getByText('Page 2 of 2 · 21 records')).toBeVisible();
  await record.click();
  await back.click();
  await expect(page.getByText('Page 2 of 2 · 21 records')).toBeVisible();
  const tracks=page.getByRole('link',{name:'Track Submissions',exact:true});
  await tracks.focus();
  await expect(tracks).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tracks).toHaveAttribute('aria-current','page');
  const trackTitle=page.getByRole('link',{name:'Synthetic pending track',exact:true});
  await expect(trackTitle).toBeVisible();
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reject',exact:true})).toBeVisible();
  await captureQueue(page,output,name,'after-tracks');
  await trackTitle.click();
  await expect(page.getByRole('link',{name:'Review master and publishing rights'})).toBeVisible();
  await page.getByRole('link',{name:'Back to Track Submissions'}).click();
  await expect(trackTitle).toBeVisible();
  // Switching views also retains the catalog URL when returning via the tabs.
  await page.getByRole('link',{name:'Catalog Reviews',exact:true}).click();
  await expect(page.getByText('Page 2 of 2 · 21 records')).toBeVisible();
  assert.ok(requests.some(r=>r.state===''&&r.page===2));
 } finally {for(const resolve of pending)resolve();page.off('console',onConsole);await page.unroute('**/api/catalog',handler);}
}


async function captureQueue(page,output,name,state) {
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:width===390?844:1000});
  const dimensions=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.equal(dimensions.width,width);
  assert.ok(dimensions.scroll<=width,`${state} overflows at ${width}px`);
  await page.screenshot({path:`${output}/${name}-${state}-${width}.png`,fullPage:width===390});
 }
 await page.setViewportSize({width:1440,height:1000});
}

export async function verifyDetailReload({page,adminUrl,fixture}) {
 await page.goto(adminUrl);
 const reload=page.getByRole('button',{name:'Reload saved metadata (discard unsaved edits)',exact:true});
 await expect(reload).toBeVisible();
 fixture.failNextRpc('catalog_read','before');
 await reload.click();
 await expect(page.getByRole('alert').filter({hasText:'Saved metadata could not be loaded'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Approve catalog metadata',exact:true})).toBeDisabled();
 const retry=page.getByRole('button',{name:'Retry loading metadata',exact:true});
 await retry.focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('status')).toContainText('Saved metadata reloaded.');
 await expect(page.getByRole('alert').filter({hasText:'Saved metadata could not be loaded'})).toHaveCount(0);
}
