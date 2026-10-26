// Execute only with the pinned tools in a network-disabled Linux container.
// Real codec bytes + SQL emulator lifecycle; NOT native DB concurrency or hosted acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdtemp, rm, stat, readFile, writeFile, copyFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { uploadsFixture, create, reserve, observed, artist, worker, revision, asActor, invoke, ids, metadata } from './helpers/music-uploads-fixture.mjs';
import { MediaBroker, LocalObjects } from '../workers/media/broker.mjs';
import { MediaTools } from '../workers/media/process.mjs';
import { runOne } from '../workers/media/worker.mjs';
import { tone } from './media-worker/fixtures.mjs';
import { MediaError } from '../workers/media/errors.mjs';
import { packagedRuntime } from '../workers/media/packaged-runtime.mjs';
import { InputGrants } from '../services/media-broker/input-grants.mjs';
import { downloadInput } from '../workers/media/direct-input.mjs';
import { STAGING } from '../services/media-broker/common.mjs';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';

const tools = process.env.TSE_PORTABLE_RUNTIME ? await packagedRuntime(process.env.TSE_PORTABLE_RUNTIME,process.env.TSE_PORTABLE_MANIFEST_SHA256) : new MediaTools(process.env.MEDIA_TOOL_DIR || '/opt/media/bin');
// Synthetic receipt only; never a claim that a production image has been built.
const digest = 'sha256:' + '0'.repeat(64);
async function fixture(body) {
  assert.equal(process.platform, 'linux', 'Run in the isolated Linux codec container');
  const db = await uploadsFixture(), dir = await mkdtemp(join(tmpdir(), 'processing-lifecycle-'));
  await db.exec('update submission_media.capabilities set activation_enabled=false');
  const authority = {
    claim: () => worker(db, 'claim_job'),
    heartbeat: l => worker(db, 'heartbeat_job', [l.job_id,l.lease_epoch,l.lease_token]),
    complete: (l,r,e=null) => worker(db, 'complete_job', [l.job_id,l.lease_epoch,l.lease_token,r,e]),
    async withLease(l, body) {
      const resolve = () => worker(db, 'resolve_worker_io', [l.job_id,l.lease_epoch,l.lease_token]);
      const record = o => worker(db, 'record_worker_output', [l.job_id,l.lease_epoch,l.lease_token,o.object_id,o.version,o.sha256,o.bytes]);
      // This emulator adapter is sequential. Native row locks/concurrency remain
      // covered by the separate PostgreSQL suite, never inferred from this test.
      const result = await body(await resolve(), resolve, record);
      await resolve(); return result;
    }
  };
  const objects = new LocalObjects(join(dir, 'objects'), (j,o) => db.query(
    'insert into storage.objects(id,bucket_id,name,version,metadata) values($1,$2,$3,$4,jsonb_build_object(\'size\',$5::bigint,\'mimetype\',$6::text))',
    [o.object_id,j.bucket,j.path,o.version,o.bytes,j.job_type==='preview_generation'?'audio/mp4':'application/octet-stream']));
  const broker = new MediaBroker(authority, objects);
  if(process.env.TSE_PORTABLE_RUNTIME){
    // Emulated private Storage capability: bytes never traverse broker responses.
    // The real SQL lease resolver supplies canonical owner/path/version evidence.
    const read=broker.read.bind(broker);
    broker.read=async(l,target,signal)=>{
      const grants=new InputGrants(authority,{sign:async(i,_ttl,id)=>`https://${STAGING}.supabase.co/storage/v1/object/sign/${i.bucket}/${i.path}?token=synthetic&cacheNonce=${id}`});
      const {job,grant}=await grants.issue(l);
      await downloadInput(grant,job,target,{signal,fetcher:async()=>{const i=job.source||job,o=objects.objects.get(i.object_id);assert.equal(o.version,i.version);return new Response(Readable.toWeb(createReadStream(o.path)));}});
      // Existing adapter rechecks ownership/version without granting authority to
      // the downloaded path; a separate temporary copy retains existing fencing.
      const check=target+'-recheck';await read(l,check,signal);assert.equal(createHash('sha256').update(await readFile(check)).digest('hex'),createHash('sha256').update(await readFile(target)).digest('hex'));await rm(check);
      return job;
    };
  }
  const upload = async (s, path) => {
    const bytes = (await stat(path)).size;
    const r = await reserve(db,s,'master',{bytes,filename:'Synthetic processing.wav'});
    await observed(db,s,r.asset_id,{bytes});
    const a = (await db.query('select storage_object_id object_id,storage_version version from submission_media.assets where id=$1',[r.asset_id])).rows[0];
    await objects.register(a,path); return r.asset_id;
  };
  try { await body({ db,dir,broker,objects,upload }); }
  finally { await db.close(); await rm(dir,{recursive:true,force:true}); }
}

test('actual decoded source → waveform → playable AAC preview → Artist acceptance → SEC pending; activation and commerce remain OFF', () => fixture(async c => {
  const s=await create(c.db), input=join(c.dir,'source.wav');
  await tone(input,{seconds:35,rate:96000,channels:1});
  const master=await c.upload(s,input);
  await runOne(c.broker,tools,digest); await runOne(c.broker,tools,digest);
  const source=(await c.db.query('select technical_state,measured_frames,duration_us,sample_rate,bit_depth,encode(sha256,\'hex\') sha from submission_media.assets where id=$1',[master])).rows[0];
  assert.equal(source.technical_state,'ready'); assert.equal(Number(source.sample_rate),96000);
  assert.equal(Number(source.duration_us),35000000); assert.equal(Number(source.measured_frames),3360000);
  assert.equal(source.sha,createHash('sha256').update(await readFile(input)).digest('hex'));
  await artist(c.db,'media_select_preview_region',[s,master,0,30000,await revision(c.db,s),randomUUID()]);
  const preview=await artist(c.db,'media_request_preview',[s,await revision(c.db,s),randomUUID()]);
  await runOne(c.broker,tools,digest);
  await artist(c.db,'media_accept_asset',[s,preview.asset_id,await revision(c.db,s),randomUUID()]);
  assert.equal(await artist(c.db,'media_upload_can_play',[s,preview.asset_id]),true);
  await asActor(c.db,ids.buyer,()=>assert.rejects(invoke(c.db,'media_upload_can_play',[s,preview.asset_id]),e=>e.code==='42501'));
  const saved=await artist(c.db,'media_upload_save_metadata',[s,metadata,await revision(c.db,s),randomUUID()]);
  const k=randomUUID(),v=await revision(c.db,s);
  const review=await artist(c.db,'media_upload_submit',[s,v,k]);
  assert.deepEqual(await artist(c.db,'media_upload_submit',[s,v,k]),review);
  const state=(await c.db.query('select status,approved_at from public.tracks where id=$1',[saved.track_id])).rows[0];
  assert.equal(state.status,'pending_review'); assert.equal(state.approved_at,null);
  const admin=await asActor(c.db,ids.admin,()=>invoke(c.db,'media_upload_admin_read',[s]));
  assert.equal(admin.review.state,'pending');
  assert.equal((await c.db.query('select activation_enabled from submission_media.capabilities')).rows[0].activation_enabled,false);
  const hash=(await c.db.query('select encode(package_hash,\'hex\') h from submission_media.master_reviews where id=$1',[review.review_id])).rows[0].h;
  await asActor(c.db,ids.admin,()=>assert.rejects(invoke(c.db,'media_decide_master_review',[review.review_id,true,hash,admin.revision,randomUUID()]),/disabled/i));
  assert.equal((await c.db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
  assert.equal((await c.db.query('select count(*)::int n from public.orders')).rows[0].n,0);
  const results=(await c.db.query("select kind,storage_bytes,encode(sha256,'hex') sha256,duration_us,waveform_points from submission_media.assets where submission_id=$1 order by kind",[s])).rows;
  if(process.env.TSE_SYNTHETIC_EVIDENCE_DIR==='/evidence') {
    for(const a of (await c.db.query('select kind,storage_object_id from submission_media.assets where submission_id=$1',[s])).rows) {
      const object=c.objects.objects.get(a.storage_object_id);
      await copyFile(object.path,join('/evidence',a.kind==='source_master'?'synthetic-source.wav':a.kind==='buyer_preview'?'synthetic-preview.m4a':'synthetic-waveform.bin'),constants.COPYFILE_EXCL);
    }
    await writeFile('/evidence/synthetic-lifecycle.json',JSON.stringify({status:'PASS',scope:'Real Linux codec processing + sequential SQL emulator; no hosted Storage/native DB concurrency',platform:process.platform,architecture:process.arch,node:process.version,buildDigest:'synthetic-only',activationEnabled:false,secReview:'pending',assets:results},null,2));
  }
}));

test('transient interruption recovers one source job without a duplicate asset; corrupt audio never becomes reviewable', () => fixture(async c => {
  const s=await create(c.db), input=join(c.dir,'source.wav'); await tone(input,{seconds:2}); await c.upload(s,input);
  const original=c.broker.read.bind(c.broker); c.broker.read=async()=>{throw new MediaError('temporary_system_error');};
  await assert.rejects(runOne(c.broker,tools,digest),/temporary_system_error/);
  assert.equal((await c.db.query('select state from submission_media.jobs')).rows[0].state,'retry_wait');
  c.broker.read=original; await c.db.exec("update submission_media.jobs set available_at=clock_timestamp()-interval '1 second'");
  await runOne(c.broker,tools,digest); await runOne(c.broker,tools,digest);
  assert.equal((await c.db.query("select count(*)::int n from submission_media.assets where kind='source_master'")).rows[0].n,1);
  const bad=await create(c.db), invalid=join(c.dir,'invalid.wav');await writeFile(invalid,'not an audio recording');await c.upload(bad,invalid);
  await assert.rejects(runOne(c.broker,tools,digest),/unsupported_format/);
  await assert.rejects(artist(c.db,'media_upload_submit',[bad,await revision(c.db,bad),randomUUID()]));
  assert.equal((await c.db.query('select count(*)::int n from submission_media.master_reviews')).rows[0].n,0);
}));
