import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {realpath} from 'node:fs/promises';
import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm,readdir,stat,chmod,symlink,link} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createDurableExecutionEvidence,readDurableExecutionEvidence,createDurablePreservationSession,recoverDurablePreservation,collectPostflightWithDiagnostics} from '../scripts/diagnostics/durable-execution-evidence.mjs';
import {databaseSources,project} from '../scripts/diagnostics/staging-preservation-query.mjs';
import {comparePreservationSnapshots} from '../scripts/diagnostics/postflight-preservation.mjs';
import {admin,authorization} from './helpers/bounded-execution-fixture.mjs';
const scope={sourceCommit:'a'.repeat(40),environmentId:project,operatorId:admin,authorizationId:authorization,runId:'synthetic-run',executionStartedAt:'2026-10-22T01:00:00Z'};
async function fixture(fn){const root=await realpath(await mkdtemp(join(tmpdir(),'tse-durable-evidence-')));try{const options={directory:root+'/run',keyRef:'synthetic-custody-key',keyProvider:async()=>Buffer.alloc(32,7),scope,fingerprintKey:Buffer.alloc(32,9)};await fn(options,root);}finally{await rm(root,{recursive:true,force:true});}}
test('encrypted baseline, original HMAC key, intent and terminal survive verified readback without plaintext',()=>fixture(async o=>{
 const w=createDurableExecutionEvidence(o);await w.baseline({privateMarker:'SYNTHETIC_PRIVATE_BASELINE'});await w.authorization({});await w.intent();await w.terminal({status:'failed'});
 const r=await readDurableExecutionEvidence(o);assert.deepEqual(r.records.map(x=>x.kind),['baseline','authorization','single_post_intent','terminal']);assert.equal(r.records[0].data.fingerprintKey,o.fingerprintKey.toString('base64'));
 assert.equal((await stat(o.directory)).mode&0o777,0o700);
 for(const f of await readdir(o.directory)){const p=o.directory+'/'+f;assert.equal((await stat(p)).mode&0o777,0o600);assert.doesNotMatch(await readFile(p,'utf8'),/SYNTHETIC_PRIVATE_BASELINE|fingerprintKey|single_post_intent|sourceCommit/);}
}));
for(const field of ['sourceCommit','environmentId','operatorId','authorizationId','runId','executionStartedAt'])test('recovery rejects changed scope: '+field,()=>fixture(async o=>{await createDurableExecutionEvidence(o).baseline({});const changed={...scope,[field]:field==='sourceCommit'?'b'.repeat(40):field==='executionStartedAt'?'2026-10-23T01:00:00Z':'other'};await assert.rejects(readDurableExecutionEvidence({...o,scope:changed}));}));
test('wrong key, missing custody and malformed ciphertext fail closed with fixed errors',()=>fixture(async o=>{
 await createDurableExecutionEvidence(o).baseline({secret:'SYNTHETIC'});
 await assert.rejects(readDurableExecutionEvidence({...o,keyProvider:async()=>Buffer.alloc(32,8)}),/evidence_verification_failed/);
 await assert.rejects(readDurableExecutionEvidence({...o,keyProvider:async()=>Buffer.alloc(0)}),/evidence_key_rejected/);
 await writeFile(o.directory+'/000000.sealed','truncated');await assert.rejects(readDurableExecutionEvidence(o),/evidence_verification_failed/);
}));
test('existing run cannot be reopened or resubmitted; concurrent writers acquire at most one directory',()=>fixture(async o=>{
 const a=createDurableExecutionEvidence(o),b=createDurableExecutionEvidence(o);const outcomes=await Promise.allSettled([a.baseline({}),b.baseline({})]);assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 await assert.rejects(createDurableExecutionEvidence(o).baseline({}),/evidence_write_failed/);
}));
test('interior deletion, unsafe permissions, symlinks and hardlinks reject recovery',()=>fixture(async(o,root)=>{
 const w=createDurableExecutionEvidence(o);await w.baseline({});await w.authorization({});await w.intent();await w.terminal({});
 await rm(o.directory+'/000001.sealed');await assert.rejects(readDurableExecutionEvidence(o),/evidence_sequence_rejected/);
 await rm(o.directory+'/000002.sealed');await rm(o.directory+'/000003.sealed');await chmod(o.directory+'/000000.sealed',0o644);await assert.rejects(readDurableExecutionEvidence(o));
 await chmod(o.directory+'/000000.sealed',0o600);await link(o.directory+'/000000.sealed',root+'/hard');await assert.rejects(readDurableExecutionEvidence(o));await rm(root+'/hard');
 await rm(o.directory+'/000000.sealed');await writeFile(root+'/external','{}',{mode:0o600});await symlink(root+'/external',o.directory+'/000000.sealed');await assert.rejects(readDurableExecutionEvidence(o));
}));
test('failed key persistence prevents baseline; writer never silently recovers or retries',()=>fixture(async o=>{const w=createDurableExecutionEvidence({...o,keyProvider:async()=>{throw Error('SYNTHETIC secret');}});await assert.rejects(w.baseline({}),/^Error: evidence_write_failed$/);await assert.rejects(w.intent(),/evidence_writer_unavailable/);}));
test('SIGKILL after durable intent: a fresh process recovers original evidence and cannot open a writer',{timeout:10000},()=>fixture(async(o,root)=>{
 const keyFile=root+'/key',scopeFile=root+'/scope';await writeFile(keyFile,Buffer.alloc(32,7),{mode:0o600});await writeFile(scopeFile,JSON.stringify(scope),{mode:0o600});
 const child=fileURLToPath(new URL('./helpers/durable-evidence-child.mjs',import.meta.url));
 const c=spawn(process.execPath,[child,'write',o.directory,keyFile,scopeFile],{stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{let text='';c.stdout.on('data',b=>{text+=b;if(text.includes('DURABLE_INTENT'))resolve();});c.once('error',reject);c.once('exit',code=>reject(Error('child exited '+code)));});
 const stopped=new Promise(resolve=>c.once('exit',resolve));c.kill('SIGKILL');await stopped;
 const result=await new Promise((resolve,reject)=>{let out='',err='';const r=spawn(process.execPath,[child,'read',o.directory,keyFile,scopeFile]);r.stdout.on('data',b=>out+=b);r.stderr.on('data',b=>err+=b);r.on('error',reject);r.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error(err)));});
 assert.deepEqual(result,{mode:'read_only_never_resubmit',kinds:['baseline','authorization','single_post_intent'],fingerprintKeyRecovered:true});
 await assert.rejects(createDurableExecutionEvidence(o).baseline({}),/evidence_write_failed/);
}));
test('restart collection restores original collector HMAC key; unchanged rows compare and mutations fail',()=>fixture(async o=>{
 let sequence=0,changed=false;
 const readerFactory=async()=>{const n=sequence++*10;const iso=s=>new Date(Date.UTC(2026,9,22,0,0,n+s)).toISOString();return {verify:async()=>{},close:()=>{},environment:async()=>({success:true,complete:true,count:1,readAt:iso(3),rows:[{id:'ANALYTICS_ENABLED',value:'false',scopes:['functions']}]}),database:async()=>[{snapshot:{environmentId:project,complete:true,consistent:true,readOnly:true,privilegedRead:true,startedAt:iso(0),finishedAt:iso(2),transactionId:'synthetic',sources:Object.fromEntries(Object.keys(databaseSources).map(source=>[source,{success:true,complete:true,count:1,readAt:iso(1),rows:[{id:source+'-record',fingerprint:changed&&source==='storage.objects'?'b'.repeat(64):'a'.repeat(64),loginFingerprint:null,loginTimes:null,ownerId:null,createdAt:null}]}]))}}]};};
 const s=await createDurablePreservationSession({...o,readerFactory});const before=await s.collect();assert.equal(before.diagnostic.status,'passed');await s.durableEvidence.baseline(before.snapshot);await s.durableEvidence.authorization({});await s.durableEvidence.intent();
 const recovered=await recoverDurablePreservation({...o,readerFactory});assert.equal(recovered.diagnostic.status,'passed');assert.equal(recovered.postIntentRecorded,true);assert.doesNotMatch(JSON.stringify(recovered),/fingerprintKey|domains|synthetic-record/);
 const options={mode:'READ_ONLY_NO_LOGIN',approvedAdminId:admin,environmentId:project,expectedNewSessions:0};assert.equal(comparePreservationSnapshots(recovered.beforeSnapshot,recovered.afterSnapshot,options).status,'passed');
 changed=true;const mutation=await recoverDurablePreservation({...o,readerFactory});assert.equal(comparePreservationSnapshots(mutation.beforeSnapshot,mutation.afterSnapshot,options).status,'failed');
}));

test('a shared writer cannot initialize another coordinator or append a second POST intent',()=>fixture(async o=>{const w=createDurableExecutionEvidence(o);await w.baseline({});await assert.rejects(w.baseline({}),/evidence_write_failed/);const other={...o,directory:o.directory+'-other'};const b=createDurableExecutionEvidence(other);await b.baseline({});await b.authorization({});await b.intent();await assert.rejects(b.intent(),/evidence_write_failed/);}));

test('optional health timeout retains the already captured mandatory snapshot',async()=>{let aborted=false;const snapshot={synthetic:'preserved'};const r=await collectPostflightWithDiagnostics({collectSnapshot:async()=>({snapshot,diagnostic:{status:'passed'}}),readHealth:({signal})=>new Promise(()=>signal.addEventListener('abort',()=>aborted=true)),healthTimeoutMs:5});assert.equal(r.snapshot,snapshot);assert.equal(r.optionalHealth,'failed_or_timeout');assert.equal(aborted,true);});
