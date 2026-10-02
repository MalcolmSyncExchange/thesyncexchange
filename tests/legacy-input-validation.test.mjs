import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {classifyLegacyOrder} from '../lib/commerce/legacy-classifier.mjs';
import {legacyRow} from './fixtures/purchase-completion/legacy-row.mjs';
const row=()=>structuredClone(legacyRow);
const invalid=(input,code)=>{
 const result=classifyLegacyOrder(input);
 assert.equal(result.classification,'INVALID_INPUT');assert.equal(result.operationalOutcome,'DO_NOT_BACKFILL');
 assert.equal(result.safeToMap,false);assert.equal(result.masterEntitlement,'DENIED');assert.equal(result.mutationPerformed,false);
 assert.ok(result.validationErrors.length>0);
 if(code)assert.ok(result.validationErrors.some(e=>e.code===code),JSON.stringify(result.validationErrors));
 return result;
};
test('complete typed fixtures preserve all four operational outcomes',()=>{
 const safe=classifyLegacyOrder(row());assert.equal(safe.classification,'SAFE_TO_MAP');assert.equal(safe.safeToMap,true);
 assert.equal(classifyLegacyOrder({...row(),status:'pending'}).classification,'DO_NOT_BACKFILL');
 assert.equal(classifyLegacyOrder({...row(),has_agreement_path:false}).classification,'INCOMPLETE');
 assert.equal(classifyLegacyOrder({...row(),verified_payment_evidence:false}).classification,'AMBIGUOUS');
 assert.equal(classifyLegacyOrder({...row(),payment_classification:null}).classification,'AMBIGUOUS');
 assert.equal(classifyLegacyOrder({...row(),snapshot_amount:1}).classification,'DO_NOT_BACKFILL');
});
test('every boolean evidence field rejects all non-boolean representations',()=>{
 for(const field of ['has_paid_at','has_payment_intent','has_agreement_path','test_session','snapshot_order_matches','snapshot_buyer_matches',
 'snapshot_track_matches','verified_payment_evidence','frozen_seller_rights','frozen_asset_version','has_legacy_webhook_activity']) {
  for(const value of ['false','true','','0','1','1200',null,undefined,NaN,Infinity,-1,0,1,{},[]])
   invalid({...row(),[field]:value},value===undefined?'missing_required_field':'invalid_boolean');
 }
 for(const field of ['livemode','commercialRightsGranted'])for(const value of ['false','true','',null,undefined,0,1,{},[]])
  invalid({...row(),payment_classification:{...legacyRow.payment_classification,[field]:value}},value===undefined?'missing_required_field':'invalid_boolean');
});
test('money requires actual finite safe integers; no numeric strings or coercion',()=>{
 for(const field of ['amount_cents','snapshot_amount'])for(const value of ['false','true','','0','1200',null,undefined,NaN,Infinity,-1,0.1,{},[],Number.MAX_SAFE_INTEGER+1])
  invalid({...row(),[field]:value},value===undefined?'missing_required_field':'invalid_minor_units');
 invalid({...row(),amount_cents:0},'invalid_minor_units');
 assert.equal(classifyLegacyOrder({...row(),snapshot_amount:0}).classification,'DO_NOT_BACKFILL');
});
test('required ID, row completeness, enums and nested classifications fail closed',()=>{
 for(const value of [null,undefined,{},[],false,'',0])invalid(value);
 for(const value of ['',null,undefined,{},[],123,'not-a-uuid',' '+legacyRow.id])invalid({...row(),id:value});
 for(const field of Object.keys(legacyRow)){const input=row();delete input[field];invalid(input,'missing_required_field');}
 for(const value of ['Production','production_beta',' staging ','unknown','',null,undefined,{},[]])invalid({...row(),deployment_environment:value});
 for(const field of ['paymentMode','releaseMode'])for(const value of ['TEST','unknown','',null,undefined,{},[]])
  invalid({...row(),payment_classification:{...legacyRow.payment_classification,[field]:value}});
 invalid({...row(),status:'PAID'});invalid({...row(),agreement_status:'complete'});invalid({...row(),currency:'usd'});
 invalid({...row(),payment_classification:{...legacyRow.payment_classification,livemode:true}});
 invalid({...row(),payment_classification:{...legacyRow.payment_classification,releaseMode:'preview'}},'invalid_environment');
 invalid({...row(),has_paid_at:'false',amount_cents:'5000',frozen_asset_version:[],deployment_environment:'unknown'});
});
test('validation consumes a parsed snapshot; diagnostics never echo rejected values or unknown keys',()=>{
 const secret='DO_NOT_ECHO_SENSITIVE_VALUE';
 const result=invalid({...row(),id:secret,[secret]:secret,payment_classification:{...legacyRow.payment_classification,paymentMode:secret}});
 assert.equal(result.orderId,null);assert.ok(!JSON.stringify(result).includes(secret));
 const input=row();classifyLegacyOrder(input);assert.deepEqual(input,legacyRow);
});
test('optional export timestamps require real dates, times and offsets without Date normalization',()=>{
 for(const value of ['2026-99-99T99:99:99Z','2026-02-30T12:00:00Z','2026-10-02T00:00:00+99:99',
 '2025-02-29T00:00:00Z','1900-02-29T00:00:00Z','0000-01-01T00:00:00Z','2026-01-01T24:00:00Z','2026-01-01T00:00:60Z'])
  invalid({...row(),created_at:value},'invalid_timestamp');
 for(const value of ['2026-10-02T00:00:00Z','2024-02-29T23:59:59+14:00','2000-02-29T12:00:00Z','2026-04-21 23:21:35.182603+00'])
  assert.equal(classifyLegacyOrder({...row(),created_at:value}).classification,'SAFE_TO_MAP');
});
test('CLI separates invalid evidence from ambiguity and fails closed on malformed JSON without echoing it',()=>{
 const directory=mkdtempSync(join(tmpdir(),'legacy-validation-'));
 const file=join(directory,'rows.json');
 try {
  writeFileSync(file,JSON.stringify([row(),{...row(),verified_payment_evidence:false},{...row(),has_paid_at:'false'}]));
  const run=spawnSync(process.execPath,['scripts/purchase-completion/legacy-dry-run.mjs',file],{encoding:'utf8'});
  assert.equal(run.status,1);const report=JSON.parse(run.stdout);
  assert.equal(report.counts.SAFE_TO_MAP,1);assert.equal(report.counts.AMBIGUOUS,1);assert.equal(report.counts.INVALID_INPUT,1);
  assert.equal(report.operationalCounts.DO_NOT_BACKFILL,1);assert.equal(report.validInput,false);
  writeFileSync(file,'{"DO_NOT_ECHO_SENSITIVE_VALUE": broken');
  const bad=spawnSync(process.execPath,['scripts/purchase-completion/legacy-dry-run.mjs',file],{encoding:'utf8'});
  assert.equal(bad.status,1);assert.ok(!`${bad.stdout}${bad.stderr}`.includes('DO_NOT_ECHO_SENSITIVE_VALUE'));
  assert.equal(JSON.parse(bad.stdout).validationErrors[0].code,'invalid_json');
 } finally {rmSync(directory,{recursive:true,force:true});}
});
