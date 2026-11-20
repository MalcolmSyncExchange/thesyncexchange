import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { artistFinancialTotals, artistStatementCsv } from '../lib/finance/portal.mjs';
import { formatMinor } from '../lib/finance/accounting.mjs';
import { loadAuthModule } from './helpers/auth-system-harness.mjs';
const a={partyId:'master',legalName:'Artist',attributedToYou:true,owedMinor:'800',heldMinor:'200',pendingMinor:'800',refundAndLossMinor:'200',recoveryMinor:'0',paidMinor:'0',availableMinor:'0'};
const order=(overrides={})=>({orderId:'order1',createdAt:'2026-11-20',trackTitle:'Licensed recording',currency:'USD',paidEvidence:true,managedSale:true,platformFeeMinor:'200',allocations:[a],...overrides});
test('unposted pending or failed allocations never contribute earned revenue',()=>{
 const rows=artistFinancialTotals([order(),order({orderId:'pending',paidEvidence:false}),order({orderId:'failed',paidEvidence:false})]);
 assert.equal(rows[0].earnedMinor,'800'); assert.equal(rows[0].pendingMinor,'1600');assert.equal(rows[0].commissionMinor,'200');assert.equal(rows[0].availableMinor,'0');assert.equal(rows[0].paidMinor,'0');
});
test('partial/full refunds and disputes use recorded reversals, held balances and recovery',()=>{
 const partial=artistFinancialTotals([order({allocations:[{...a,owedMinor:'400',refundAndLossMinor:'600',heldMinor:'400'}]})])[0]; assert.equal(partial.earnedMinor,'400');assert.equal(partial.lossesMinor,'600');assert.equal(partial.heldMinor,'400');
 const full=artistFinancialTotals([order({platformFeeMinor:'0',allocations:[{...a,owedMinor:'0',refundAndLossMinor:'1000',heldMinor:'0',recoveryMinor:'100'}]})])[0]; assert.equal(full.earnedMinor,'0');assert.equal(full.recoveryMinor,'100');assert.equal(full.commissionMinor,'0');
});
test('currencies, exact large totals, ownership and missing values remain separate',()=>{
 const rows=artistFinancialTotals([order({allocations:[{...a,owedMinor:'9007199254740991'}, {...a,attributedToYou:false,owedMinor:'999999'}]}),order({orderId:'large',allocations:[{...a,owedMinor:'9007199254740991'}]}),order({orderId:'yen',currency:'JPY'})]);
 assert.equal(rows[0].earnedMinor,'18014398509481982');assert.equal(rows[1].earnedMinor,'800');assert.equal(formatMinor(rows[1].earnedMinor,'JPY'),'JPY 800');assert.equal(formatMinor('800','KWD'),'KWD 0.800');
 assert.throws(()=>artistFinancialTotals([order(),order()]));assert.throws(()=>artistFinancialTotals([order({allocations:[{...a,owedMinor:'NaN'}]})]));
});
test('statements exclude other contributors and neutralize spreadsheet formulas and canary links',()=>{
 const csv=artistStatementCsv([order({trackTitle:'=HYPERLINK("https://bad.invalid")',allocations:[a,{...a,attributedToYou:false,legalName:'PRIVATE_OTHER_BUYER'}]})]);
 assert.match(csv,/"'=HYPERLINK/);assert.doesNotMatch(csv,/PRIVATE_OTHER_BUYER/);assert.match(csv,/TEST accounting; not a bank statement/); assert.match(csv,/Net earned minor/);
});
test('actual overview uses one consistent snapshot and refuses truncated or duplicate records',async()=>{
 const run=report=>loadAuthModule('services/finance/artist-overview.ts',{'server-only':{},'@/lib/finance/portal.mjs':{artistFinancialTotals},'@/services/finance/reports':{getAccountingReport:async(role,page,size)=>{assert.equal(role,'artist');assert.equal(page,1);assert.equal(size,50);return report;}}}).getArtistFinancialOverview();
 assert.equal((await run({total:2,orders:[order(),order({orderId:'second'})]})).totals[0].earnedMinor,'1600');
 assert.equal((await run({total:51,orders:[]})).state,'limited');await assert.rejects(run({total:2,orders:[order()]}));await assert.rejects(run({total:2,orders:[order(),order()]}));
});
test('actual statement route requires authorized report, rejects arbitrary account input and redacts failures',async()=>{
 let calls=0;const modules={'@/services/finance/reports':{getAccountingReport:async(role,page)=>{calls++;assert.equal(role,'artist');assert.equal(page,2);return{orders:[order()]};}},'@/lib/finance/portal.mjs':{artistStatementCsv},'next/navigation':{unstable_rethrow:e=>{if(e.framework)throw e;}}};
 const get=loadAuthModule('app/api/artist/financial-statement/route.ts',modules).GET;
 const r=await get(new Request('https://app.invalid/api/artist/financial-statement?page=2'));assert.equal(r.status,200);assert.match(r.headers.get('Cache-Control'),/private, no-store/);assert.match(r.headers.get('Content-Disposition'),/page-2/);
 assert.equal((await get(new Request('https://app.invalid/api/artist/financial-statement?userId=other'))).status,400);assert.equal(calls,1);
 modules['@/services/finance/reports'].getAccountingReport=async()=>{throw Error('SECRET stack database signed-url email@canary.invalid');};
 const denied=await get(new Request('https://app.invalid/api/artist/financial-statement?page=2'));assert.equal(denied.status,503);assert.doesNotMatch(await denied.text(),/SECRET|signed-url|canary/);
});
test('actual report service checks role before RPC and never converts permission errors to empty reports',async()=>{
 const calls=[];const load=(deny=false)=>loadAuthModule('services/finance/reports.ts',{'server-only':{},'@/services/auth/session':{requireSession:async role=>{calls.push(role);if(deny)throw Error('denied');}},'@/services/supabase/server':{createServerSupabaseClient:async()=>({rpc:async()=>{calls.push('rpc');return{data:null,error:{code:'42501',message:'PRIVATE'}};}})}}).getAccountingReport;
 await assert.rejects(load(true)('artist'));assert.deepEqual(calls,['artist']);calls.length=0;await assert.rejects(load()('admin'),/Accounting evidence is unavailable/);assert.deepEqual(calls,['admin','rpc']);
});
test('subscription screen has no activation or misleading verified-subscription state',()=>{
 const source=readFileSync(new URL('../components/finance/subscription-status.tsx',import.meta.url),'utf8');assert.match(source,/USD 19.99/);assert.match(source,/USD 49.99/);assert.match(source,/Recurring billing is unavailable/);assert.doesNotMatch(source,/<form|<button|checkout\.sessions|subscriptions\.create/);
});
