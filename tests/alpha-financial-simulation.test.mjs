import test from 'node:test';
import assert from 'node:assert/strict';
import {allocateMinor,financialSimulation} from '../lib/commerce/alpha-financial-simulation.mjs';
const policy={orderId:'synthetic-order',amountMinor:10001,currency:'USD',commissionBps:1500,policyVersion:'EXPLICIT-SYNTHETIC-POLICY-NOT-A-BUSINESS-DEFAULT',contributors:[{id:'master-controller',bps:6000},{id:'composition-controller',bps:4000}]};
const event=(id,type,rest={})=>({id,type,orderId:policy.orderId,currency:'USD',amountMinor:10001,verified:true,...rest});
function balanced(s){for(const j of s.journal)assert.equal(j.lines.reduce((n,l)=>n+l.debit-l.credit,0),0);assert.equal(Object.values(s.balances).reduce((a,b)=>a+b,0),0);assert.equal(s.commercialRightsGranted,false);}
test('paid simulation conserves every cent, records commission/liabilities and creates only synthetic entitlement',()=>{
 const sim=financialSimulation(policy),s=sim.apply(event('e1','paid'));balanced(s);assert.equal(s.balances.cash,10001);assert.equal(s.balances.commission,-1500);assert.equal(s.entitlement,'synthetic_only');assert.equal(sim.reconcile({currency:'USD',netMinor:10001}).matched,true);
});
test('failed/unverified/wrong-accounting-input purchases have no liability or entitlement',()=>{
 const sim=financialSimulation(policy);assert.throws(()=>sim.apply(event('bad','paid',{verified:false})),/Invalid/);const s=sim.apply(event('failed','failed'));balanced(s);assert.equal(s.entitlement,'none');assert.equal(s.journal.length,0);
 assert.throws(()=>sim.apply(event('currency','paid',{currency:'EUR'})),/Invalid/);
});
test('event replay and different paid event IDs cannot double-post or duplicate entitlement',()=>{
 const sim=financialSimulation(policy);sim.apply(event('e1','paid'));sim.apply(event('e1','paid'));const s=sim.apply(event('e2','paid'));balanced(s);assert.equal(s.journal.length,1);assert.equal(s.events,2);assert.throws(()=>sim.apply(event('e1','refund',{refundedMinor:500})),/Conflicting/);
});
test('cumulative partial and full refunds reverse commission and contributor balances without over-refund',()=>{
 const sim=financialSimulation(policy);sim.apply(event('paid','paid'));let s=sim.apply(event('r1','refund',{refundedMinor:3333}));balanced(s);assert.equal(s.balances.cash,6668);assert.equal(s.entitlement,'suspended');
 s=sim.apply(event('stale','refund',{refundedMinor:1000}));assert.equal(s.balances.cash,6668);s=sim.apply(event('r2','refund',{refundedMinor:10001}));balanced(s);assert.equal(s.entitlement,'revoked');assert.ok(Object.values(s.balances).every(n=>n===0));assert.throws(()=>sim.apply(event('over','refund',{refundedMinor:10002})),/Over-refund/);
});
test('refund-before-paid, failed-before-paid and disputes retain adverse entitlement state after late payment',()=>{
 for(const first of [event('r','refund',{refundedMinor:10001}),event('f','failed'),event('d','dispute')]){
  const sim=financialSimulation(policy);sim.apply(first);const s=sim.apply(event('p','paid'));balanced(s);assert.notEqual(s.entitlement,'synthetic_only');assert.equal(s.paid,true);
 }
});
test('rounding is deterministic under reordered contributors and many refund boundaries',()=>{
 for(let amount=0;amount<2000;amount++){
  const a=allocateMinor(amount,policy.contributors),b=allocateMinor(amount,[...policy.contributors].reverse());assert.deepEqual(a,b);assert.equal(a.reduce((n,s)=>n+s.minor,0),amount);
 }
 const sim=financialSimulation(policy);sim.apply(event('paid','paid'));for(let refund=1;refund<=10001;refund+=137)balanced(sim.apply(event('refund'+refund,'refund',{refundedMinor:refund})));
});
test('reconciliation discrepancies are explicit; snapshots and policy cannot be mutated',()=>{
 const sim=financialSimulation(policy);const s=sim.apply(event('p','paid'));assert.throws(()=>s.journal.push({}));assert.throws(()=>s.policy.commissionBps=1);assert.deepEqual(sim.reconcile({currency:'USD',netMinor:10000}),{matched:false,differenceMinor:-1});assert.equal(sim.reconcile({currency:'EUR',netMinor:10001}).matched,false);
 assert.throws(()=>financialSimulation({...policy,commissionBps:10001}));assert.throws(()=>allocateMinor(10,[{id:'a',bps:5000}]));
});
