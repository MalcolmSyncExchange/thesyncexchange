// Render the actual server pages with synthetic readers, then check real browser layout.
// No provider, hosted database, authentication credential or transaction is used.
import { chromium } from '@playwright/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import * as icons from 'lucide-react';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadAuthModule } from './helpers/auth-system-harness.mjs';
import * as accounting from '../lib/finance/accounting.mjs';
import {formatStripeInvoiceMinor} from '../lib/finance/stripe-money.ts';
import { artistFinancialTotals } from '../lib/finance/portal.mjs';
const output='/private/tmp/tse-financial-browser';mkdirSync(output,{recursive:true});
const Link=({children,...props})=>createElement('a',props,children);
// The VM compiles TSX directly, so map CSS module selectors to their source names.
const financeStyles={default:new Proxy({}, {get:(_, name)=>name})};
const base={
 'react/jsx-runtime':runtime,
 'next/link':{default:Link},
 'lucide-react':icons,
 './artist-finances.module.css':financeStyles,
 '@/components/finance/artist-finances.module.css':financeStyles,
 '@/lib/finance/accounting.mjs':accounting,
 '@/lib/finance/portal.mjs':{artistFinancialTotals},
 '@/lib/finance/stripe-money':{formatStripeInvoiceMinor},
};
const allocation={partyId:'master',legalName:'Synthetic Artist',allocationBps:10000,allocatedMinor:'800',attributedToYou:true,bindingId:null,artistId:null,pendingMinor:'0',owedMinor:'800',heldMinor:'200',eligibleSimulationMinor:'0',reservedMinor:'0',refundAndLossMinor:'200',recoveryMinor:'0',simulatedCompletedMinor:'0',paidMinor:'0',availableMinor:'0',hold:'payment_hold'};
const order={orderId:'11111111-1111-4111-8111-111111111111',currency:'USD',createdAt:'2026-11-20T00:00:00Z',trackTitle:'Synthetic licensing sale',managedSale:true,grossMinor:'1250',platformFeeMinor:'250',netProceedsMinor:'800',policyVersion:'SYNTHETIC',policy:{},processorFeeMinor:'0',paidEvidence:true,allocations:[allocation],payouts:[],accounting:null};
const report={orders:[order],total:1,page:1,size:20};
const {EarningsReport}=loadAuthModule('components/finance/earnings-report.tsx',base);
const {SubscriptionStatus}=loadAuthModule('components/finance/subscription-status.tsx',base);
const artist=(accountingReport, overview)=>loadAuthModule('app/(app)/artist/earnings/page.tsx',{
 ...base,
 '@/components/finance/earnings-report':{EarningsReport},
 '@/components/finance/subscription-status':{SubscriptionStatus},
 '@/services/finance/reports':{getAccountingReport:async()=>accountingReport},
 '@/services/finance/artist-overview':{getArtistFinancialOverview:async()=>overview},
}).default;
const artistPage = async (accountingReport=report, state='available') =>
  artist(accountingReport, {state, totals:state==='available'?artistFinancialTotals(accountingReport.orders):[]})({
    searchParams:Promise.resolve({page:String(accountingReport.page)}),
  });
const buyer=history=>loadAuthModule('app/(app)/buyer/billing/page.tsx',{...base,'@/services/auth/session':{requireSession:async role=>assert.equal(role,'buyer')},'@/services/buyer/invoices':{loadBuyerInvoices:async()=>history}}).default;
const css=readdirSync('.next/static/chunks').filter(p=>p.endsWith('.css')).map(p=>readFileSync('.next/static/chunks/'+p,'utf8')).join('\n');
const financeCss=readFileSync('components/finance/artist-finances.module.css','utf8');
let browser;try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage();
 for(const [name,element] of [['artist',await artistPage()],['artist-empty',await artistPage({...report,orders:[],total:0})],['artist-limited',await artistPage({...report,total:51},'limited')],['buyer-outage',await buyer({status:'unavailable',invoices:[]})()],['buyer-empty',await buyer({status:'available',invoices:[]})()],['buyer-yen',await buyer({status:'available',invoices:[{id:'in_fixture',date:'2026-11-20T00:00:00Z',amountCents:1200,currency:'JPY',status:'paid',url:null}]})()]]){
  await page.setContent('<html class="dark"><head><style>'+css+'\n'+financeCss+'</style></head><body style="background:#101418;color:#eef2f5;padding:24px"><main style="max-width:1200px;margin:auto">'+renderToStaticMarkup(element)+'</main></body></html>');
  const body=await page.locator('body').innerText();
  if(name==='artist'){
   assert.match(body,/USD 8.00/);
   assert.match(body,/Payment posted/);
   assert.match(body,/Payouts and withdrawals are unavailable/);
   assert.match(body,/Recurring billing is unavailable/);
   assert.equal(await page.locator('a[href="/api/artist/financial-statement?page=1"]').count(),1);
   const transaction=page.locator('summary').filter({hasText:'Synthetic licensing sale'});
   await transaction.focus();
   await page.keyboard.press('Enter');
   assert.equal(await page.getByText('Original paid licensing amount',{exact:true}).isVisible(),true);
   assert.equal(await page.getByText('Your allocation',{exact:true}).isVisible(),true);
   await page.keyboard.press('Enter');
   assert.equal(await page.getByText('Original paid licensing amount',{exact:true}).isVisible(),false);
  }
  if(name==='artist-empty'){assert.match(body,/No licensing transactions yet/);assert.match(body,/No recorded earnings/);assert.doesNotMatch(body,/USD 0.00/);}
  if(name==='artist-limited'){assert.match(body,/All-transaction totals unavailable/);assert.doesNotMatch(body,/No recorded earnings/);assert.equal(await page.locator('a[rel="next"]').getAttribute('href'),'?page=2');}
  if(name==='buyer-outage'){assert.match(body,/temporarily unavailable/);assert.doesNotMatch(body,/No invoices yet/);assert.equal(await page.locator('a[href="/buyer/settings#account-billing"]').count(),1);}
  if(name==='buyer-empty')assert.match(body,/No invoices yet/);
  if(name==='buyer-yen')assert.match(body,/JPY 1,200/);
  for(const width of [320,390,1280]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' at '+width);await page.screenshot({path:`${output}/${name}-${width}.png`,fullPage:true});}
 }
 console.log('PASS: actual Artist and Buyer page rendering, outage/empty distinction, currency exponents, gated subscriptions/payouts, statement link, keyboard activity, 320/390/1280px layouts');
}finally{await browser?.close();}
