import test from 'node:test';import assert from 'node:assert/strict';
import {launchReadiness} from '../services/media-broker/do-launch-readiness.mjs';
import {DODispatcher} from '../services/media-broker/do-dispatcher.mjs';
const denied=()=>Response.json({authorized:false},{status:403});
test('only exact credential-free denied application response establishes short readiness',async()=>{
 let calls=0,time=100;
 const ready=launchReadiness({now:()=>time,fetcher:async(url,options)=>{calls++;assert.equal(url,'https://thesyncexchange.com/api/media/worker-launch');assert.equal(options.method,'POST');assert.equal(options.body,'{}');assert.deepEqual(options.headers,{'content-type':'application/json'});assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.ok(options.signal);return denied();}});
 assert.equal(await ready(),true);time=30099;assert.equal(await ready(),true);assert.equal(calls,1);time=30100;assert.equal(await ready(),true);assert.equal(calls,2);time=99;assert.equal(await ready(),true);assert.equal(calls,3);
});
test('unexpected success, HTML denial, altered JSON and oversized evidence fail closed',async()=>{
 for(const response of [Response.json({authorized:true}),new Response('denied',{status:403}),Response.json({authorized:false,extra:true},{status:403}),Response.json({authorized:false,padding:'x'.repeat(300)},{status:403}),new Response('oops',{status:503}),new Response('bad json',{status:403,headers:{'content-type':'application/json'}})])assert.equal(await launchReadiness({fetcher:async()=>response})(),false);
 assert.throws(()=>launchReadiness({timeoutMs:10001}));
});
test('timeouts and cancellation close readiness without granting authority or caching failures',async()=>{
 let calls=0;
 const wait=async(_,o)=>{calls++;await new Promise((resolve,reject)=>{o.signal.addEventListener('abort',()=>reject(o.signal.reason),{once:true});setTimeout(resolve,50);});throw Error('not ready');};
 const ready=launchReadiness({fetcher:wait,timeoutMs:5});assert.equal(await ready(),false);assert.equal(await ready(),false);assert.equal(calls,2);
 const controller=new AbortController();controller.abort();assert.equal(await ready(controller.signal),false);assert.equal(calls,2);
 const running=new AbortController(),pending=launchReadiness({fetcher:wait})(running.signal);running.abort();assert.equal(await pending,false);
});
test('dispatcher does not reserve or launch until readiness; budget pause skips warmup',async()=>{
 const calls=[],db={rpc:async name=>{calls.push(name);if(name==='do_scope_status')return{state:'none'};if(name==='do_admit')return{state:'idle'};assert.fail(name);}};
 let enabled=true,available=false;
 const d=new DODispatcher({db,syncUsage:async()=>({enabled,paused:false}),ready:async()=>{calls.push('readiness');return available;}});
 assert.equal((await d.once()).state,'launch_endpoint_unavailable');assert.deepEqual(calls,['do_scope_status','readiness']);calls.length=0;enabled=false;assert.equal((await d.once()).state,'operator_disabled');assert.deepEqual(calls,['do_scope_status']);calls.length=0;enabled=true;available=true;assert.equal((await d.once()).state,'idle');assert.deepEqual(calls,['do_scope_status','readiness','do_admit']);
});
test('already issued work reconciles before any new readiness or admission',async()=>{
 let settled=false;
 const d=new DODispatcher({db:{rpc:async name=>name==='do_scope_status'?{state:'issued',run_id:'r'}:(assert.equal(name,'do_settle'),settled=true,{state:'failed'})},launcher:{status:async()=>({state:'EXITED'})},ready:async()=>assert.fail('must recover first'),syncUsage:async()=>assert.fail('must recover first')});
 assert.equal((await d.once()).state,'failed');assert.equal(settled,true);
});
test('an observed empty queue does not keep the application warm or reserve work',async()=>{
 const d=new DODispatcher({db:{rpc:async name=>{assert.equal(name,'do_scope_status');return{state:'none'};}},ready:async()=>assert.fail('no idle warmup'),syncUsage:async()=>({enabled:true,paused:false,queue:{queue_depth:0}})});
 assert.equal((await d.once()).state,'idle');
});
test('cancellation racing a successful readiness result cannot reserve a job',async()=>{
 const controller=new AbortController();
 const d=new DODispatcher({db:{rpc:async name=>{assert.equal(name,'do_scope_status');return{state:'none'};}},ready:async()=>{controller.abort();return true;},syncUsage:async()=>({enabled:true,paused:false})});
 assert.equal((await d.once(controller.signal)).state,'cancelled');
});
