import test from 'node:test';
import assert from 'node:assert/strict';

import {gateDReceiptObjectPath,renderGateDReceipt} from '../lib/gate-d/receipt.ts';

const grant='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const input={
  orderId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  paymentDate:'2026-10-04T00:00:00Z',
  trackTitle:'QA (Track) \\ title <script> — test',
  licenseName:'Digital Campaign',
  amountMinor:120000,
  currency:'USD',
  paymentIntentId:'pi_gateDfixture'
};

test('Gate D receipt is bounded, deterministic, escaped, TEST-classified and not a tax invoice',()=>{
  const first=renderGateDReceipt(input);
  const second=renderGateDReceipt(input);
  assert.equal(first.sha256,second.sha256);
  assert.deepEqual(first.bytes,second.bytes);
  assert.ok(first.byteSize>0&&first.byteSize<=1024*1024);
  assert.equal(first.mimeType,'application/pdf');
  const text=first.bytes.toString('utf8');
  assert.match(text,/TEST - NOT A TAX INVOICE/g);
  assert.doesNotMatch(text,/<script>/);
  assert.ok(text.includes("QA \\(Track\\) \\\\ title"));
  assert.doesNotMatch(text,/\/(?:JS|JavaScript|OpenAction|URI|Launch|EmbeddedFile)\b/);
  assert.doesNotMatch(text,/https?:\/\//i);
  assert.match(text,/\/Type \/Pages \/Count 1\b/);

  const offsets=[...text.matchAll(/(\d{10}) 00000 n/g)].map(match=>Number(match[1]));
  assert.equal(offsets.length,5);
  offsets.forEach((offset,index)=>assert.equal(text.slice(offset,offset+7),`${index+1} 0 obj`));
  const stream=text.match(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/);
  assert.ok(stream);
  assert.equal(Buffer.byteLength(stream[2],'utf8'),Number(stream[1]));
  const xref=Number(text.match(/startxref\n(\d+)\n%%EOF$/)[1]);
  assert.equal(text.slice(xref,xref+4),'xref');
});

test('Gate D receipt path cannot be influenced by Buyer or track text',()=>{
  assert.equal(gateDReceiptObjectPath(grant),`gate-d/${grant}/receipt-v1.pdf`);
  assert.throws(()=>gateDReceiptObjectPath('../foreign'),/Invalid Gate D grant/);
});

test('Gate D receipt rejects oversized and malformed fields',()=>{
  assert.throws(()=>renderGateDReceipt({...input,trackTitle:'x'.repeat(161)}),/track title/);
  assert.throws(()=>renderGateDReceipt({...input,paymentIntentId:'not-a-payment'}),/identity/);
  assert.throws(()=>renderGateDReceipt({...input,amountMinor:0}),/amount/);
});
