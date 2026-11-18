// Dependency-injected local drills; these do not claim codec or hosted runtime proof.
import test from 'node:test';import assert from 'node:assert/strict';
import {writeFile,stat} from 'node:fs/promises';
import {runOne} from '../workers/media/worker.mjs';
import {MediaError} from '../workers/media/errors.mjs';
const digest='sha256:'+'b'.repeat(64);
function fixture(){const calls=[],logs=[];let scratch;
 const job={job_id:'synthetic-job',asset_id:'synthetic-asset',lease_epoch:1,lease_token:'synthetic-token',job_type:'source_validation',profile:'source-validator-v1'};
 const broker={claim:async()=>{calls.push('claim');return job;},read:async(_l,path)=>{scratch=path;await writeFile(path,'SYNTHETIC invalid media');return job;},heartbeat:async()=>{},fail:async(_l,code)=>calls.push('fail:'+code),complete:async()=>{calls.push('complete');},authorizeOutput:async()=>{calls.push('authorize');},writeOutput:async()=>{calls.push('write');}};
 return {broker,calls,logs,tools:{verify:async()=>{}},scratch:()=>scratch};}
test('missing transcoding prerequisite stops before claiming work or changing media state',async()=>{const f=fixture();f.tools.verify=async()=>{throw new MediaError('audio_unreadable');};await assert.rejects(runOne(f.broker,f.tools,digest,x=>f.logs.push(x)),/audio_unreadable/);assert.deepEqual(f.calls,[]);});
test('failed media input records a safe failure, removes scratch and never publishes output',async()=>{const f=fixture();await assert.rejects(runOne(f.broker,f.tools,digest,x=>f.logs.push(x)),/unsupported_format/);assert.deepEqual(f.calls,['claim','fail:unsupported_format']);await assert.rejects(stat(f.scratch()),/ENOENT/);assert.equal(f.logs.at(-1).state,'failed');});
test('broker Storage outage yields retryable sanitized failure without output or completion',async()=>{const f=fixture();f.broker.read=async()=>{throw Error('SYNTHETIC signed_url=private credential=private');};await assert.rejects(runOne(f.broker,f.tools,digest,x=>f.logs.push(x)),e=>e.code==='temporary_system_error'&&e.retryable);assert.deepEqual(f.calls,['claim','fail:temporary_system_error']);assert.doesNotMatch(JSON.stringify(f.logs),/signed_url|credential|private/);});
test('expired media lease never mutates the replacement worker job',async()=>{const f=fixture();f.broker.read=async()=>{throw new MediaError('worker_lease_expired');};await assert.rejects(runOne(f.broker,f.tools,digest,x=>f.logs.push(x)),/worker_lease_expired/);assert.deepEqual(f.calls,['claim']);});
