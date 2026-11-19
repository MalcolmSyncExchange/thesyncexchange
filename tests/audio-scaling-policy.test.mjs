import test from 'node:test';import assert from 'node:assert/strict';
import {scalingDecision} from '../services/media-broker/scaling-policy.mjs';
const policy={authorizedWorkers:1,maxWorkers:1,reservationUsd:.1,safetyReserveUsd:.11};
const metrics={queueDepth:0,oldestSeconds:0,meanStageSeconds:25,utilization:0,headroomUsd:2.2,running:0,idleSeconds:0,sampleAgeSeconds:0};
for(const n of [1,10,50,100,1000])test(`${n} local concurrent metadata requests remain bounded to the one approved worker`,async()=>{
 const before=performance.now();const out=await Promise.all(Array.from({length:n},(_,i)=>Promise.resolve(scalingDecision({...metrics,queueDepth:i+1,oldestSeconds:i},policy))));
 assert.equal(out.length,n);for(const value of out){assert.equal(value.provision,false);assert.equal(value.targetWorkers,1);}console.log(JSON.stringify({simulation:'policy calculations only; no upload/network/decoder load',requests:n,elapsedMs:performance.now()-before}));
});
test('future verified worker capacity is configurable but never grants provisioning',()=>{
 assert.equal(scalingDecision({...metrics,queueDepth:100,oldestSeconds:120},{...policy,authorizedWorkers:4,maxWorkers:4}).targetWorkers,4);
 assert.equal(scalingDecision({...metrics,queueDepth:100,headroomUsd:.21},{...policy,authorizedWorkers:4,maxWorkers:4}).targetWorkers,1);
});
test('stale metrics, unknown evidence, budget exhaustion and idle scale-down fail safely',()=>{
 assert.equal(scalingDecision({...metrics,sampleAgeSeconds:91},policy).admit,false);
 assert.deepEqual(scalingDecision({...metrics,headroomUsd:.1,running:1},policy),{admit:false,targetWorkers:0,provision:false,reason:'budget_capacity',drain:true});
 assert.equal(scalingDecision({...metrics,idleSeconds:301},policy).targetWorkers,0);
 for(const patch of [{headroomUsd:NaN},{queueDepth:-1},{utilization:2},{sampleAgeSeconds:undefined}])assert.throws(()=>scalingDecision({...metrics,...patch},policy));
 assert.throws(()=>scalingDecision(metrics,{...policy,authorizedWorkers:1000}));
});
