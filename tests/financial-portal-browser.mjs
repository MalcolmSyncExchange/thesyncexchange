// Render the actual server pages with synthetic readers, then check real browser layout.
// No provider, hosted database, authentication credential or transaction is used.
import { chromium } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadAuthModule } from './helpers/auth-system-harness.mjs';
import * as accounting from '../lib/finance/accounting.mjs';
import {formatStripeInvoiceMinor} from '../lib/finance/stripe-money.ts';
import { artistFinancialTotals } from '../lib/finance/portal.mjs';
const output='/private/tmp/tse-financial-browser';mkdirSync(output,{recursive:true});
const Link=({children,...props})=>createElement('a',props,children);
const base={'react/jsx-runtime':runtime,'next/link':{default:Link},'@/lib/finance/accounting.mjs':accounting,'@/lib/finance/stripe-money':{formatStripeInvoiceMinor}};
const allocation={partyId:'master',legalName:'Synthetic Artist',allocationBps:10000,allocatedMinor:'800',attributedToYou:true,bindingId:null,artistId:null,pendingMinor:'0',owedMinor:'800',heldMinor:'200',eligibleSimulationMinor:'0',reservedMinor:'0',refundAndLossMinor:'200',recoveryMinor:'0',simulatedCompletedMinor:'0',paidMinor:'0',availableMinor:'0',hold:'payment_hold'};
const order={orderId:'11111111-1111-4111-8111-111111111111',currency:'USD',createdAt:'2026-11-20T00:00:00Z',trackTitle:'Synthetic licensing sale',managedSale:true,grossMinor:'1250',platformFeeMinor:'250',netProceedsMinor:'800',policyVersion:'SYNTHETIC',policy:{},processorFeeMinor:'0',paidEvidence:true,allocations:[allocation],payouts:[],accounting:null};
const report={orders:[order],total:1,page:1,size:20};
const {EarningsReport}=loadAuthModule('components/finance/earnings-report.tsx',base);
const {SubscriptionStatus}=loadAuthModule('components/finance/subscription-status.tsx',base);
const artist=loadAuthModule('app/(app)/artist/earnings/page.tsx',{...base,'@/components/finance/earnings-report':{EarningsReport},'@/components/finance/subscription-status':{SubscriptionStatus},'@/services/finance/reports':{getAccountingReport:async()=>report},'@/services/finance/artist-overview':{getArtistFinancialOverview:async()=>({state:'available',totals:artistFinancialTotals(report.orders)})}}).default;
const buyer=history=>loadAuthModule('app/(app)/buyer/billing/page.tsx',{...base,'@/services/auth/session':{requireSession:async role=>assert.equal(role,'buyer')},'@/services/buyer/invoices':{loadBuyerInvoices:async()=>history}}).default;
const css=readdirSync('.next/static/chunks').filter(p=>p.endsWith('.css')).map(p=>readFileSync('.next/static/chunks/'+p,'utf8')).join('\n');
let browser;try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 for(const [name,element] of [['artist',await artist({searchParams:Promise.resolve({})})],['buyer-outage',await buyer({status:'unavailable',invoices:[]})()],['buyer-empty',await buyer({status:'available',invoices:[]})()],['buyer-yen',await buyer({status:'available',invoices:[{id:'in_fixture',date:'2026-11-20T00:00:00Z',amountCents:1200,currency:'JPY',status:'paid',url:null}]})()]]){
  await page.setContent('<html class="dark"><head><style>'+css+'</style></head><body style="background:#101418;color:#eef2f5;padding:24px"><main style="max-width:1200px;margin:auto">'+renderToStaticMarkup(element)+'</main></body></html>');
  const body=await page.locator('body').innerText();
  if(name==='artist'){assert.match(body,/USD 8.00/);assert.match(body,/Payouts and withdrawals are unavailable/);assert.match(body,/Recurring billing is unavailable/);assert.equal(await page.locator('a[href="/api/artist/financial-statement?page=1"]').count(),1);}
  if(name==='buyer-outage'){assert.match(body,/temporarily unavailable/);assert.doesNotMatch(body,/No invoices yet/);assert.equal(await page.locator('a[href="/buyer/settings#account-billing"]').count(),1);}
  if(name==='buyer-empty')assert.match(body,/No invoices yet/);
  if(name==='buyer-yen')assert.match(body,/JPY 1,200/);
  for(const width of [390,1280]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' at '+width);await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});}
 }
 console.log('PASS: actual Artist and Buyer page rendering, outage/empty distinction, currency exponents, gated subscriptions/payouts, statement link, 390/1280px layouts');
}finally{await browser?.close();}
