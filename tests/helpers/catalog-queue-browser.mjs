import {expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';

// Intercept only list reads. Authentication, navigation and later workflows use the local fixture.
export async function verifyCatalogQueue({page,origin,track,output,name,fixture}) {
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
  await captureQueue(page,output,name,'catalog-empty');
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
  await captureQueue(page,output,name,'catalog-populated');
  response={status:200,body:{items:[...data.items,{
   ...data.items[0],id:'77777777-7777-4777-8777-000000000100',title:'Published with a rights blocker',state:'published',
   blockers:['current_verified_rights_required']
  }],total:2,page_count:1}};
  await page.getByRole('button',{name:'Refresh catalog results'}).click();
  await expect(page.getByText('Published · Unavailable to buyers',{exact:true})).toBeVisible();
  await expect(page.getByText('Unavailable to new buyers',{exact:true})).toHaveCount(0);
  const blockedRow=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:'Published with a rights blocker'})});
  const blockerToggle=blockedRow.getByRole('button',{name:'1 publication blocker',exact:true});
  const blockerPanel=blockedRow.locator('[id="'+await blockerToggle.getAttribute('aria-controls')+'"]');
  await expect(blockerPanel).toBeHidden();
  await blockerToggle.press('Space');
  await expect(blockerToggle).toHaveAttribute('aria-expanded','true');
  await expect(blockerPanel).toContainText('Current verified master and publishing authority is required.');
  assert.ok(await blockerPanel.evaluate(panel=>{
   const row=panel.closest('li');
   const header=row.firstElementChild.getBoundingClientRect();
   const bounds=panel.getBoundingClientRect();
   return bounds.top>=header.bottom&&Math.abs(header.width-bounds.width)<=1&&panel.scrollWidth<=panel.clientWidth+1;
  }));
  await blockerToggle.press('Tab');
  await expect(blockedRow.getByRole('link',{name:'Open record for Published with a rights blocker'})).toBeFocused();
  await blockerToggle.press('Enter');
  await expect(blockerPanel).toBeHidden();
  response={status:200,body:data};
  assert.ok(requests.length>=8);
  assert.ok(requests.every(r=>r.admin===true&&['submitted','approved'].includes(r.state)&&r.page===1));
  await page.getByLabel('Review status').selectOption('');
  await expect(page).toHaveURL(/status=all/);
  await expect(record).toBeVisible();
  const otherRows=Array.from({length:16},(_,index)=>({
   ...data.items[0],id:`77777777-7777-4777-8777-${String(index).padStart(12,'0')}`,
   title:'Synthetic catalog filler '+index
  }));
  response={status:200,body:{...data,items:[...otherRows,...data.items],total:37,page_count:2}};
  await page.getByRole('button',{name:'Refresh catalog results'}).click();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page).toHaveURL(/page=2/);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByText("Page 2 of 2 · 37 records")).toBeVisible();
  await expect(record).toBeVisible();
  await record.scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(()=>scrollY>300));
  await record.press('Enter');
  await expect(page).toHaveURL(new RegExp('/admin/catalog\\?.*track='+track));
  const back=page.getByRole('link',{name:'Back to Catalog Reviews'});
  const returnPath=new URL(await back.getAttribute('href'),origin);
  assert.equal(returnPath.searchParams.get('page'),'2');
  assert.equal(returnPath.searchParams.get('status'),'all');
  assert.equal(returnPath.searchParams.get('record'),track);
  await page.goBack();
  await expect(page.getByLabel('Review status')).toHaveValue('');
  await expectRestored(page,record);
  await page.goForward();
  await expect(back).toBeVisible();
  await back.click();
  await expectRestored(page,record);
  await page.reload();
  await expectRestored(page,record);
  await page.screenshot({path:`${output}/${name}-catalog-return-390.png`});
  response={status:200,body:{...data,items:otherRows,total:36,page_count:2}};
  await page.reload();
  await expect(page.getByRole('status').filter({hasText:'That record is no longer listed in this view.'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Review Queue',exact:true})).toBeFocused();
  response={status:200,body:{...data,items:[...otherRows,...data.items],total:37,page_count:2}};
  await page.setViewportSize({width:1440,height:1000});
  const tracks=page.getByRole('link',{name:'Track Submissions',exact:true});
  await tracks.focus();
  await expect(tracks).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(tracks).toHaveAttribute('aria-current','page');
  const trackTitle=page.getByRole('link',{name:'Open record for Synthetic pending track',exact:true});
  await expect(trackTitle).toBeVisible();
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Reject',exact:true})).toBeVisible();
  // Empty the disposable track queue through the loopback fixture, then restore it.
  await fixture.withDatabase(db=>db.query("update tracks set status='draft' where id=$1",[fixture.draftTrack]));
  try {
   await page.reload();
   await expect(page.getByText('The submission queue is clear.',{exact:true})).toBeVisible();
   await expect(page.getByRole('button',{name:'Approve',exact:true})).toHaveCount(0);
   await captureQueue(page,output,name,'tracks-empty');
  } finally {
   await fixture.withDatabase(db=>db.query("update tracks set status='pending_review' where id=$1",[fixture.draftTrack]));
  }
  await page.reload();
  await expect(trackTitle).toBeVisible();
  await tracks.focus();
  await expect(tracks).toBeFocused();
  assert.ok(await tracks.evaluate(link=>link.matches(':focus-visible')&&getComputedStyle(link).boxShadow!=='none'));
  await captureQueue(page,output,name,'tracks-populated');
  const evidence=page.getByRole('button',{name:'Review evidence',exact:true});
  await expect(evidence).toHaveAttribute('aria-expanded','false');
  const evidenceId=await evidence.getAttribute('aria-controls');
  const evidencePanel=page.locator('[id="'+evidenceId+'"]');
  await expect(evidencePanel).toBeHidden();
  await evidence.press('Enter');
  await expect(evidencePanel).toBeVisible();
  await expect(evidence).toBeFocused();
  assert.ok(await evidence.evaluate(button=>button.matches(':focus-visible')&&getComputedStyle(button).boxShadow!=='none'));
  const verification=evidencePanel.getByText('Verification',{exact:true});
  assert.ok(await verification.evaluate(label=>label.scrollWidth<=label.clientWidth+1&&
   label.getBoundingClientRect().right<=label.closest('.rounded-md').getBoundingClientRect().right));
  await evidence.press('Space');
  await expect(evidencePanel).toBeHidden();
  await trackTitle.click();
  await expect(page.getByRole('link',{name:'Rights evidence for master and publishing'})).toBeVisible();
  await page.goBack();
  await expectRestored(page,trackTitle);
  await page.reload();
  await expectRestored(page,trackTitle);
  await page.goForward();
  await page.getByRole('link',{name:'Back to Track Submissions'}).click();
  await expectRestored(page,trackTitle);
  await trackTitle.click();
  await page.getByRole('link',{name:'Catalog review and publication'}).click();
  await expect(page).toHaveURL(/status=all.*page=2.*from=track-queue/);
  await page.getByRole('link',{name:'Back to Track Submissions'}).click();
  await expectRestored(page,trackTitle);
  // Switching views also retains the catalog URL when returning via the tabs.
  await page.getByRole('link',{name:'Catalog Reviews',exact:true}).click();
  await expect(page.getByText('Page 2 of 2 · 37 records')).toBeVisible();
  assert.ok(requests.some(r=>r.state===''&&r.page===2));
 } finally {for(const resolve of pending)resolve();page.off('console',onConsole);await page.unroute('**/api/catalog',handler);}
}


async function captureQueue(page,output,name,state) {
 for(const [width,height] of [[1440,1000],[820,1024],[390,844]]){
  await page.setViewportSize({width,height});
  const dimensions=await page.evaluate(()=>{
   const main=document.querySelector('#admin-main');
   const queue=main.firstElementChild;
   const mainBox=main.getBoundingClientRect();
   const mainStyle=getComputedStyle(main);
   const left=mainBox.left+parseFloat(mainStyle.paddingLeft);
   const right=mainBox.right-parseFloat(mainStyle.paddingRight);
   const describe=element=>{
    const box=element.getBoundingClientRect();
    return {tag:element.tagName,label:element.textContent.trim().slice(0,72),
     left:box.left,right:box.right,width:box.width,clientWidth:element.clientWidth,scrollWidth:element.scrollWidth};
   };
   const children=[...queue.children].map(describe);
   const clipped=[...queue.querySelectorAll('*')].filter(element=>
    element instanceof HTMLElement && element.offsetWidth>1 && getComputedStyle(element).visibility==='visible'
   ).map(describe).filter(box=>box.left<left-1||box.right>right+1);
   const action=queue.querySelector('a[id^="review-queue-record-"]')?.getBoundingClientRect();
   return {viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,main:describe(main),
    firstAction:action&&{top:action.top+scrollY,height:action.height},
    availableWidth:right-left,gridColumns:getComputedStyle(queue).gridTemplateColumns,queue:describe(queue),children,clipped};
  });
  const basename=`${output}/${name}-${state}-${width}`;
  await writeFile(basename+'.json',JSON.stringify(dimensions,null,2)+'\n');
  // Capture only the viewport width so a PNG cannot hide an out-of-bounds child.
  await page.screenshot({path:basename+'.png',fullPage:true,clip:{x:0,y:0,width,height:await page.evaluate(()=>document.documentElement.scrollHeight)}});
  assert.equal(dimensions.viewport,width);
  assert.ok(dimensions.documentWidth<=width,`${state} document overflows at ${width}px`);
  assert.ok(dimensions.queue.scrollWidth<=dimensions.queue.clientWidth+1,
   `${state} inner queue is ${dimensions.queue.scrollWidth}px wide in a ${dimensions.availableWidth}px content area at ${width}px`);
  assert.deepEqual(dimensions.clipped,[],`${state} has clipped content at ${width}px`);
  if(width===390&&['tracks-populated','catalog-populated'].includes(state)){
   assert.ok(dimensions.firstAction.top+dimensions.firstAction.height<=height/2,`${state} hides its first action below the upper half at 390px`);
   assert.ok(dimensions.firstAction.height>=44,`${state} first action needs a 44px touch target`);
  }
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


export async function verifyTrackQueueOutage({page,origin,output,name,fixture}) {
 const queueUrl=origin+'/admin/review-queue';
 const unavailable=page.getByRole('heading',{name:'Track submissions unavailable',exact:true});
 const empty=page.getByText('The submission queue is clear.',{exact:true});
 const count=page.getByText(/^\d+ awaiting review$/);
 const pendingTrack=page.getByRole('link',{name:'Open record for Synthetic pending track',exact:true});
 const retry=page.getByRole('button',{name:'Try Again',exact:true});
 const retryStatus=page.getByRole('status').filter({hasText:'Trying again…'});

 async function expectUnavailable() {
  await expect(unavailable).toBeVisible({timeout:15000});
  await expect(empty).toHaveCount(0);
  await expect(count).toHaveCount(0);
  await expect(pendingTrack).toHaveCount(0);
  await expect(page.getByText('Rights holders',{exact:true})).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('PRIVATE_QUEUE_DIAGNOSTIC');
 }

 fixture.setTrackQueueFailure('tracks');
 try {
  await page.goto(queueUrl);
  // Capture the prior false empty state as well when running against the mobile-only baseline.
  await expect(unavailable.or(empty)).toBeVisible({timeout:15000});
  await captureQueue(page,output,name,'tracks-outage');
  await expectUnavailable();

  const failed=fixture.pauseNextTrackQueueRead();
  try {
   await retry.focus();
   await page.keyboard.press('Enter');
   await expect(retryStatus).toBeVisible();
   await expect(retry).toHaveAttribute('aria-disabled','true');
   await expect.poll(()=>failed.started).toBe(true);
   await expectUnavailable();
  } finally {
   failed.release();
  }
  await expect(retryStatus).toHaveCount(0,{timeout:15000});
  await expectUnavailable();

  await page.getByRole('link',{name:'Catalog Reviews',exact:true}).click();
  await expect(page.getByRole('link',{name:'Open review for live',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Track Submissions',exact:true}).click();
  await expectUnavailable();

  fixture.setTrackQueueFailure('rights_holders',403);
  const deniedRead=fixture.pauseNextTrackQueueRead();
  try {
   await retry.click();
   await expect(retryStatus).toBeVisible();
   await expect.poll(()=>deniedRead.started).toBe(true);
   await expectUnavailable();
  } finally {
   deniedRead.release();
  }
  await expect(retryStatus).toHaveCount(0,{timeout:15000});
  await expectUnavailable();

  fixture.setTrackQueueFailure();
  const recovery=fixture.pauseNextTrackQueueRead();
  try {
   await retry.click();
   await expect(retryStatus).toBeVisible();
   await expect.poll(()=>recovery.started).toBe(true);
   await expectUnavailable();
  } finally {
   recovery.release();
  }
  await expect(pendingTrack).toBeVisible({timeout:15000});
  await expect(page.getByText('1 awaiting review',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Review evidence',exact:true}).click();
  await expect(page.getByText('100% declared',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Approve',exact:true})).toBeVisible();
  await expect(unavailable).toHaveCount(0);
  await captureQueue(page,output,name,'tracks-recovered');
 } finally {
  fixture.setTrackQueueFailure();
 }
}


async function expectRestored(page, record) {
 await expect(record).toBeFocused();
 await expect(record).toBeInViewport({ratio:1});
}

export async function verifyTrackDecision({page,origin,output,name,fixture}) {
 const id=fixture.draftTrack;
 const approve=page.getByTestId(`approve-track-${id}`);
 const alert=page.getByRole('alert').filter({hasText:/ownership must equal|current rights review|could not be confirmed|request is invalid|was not updated/});
 const status=()=>fixture.query('select status from tracks where id=$1',[id]).then(result=>result.rows[0].status);
 const totals=async total=>fixture.withDatabase(async db=>{
  await db.query('delete from rights_holders where track_id=$1',[id]);
  const shares=total===100?[64.04,0.01,35.95]:total>100?[60,total-60]:total?[total]:[];
  for(const share of shares){
   await db.query("insert into rights_holders(track_id,name,role_type,ownership_percent,email) values($1,'Fixture rightsholder','owner',$2,$3)",[id,share,`fixture-${share}@fixture.invalid`]);
  }
 });
 try {
  for(const total of [0,60,110]){
   await totals(total);
   await page.goto(origin+'/admin/review-queue');
   await expect(page.getByText(`Approval blocked · ${total}% ownership declared`,{exact:true})).toBeVisible();
   await expect(page.getByText('Ready for review',{exact:true})).toHaveCount(0);
   await expect(approve).toBeDisabled();
   assert.equal(await approve.evaluate(button=>button.form),null);
   await expect(page.getByTestId(`reject-track-${id}`)).toBeEnabled();
   await expect(page.getByRole('button',{name:'Feature',exact:true})).toBeEnabled();
   await expect(page.getByRole('status').filter({hasText:'Track approved.'})).toHaveCount(0);
   assert.equal(await status(),'pending_review');
   if(total===0){
    await captureQueue(page,output,name,'approval-blocked');
    const rights=page.getByRole('link',{name:'Review rights',exact:true});
    await page.getByRole('link',{name:/Open record for/}).press('Tab');
    await expect(rights).toBeFocused();
    await rights.press('Tab');
    await expect(page.getByTestId(`reject-track-${id}`)).toBeFocused();
    await expect(rights).toHaveAttribute('href','/admin/rights?track='+id);
    await rights.press('Enter');
    await expect(page).toHaveURL(origin+'/admin/rights?track='+id);
    await page.goBack();
    const featured=()=>fixture.query('select featured from tracks where id=$1',[id]).then(result=>result.rows[0].featured);
    await page.getByRole('button',{name:'Feature',exact:true}).press('Space');
    await expect.poll(featured).toBe(true);
    await page.reload();
    await page.getByRole('button',{name:'Unfeature',exact:true}).press('Enter');
    await expect.poll(featured).toBe(false);
    assert.equal(await status(),'pending_review');
   }
   if(total===60){
    await page.goto(origin+'/admin/tracks');
    await expect(approve).toBeDisabled();
    await expect(page.getByText('Approval blocked · 60% ownership declared',{exact:true})).toBeVisible();
    assert.equal(await status(),'pending_review');
   }
  }
  for(const total of [99.99,100.01]){
   await totals(total);
   await page.goto(origin+'/admin/review-queue');
   await expect(approve).toBeEnabled();
  }
  await totals(100);
  await fixture.query("insert into rights_private.cases(track_id,owner_id,state) select id,artist_user_id,'draft' from tracks where id=$1",[id]);
  try {
   await page.goto(origin+'/admin/review-queue');
   await expect(page.getByText('Approval blocked · Current rights review required',{exact:true})).toBeVisible();
   await expect(approve).toBeDisabled();
  } finally {
   await fixture.query('delete from rights_private.cases where track_id=$1',[id]);
  }
  await page.setViewportSize({width:390,height:844});
  fixture.failNextRpc('rights_read','before');
  await page.goto(origin+'/admin/tracks/'+id+'?from=review-queue');
  await expect(page.getByText('Approval readiness unavailable',{exact:true})).toBeVisible();
  await expect(approve).toBeDisabled();
  await page.getByRole('button',{name:'Recheck approval'}).click();
  await expect(approve).toBeEnabled();
  await expect(page.getByText(/Approval blocked/)).toHaveCount(0);
  await expect(page.getByText('Buyer checkout and catalog publication require an eligible license option.',{exact:false})).toBeVisible();
  fixture.failNextTrackDecision('rights');
  await approve.click();
  await expect(alert).toContainText('A current rights review is required');
  await expect(alert.getByRole('link',{name:'Review rights'})).toHaveAttribute('href','/admin/rights?track='+id);
  await expect(approve).toBeDisabled();
  assert.ok(await alert.evaluate(message=>{
   const bounds=message.getBoundingClientRect();
   return bounds.left>=0&&bounds.right<=window.innerWidth&&message.scrollWidth<=message.clientWidth+1;
  }));
  await page.screenshot({path:`${output}/${name}-approval-rights-390.png`});
  await page.setViewportSize({width:1440,height:1000});
  await alert.getByRole('button',{name:'Recheck approval'}).click();
  await expect(approve).toBeEnabled();

  fixture.failNextTrackDecision('no-row');
  await approve.click();await expect(alert).toContainText('The track was not updated');
  await approve.locator('..').locator('input[name=trackId]').evaluate(input=>input.value='');
  await approve.click();await expect(alert).toContainText('This decision request is invalid');
  await page.reload();
  fixture.failNextTrackDecision('unavailable');
  await approve.click();await expect(alert).toContainText('The decision could not be confirmed');
  await expect(page.locator('body')).not.toContainText('PRIVATE_DECISION_DIAGNOSTIC');
  assert.equal(await status(),'pending_review');
  await approve.click();
  await expect(page.getByRole('status').filter({hasText:'Track approved.'})).toBeVisible();
  assert.equal(await status(),'approved');
  await page.screenshot({path:`${output}/${name}-approval-success-1440.png`});

  await fixture.query("update tracks set status='pending_review' where id=$1",[id]);
  await page.goto(origin+'/admin/review-queue');
  await approve.click();
  await expect(approve).toHaveCount(0);
  await expect(page.getByRole('status').filter({hasText:'Track approved.'})).toBeVisible();
  assert.equal(await status(),'approved');
  await page.screenshot({path:`${output}/${name}-queue-approval-success-1440.png`});

  await fixture.query("update tracks set status='pending_review' where id=$1",[id]);
  await page.goto(origin+'/admin/review-queue');
  fixture.failNextTrackDecision('rights');
  await approve.click();
  await expect(alert).toContainText('A current rights review is required');
  const recheck=alert.getByRole('button',{name:'Recheck approval'});
  const evidence=page.getByRole('button',{name:'Review evidence',exact:true});
  await recheck.press('Tab');
  await expect(evidence).toBeFocused();
  assert.ok((await evidence.boundingBox()).y>=(await recheck.boundingBox()).y);
  await recheck.click();
  await expect(approve).toBeEnabled();
  await page.getByTestId(`reject-track-${id}`).press('Enter');
  await expect(page.getByRole('status').filter({hasText:'Track rejected.'})).toBeVisible();
  assert.equal(await status(),'rejected');
  await fixture.query("update tracks set status='pending_review' where id=$1",[id]);
  await page.reload();
  await expect(approve).toBeEnabled();
  fixture.invalidate(fixture.admin.id);
  await approve.click();
  await expect(alert).toContainText('Check your Admin session and account security');
  assert.equal(await status(),'pending_review');
 } finally {
  await totals(100);
  await fixture.query("update tracks set status='pending_review',featured=false where id=$1",[id]);
 }
}
