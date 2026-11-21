import {expect} from '@playwright/test';
import assert from 'node:assert/strict';

// Intercept only list reads. Authentication, navigation and later workflows use the local fixture.
export async function verifyCatalogQueue({page,origin,track,output,name}) {
 const url=origin+'/admin/review-queue?view=catalog';
 const empty=page.getByText('No catalog records match this status.',{exact:true});
 const record=page.getByRole('link',{name:'Queue state regression recording',exact:true});
 const data={items:[{id:track,title:'Queue state regression recording',state:'submitted',visible:false,blockers:[]}],total:1,page_count:1};
 let response={status:200,body:data},release;
 let hold=true;
 const requests=[];
 const handler=async route=>{
  const body=route.request().postDataJSON();
  if(body.action!=='list')return route.fallback();
  requests.push(body);
  if(hold)await new Promise(resolve=>{release=resolve;});
  await route.fulfill(response.raw?{status:response.status,contentType:'text/plain',body:response.raw}:{status:response.status,json:response.body});
 };
 await page.route('**/api/catalog',handler);
 try {
  await page.goto(url);
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
  response={status:200,body:data};await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();await expect(record).toBeVisible();
  response={status:403,body:{error:'ACCESS_DENIED'}};await page.getByRole('button',{name:'Refresh catalog results',exact:true}).click();
  await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');await expect(record).toHaveCount(0);await expect(empty).toHaveCount(0);
  response={status:401,raw:'PRIVATE proxy diagnostic'};await page.getByRole('button',{name:'Check catalog access again',exact:true}).click();
  await expect(page.locator('p[role=alert]')).toContainText('Catalog access denied');await expect(record).toHaveCount(0);await expect(page.locator('body')).not.toContainText('PRIVATE proxy diagnostic');
  response={status:503,body:{error:'CATALOG_UNAVAILABLE'}};await page.getByRole('button',{name:'Check catalog access again',exact:true}).click();
  await expect(page.locator('p[role=alert]')).toContainText('could not be loaded');await expect(empty).toHaveCount(0);await expect(record).toHaveCount(0);
  response={status:200,body:data};await page.getByRole('button',{name:'Retry catalog request',exact:true}).click();await expect(record).toBeVisible();
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:output+'/'+name+'-queue-mobile.png',fullPage:true});
  await record.click();await expect(page).toHaveURL(origin+'/admin/catalog?track='+track);
  await page.goBack();await expect(page.getByLabel('Review status')).toHaveValue('submitted');await expect(record).toBeVisible();
  await page.getByRole('link',{name:'Legacy submission queue',exact:true}).click();await expect(page).toHaveURL(origin+'/admin/review-queue');
  assert.ok(requests.length>=8);assert.ok(requests.every(r=>r.admin===true&&r.state==='submitted'&&r.page===1));
  await page.setViewportSize({width:1440,height:1000});
 } finally {release?.();await page.unroute('**/api/catalog',handler);}
}
