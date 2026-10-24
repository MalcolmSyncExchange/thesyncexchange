import test from 'node:test';import assert from 'node:assert/strict';import {createHmac,randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';
import {notices,notificationSeverity} from '../lib/notifications/catalog.ts';import {renderNotice,emailOrigin,escapeHtml} from '../lib/notifications/templates.ts';import {sendNotice,verifyDeliveryEvent,boundedText} from '../lib/notifications/provider.ts';
const cfg={key:'re_SYNTHETIC',from:'sender@fixture.invalid',replyTo:'support@fixture.invalid',origin:'https://fixture.invalid'};
for(const kind of Object.keys(notices))test('accessible, private branded HTML/plain text template: '+kind,()=>{
 const x=renderNotice(kind,'buyer',cfg.origin);assert.ok(x.subject.length<100);assert.match(x.html,/<html lang="en" dir="ltr">/);assert.match(x.html,/<title>/);assert.equal((x.html.match(/<h1 /g)||[]).length,1);assert.match(x.html,/alt="The Sync Exchange"/);assert.match(x.html,/Primary_Logo_Light_Mode.png/);assert.match(x.text,/https:\/\/fixture.invalid\/buyer\/orders|account\/security|account\/support/);assert.equal(x.html.includes('<script'),false);assert.equal(x.html.includes('storage.supabase'),false);
});
test('template rendering rejects unsupported/injected events, unknown versions and unsafe URL origins',()=>{
 assert.throws(()=>renderNotice('<img src=x onerror=alert(1)>','buyer',cfg.origin));assert.throws(()=>renderNotice('purchase_confirmed','artist',cfg.origin,'obsolete'));
 for(const value of ['javascript:alert(1)','https://attacker.invalid/path','https://user:pass@fixture.invalid','https://fixture.invalid?redirect=evil','http://fixture.invalid'])assert.throws(()=>emailOrigin(value));
 assert.equal(escapeHtml('<script>"&\''),'&lt;script&gt;&quot;&amp;&#39;');assert.equal(emailOrigin('http://127.0.0.1:3230'),'http://127.0.0.1:3230');
});
test('provider send has fixed API origin, stable key, bounded responses and no blind redirect',async()=>{
 const id=randomUUID(),seen=[];const mock=async(url,init)=>{seen.push({url,init});return Response.json({id:'provider_stable'});};
 for(let n=0;n<2;n++)assert.equal((await sendNotice(cfg,id,'buyer@fixture.invalid',renderNotice('purchase_confirmed','buyer',cfg.origin),mock)).outcome,'accepted');
 assert.equal(seen[0].url,'https://api.resend.com/emails');assert.equal(seen[0].init.redirect,'error');assert.equal(seen[0].init.headers['Idempotency-Key'],seen[1].init.headers['Idempotency-Key']);assert.ok(JSON.parse(seen[0].init.body).text);
});
for(const [status,outcome] of [[429,'transient'],[500,'transient'],[503,'transient'],[401,'configuration'],[403,'configuration'],[422,'permanent'],[409,'permanent']])test('safe provider failure classification '+status,async()=>assert.equal((await sendNotice(cfg,randomUUID(),'buyer@fixture.invalid',renderNotice('refund','buyer',cfg.origin),async()=>new Response('',{status}))).outcome,outcome));
test('timeouts, malformed 2xx and oversized provider response remain uncertain/retryable',async()=>{
 for(const fetcher of [async()=>{throw Error('secret-containing provider error');},async()=>Response.json({}),async()=>new Response('x'.repeat(5000))])assert.equal((await sendNotice(cfg,randomUUID(),'buyer@fixture.invalid',renderNotice('refund','buyer',cfg.origin),fetcher)).outcome,'transient');
 await assert.rejects(boundedText(new Response('x'.repeat(100)),10),/oversized/);
});
test('recipient header injection and missing credentials are rejected before network access',async()=>{
 let n=0;for(const to of ['bad\r\nBcc: private@fixture.invalid','x@fixture.invalid,y@fixture.invalid','<x@fixture.invalid>'])assert.equal((await sendNotice(cfg,randomUUID(),to,renderNotice('refund','buyer',cfg.origin),async()=>{n++;})).outcome,'configuration');assert.equal(n,0);
});
const key=Buffer.alloc(32,7),secret='whsec_'+key.toString('base64');
function signed(raw,{id='msg_fixture',timestamp=Math.floor(Date.now()/1000)}={}){const h=new Headers({'svix-id':id,'svix-timestamp':String(timestamp)});h.set('svix-signature','v1,'+createHmac('sha256',key).update(`${id}.${timestamp}.${raw}`).digest('base64'));return h;}
const raw=()=>JSON.stringify({type:'email.delivered',created_at:new Date().toISOString(),data:{email_id:'provider_fixture',to:['PRIVATE@fixture.invalid']}});
test('signed delivery event validates original raw bytes and stores only minimal evidence',()=>{const x=raw(),r=verifyDeliveryEvent(x,signed(x),secret);assert.equal(r.kind,'email.delivered');assert.equal(Object.keys(r).length,5);assert.equal(JSON.stringify(r).includes('@'),false);assert.equal(r.hash.length,64);});
test('forgery, modified body, expired/future signature, unsupported events and malformed IDs fail closed',()=>{
 const x=raw();for(const h of [new Headers(),signed(x,{timestamp:1}),signed(x,{timestamp:Math.floor(Date.now()/1000)+600})])assert.throws(()=>verifyDeliveryEvent(x,h,secret));assert.throws(()=>verifyDeliveryEvent(x+' ',signed(x),secret));assert.throws(()=>verifyDeliveryEvent(x,signed(x),'whsec_short'));
 const unsupported=JSON.stringify({type:'email.opened',created_at:new Date().toISOString(),data:{email_id:'provider_fixture'}});assert.throws(()=>verifyDeliveryEvent(unsupported,signed(unsupported),secret));
});
test('provider/worker surfaces have no automatic scheduler, payment-path dependency or credential logging',()=>{
 const s=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');assert.match(s('services/notifications/worker.ts'),/TSE_EMAIL_DELIVERY_ENABLED!=="true"/);assert.equal(s('app/api/webhooks/stripe/route.ts').includes('runNotificationBatch'),false);assert.equal(s('app/api/checkout/route.ts').includes('sendNotice'),false);assert.match(s('app/api/webhooks/resend/route.ts'),/verifyDeliveryEvent/);assert.equal(s('lib/notifications/provider.ts').includes('console.'),false);
});

test('all provider-owned Auth templates preserve scanner-safe token contracts and have plain alternatives',()=>{
 const dir=new URL('../supabase/templates/system13/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',dir),'utf8'));assert.equal(manifest.templates.length,11);
 for(const t of manifest.templates){const h=readFileSync(new URL(t.html,dir),'utf8'),text=readFileSync(new URL(t.text,dir),'utf8');assert.equal(t.activated,false);assert.match(h,/<html lang="en" dir="ltr">/);assert.match(h,/alt="The Sync Exchange"/);assert.ok(text.length>100);assert.equal(h.includes('.Data'),false);if(t.flow){assert.match(h,/\/auth\/email-action\?flow=/);assert.match(h,/\.TokenHash/);assert.equal(h.includes('/auth/v1/verify'),false);}else{assert.match(h,/\/account\/security/);assert.equal(h.includes('.TokenHash'),false);}}
});

test('administrative severity and authenticated escalation stay explicit and contain no private subject details',()=>{
 assert.equal(notificationSeverity('financial_exception'),'high');assert.equal(notificationSeverity('worker_failure'),'warning');assert.equal(notificationSeverity('catalog_queue'),'info');const x=renderNotice('financial_exception','admin',cfg.origin);assert.match(x.text,/Priority: high/);assert.match(x.html,/does not authorize automatic/);
});

test('approved email logo exists as an unmodified deliverable',()=>{const b=readFileSync(new URL('../public/brand/the-sync-exchange/logos/Primary_Logo_Light_Mode.png',import.meta.url));assert.equal(b.subarray(1,4).toString(),'PNG');assert.equal(b.length,121897);});
