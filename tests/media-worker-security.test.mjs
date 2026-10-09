import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { MediaBroker } from '../workers/media/broker.mjs';
import { safeError,MediaError } from '../workers/media/errors.mjs';
import { verifyOutput } from '../workers/media/files.mjs';
import { MediaTools } from '../workers/media/process.mjs';
const root=new URL('../',import.meta.url),read=p=>readFile(new URL(p,root),'utf8');
test('source boundaries: no commerce, service keys, shell, URL fetching or activation',async()=>{
 const files=['workers/media/worker.mjs','workers/media/media.mjs','workers/media/process.mjs','workers/media/broker.mjs'];
 for(const f of files){const s=await read(f);assert.doesNotMatch(s,/SUPABASE_SERVICE_ROLE|STRIPE|process\.env\.(?!MEDIA_TOOL)|shell:\s*true|execSync|fetch\(|media_accept|media_decide|media_request_master_review/);}
 const sql=await read('supabase/migrations/20261008231329_slice3_media_worker_fenced_io.sql');
 assert.match(sql,/security definer set search_path=''/);assert.match(sql,/for update/);assert.match(sql,/lease_token<>p_token/);assert.match(sql,/lease_expires_at<=clock_timestamp/);assert.match(sql,/from public,anon,authenticated,service_role/);assert.doesNotMatch(sql,/create policy|create trigger .* on storage|insert into|update public|commerce_private|gate_d/);
 const docker=await read('workers/media/Dockerfile');assert.match(docker,/USER 1000:1000/);assert.match(docker,/sha256:173f/);assert.doesNotMatch(docker,/COPY \.|ARG .*KEY|ENV .*KEY/);assert.match(docker,/FROM scratch/);assert.match(docker,/VALIDSIG FCF986/);
 const sandbox=await read('workers/media/sandbox.py');assert.match(sandbox,/RLIMIT_AS/);assert.match(sandbox,/RLIMIT_FSIZE/);assert.match(sandbox,/seccomp/);assert.match(sandbox,/os\.execve/);
});
test('output capability binds tuple/profile/destination, expires, is one-use and rechecks lease at write',async()=>{
 const l={job_id:randomUUID(),lease_epoch:1,lease_token:randomUUID()},job={...l,asset_id:randomUUID(),job_type:'preview_generation',profile:'preview-aac-lc-v1',bucket:'submission-derived',path:'trusted-only',object_id:null,max_bytes:4e6};
 let live=true,writes=0,rechecks=0;
 const authority={async withLease(lease,fn){if(!live||lease.lease_epoch!==l.lease_epoch)throw new MediaError('worker_lease_expired');return fn({...job},async()=>{rechecks++;if(!live)throw new MediaError('worker_lease_expired');},async()=>{});}};
 const storage={async createExact(_job,_path,facts){writes++;return {bytes:facts.actual_bytes,sha256:facts.sha256};}};
 const b=new MediaBroker(authority,storage),d=await mkdtemp('/private/tmp/cap-test-'),p=d+'/output';await writeFile(p,'x');const proof=await verifyOutput(p,4e6,undefined,async()=>({}));
 try {
  const c=await b.authorizeOutput(l);live=false;await assert.rejects(b.writeOutput(l,c,proof));assert.equal(writes,0);live=true;
  const wrong=await b.authorizeOutput(l);job.path='substituted';await assert.rejects(b.writeOutput(l,wrong,proof));assert.equal(writes,0);job.path='trusted-only';
  const exact=await b.authorizeOutput(l);await b.writeOutput(l,exact,proof);assert.equal(writes,1);assert.equal(rechecks,2);await assert.rejects(b.writeOutput(l,exact,proof));
  await assert.rejects(b.authorizeOutput({...l,path:'../escape'}));await assert.rejects(b.authorizeOutput({...l,bucket:'foreign'}));
 }finally{await rm(d,{recursive:true,force:true});}
});
test('safe errors have no raw provider details; output/probe/time budgets are enforced',async()=>{
 const raw=Error('signed_url=secret password=secret /private/object FFmpeg command');const safe=safeError(raw);assert.equal(safe.message,'temporary_system_error');assert.equal(safe.cause,undefined);assert.equal(safe.retryable,true);
 assert.equal(new MediaError('audio_unreadable').retryable,false);
 const tools=new MediaTools(process.env.MEDIA_TOOL_DIR||'/private/tmp/slice3-media-tools/bin');
 await assert.rejects(tools.run('ffprobe',['-version'],{maxBytes:1}),/validation_failed/);
 await assert.rejects(tools.run('ffprobe',['-version'],{timeout:1}),/validator_timeout/);
});
