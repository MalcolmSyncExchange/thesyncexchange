// Explicit local-only test. It accepts no URL, credentials, host ports or
// volumes and uses only an already-cached postgres:17 image.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {fixtureBootstrapSql,postgresPgcryptoBootstrapSql,seedDatabase,ids,root,source} from './helpers/artist-baseline-db.mjs';

function docker(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
    child.on('close',code=>code===0?resolve(out.trim()):reject(Error(`Local Docker command failed (${code}): ${err}`)));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}

test('fresh non-analytics baseline uses hosted pgcrypto for Gate D digest creation/retry and preserves reservation fencing', {timeout:60000},async t=>{
  const name=`tse-gate-d-${randomUUID()}`;let owned=false;
  const sql=text=>docker(['exec','-i',name,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres'],text);
  const waitFor=async predicate=>{for(let i=0;i<80;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,50));}throw Error('Local concurrency barrier timed out');};
  const qaBuyer='8ffc95e8-0e8f-428e-ac26-925d6bc98fcd';
  const session='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const order='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const asset='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const digest='a'.repeat(64);
  const actor=`set local role authenticated;
    select set_config('request.jwt.claim.sub','${qaBuyer}',true);
    select set_config('request.jwt.claim.role','authenticated',true);
    select set_config('request.jwt.claim.session_id','${session}',true);`;
  try {
    await docker(['run','--pull','never','--rm','--detach','--network','none','--name',name,'--tmpfs','/var/lib/postgresql/data:rw',
      '-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17']);owned=true;
    await waitFor(async()=>{try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres']);return true;}catch{return false;}});

    const excluded=new Set(['20260915072720_analytics_purchase_outbox.sql','20261010060000_analytics_verified_purchase_evidence.sql']);
    const manifest=JSON.parse(source('docs/security-pr2/migration-manifest.json')).order;
    const available=readdirSync(new URL('supabase/migrations/',root));
    const files=manifest.map(m=>m.file);
    assert.ok(files.every(f=>available.includes(f)&&!excluded.has(f)),'Historical baseline remains a preserved subset of the integrated candidate');
    assert.equal(files.length,31);
    assert.deepEqual(manifest.map(m=>m.file),files,'Replay the complete reviewed non-analytics baseline in exact order');
    await sql([fixtureBootstrapSql,postgresPgcryptoBootstrapSql].join('\n'));
    for(const migration of manifest) {
      const text=source(`supabase/migrations/${migration.file}`);
      assert.equal(createHash('sha256').update(text).digest('hex'),migration.sha256,migration.file);
      await sql(text); // Exact source SQL: no digest shims or migration rewriting.
      t.diagnostic(`Applied ${migration.file}`);
    }
    const cryptoState=JSON.parse(await sql(`select json_build_object(
      'schema',n.nspname,'version',e.extversion,'language',l.lanname,
      'extension_owned',exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass
        and d.objid=p.oid and d.refclassid='pg_extension'::regclass and d.refobjid=e.oid and d.deptype='e'),
      'public_digest',to_regprocedure('public.digest(text,text)') is not null,
      'core_uuid',to_regprocedure('pg_catalog.gen_random_uuid()') is not null)
      from pg_extension e join pg_namespace n on n.oid=e.extnamespace
      join pg_proc p on p.oid='extensions.digest(text,text)'::regprocedure
      join pg_language l on l.oid=p.prolang where e.extname='pgcrypto';`));
    assert.deepEqual(cryptoState,{schema:'extensions',version:'1.3',language:'c',extension_owned:true,public_digest:false,core_uuid:true});
    assert.equal(await sql("select encode(extensions.digest('abc','sha256'),'hex')"),
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    await assert.rejects(sql("select public.digest('abc','sha256')"),/does not exist/);
    assert.deepEqual(JSON.parse(await sql(`select json_build_object(
      'users',(select count(*) from auth.users),'tracks',(select count(*) from tracks),
      'orders',(select count(*) from orders),'payment_events',(select count(*) from commerce_private.payment_events),
      'fulfillment_jobs',(select count(*) from commerce_private.fulfillment_jobs),
      'acceptance_grants',(select count(*) from commerce_private.acceptance_grants),
      'analytics_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='public' and c.relname like '%analytics%'),
      'analytics_rpcs',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname like '%analytics%'),
      'capabilities_off',(select not (foundation_enabled or asset_preparation_enabled or receipt_generation_enabled
        or entitlement_activation_enabled or transaction_projection_enabled or payment_adapter_enabled)
        from commerce_private.capabilities));`)),
      {users:0,tracks:0,orders:0,payment_events:0,fulfillment_jobs:0,acceptance_grants:0,analytics_tables:0,analytics_rpcs:0,capabilities_off:true});
    t.diagnostic('31 source migrations replayed without rewriting; real pgcrypto in extensions; empty application data; analytics absent; capabilities OFF');
    const seed=[];await seedDatabase({exec:async statement=>seed.push(statement+';')});
    // Each psql invocation is a new session; set the trusted fixture actor again.
    await sql(["select set_config('request.jwt.claim.role','service_role',false);",...seed].join('\n'));
    await sql(`
      select set_config('request.jwt.claim.role','service_role',false);
      insert into auth.users(id,email) values('${qaBuyer}','qa-buyer@thesyncexchange.com');
      insert into user_profiles(id,email,role,full_name) values('${qaBuyer}','qa-buyer@thesyncexchange.com','buyer','Gate D QA Buyer');
      insert into buyer_profiles(user_id,company_name,industry_type,buyer_type,billing_email)
        values('${qaBuyer}','Gate D QA','QA','Producer','qa-buyer@thesyncexchange.com');
      insert into auth.sessions(id,user_id) values('${session}','${qaBuyer}');
      insert into storage.objects(bucket_id,name,version,metadata)
        values('purchase-assets','${asset}/master','gate-v1','{"size":100,"mimetype":"audio/wav"}');
      insert into commerce_private.asset_versions(
        id,track_id,source_object_id,source_bucket,source_path,source_version,
        object_id,object_version,sha256,byte_size,mime_type,state,approval_state
      ) select '${asset}',t.id,s.id,'track-audio',t.audio_file_path,s.version,
        d.id,d.version,'${digest}',100,'audio/wav','ready','approved'
        from tracks t join storage.objects s on s.bucket_id='track-audio' and s.name=t.audio_file_path
        join storage.objects d on d.bucket_id='purchase-assets' and d.name='${asset}/master'
        where t.id='${ids.live}';
      insert into commerce_private.qa_fixture_designations(asset_version_id,buyer_user_id,approval_reference)
        values('${asset}','${qaBuyer}','gate-d-local-concurrency');
      insert into orders(id,buyer_user_id,track_id,license_type_id,amount_cents,currency)
        values('${order}','${qaBuyer}','${ids.live}','${ids.license}',5000,'USD');
      insert into commerce_private.acceptance_grants(
        buyer_user_id,order_id,seller_user_id,track_id,license_type_id,asset_version_id,
        amount_minor,currency,provider_account,approval_reference,operator_reference
      ) values('${qaBuyer}','${order}','${ids.a}','${ids.live}','${ids.license}','${asset}',
        5000,'USD','acct_gatefixture','d1-local-approved-contract','local-concurrency-test');
    `);

    const reserve=`${actor} select result_code from public.gate_d_reserve_acceptance('${order}');`;
    const first=sql(`set application_name='gate-d-first';begin;${reserve}select pg_sleep(2);commit;`);
    await waitFor(async()=>await sql("select count(*) from pg_stat_activity where application_name='gate-d-first' and wait_event='PgSleep'")==='1');
    const second=sql(`set application_name='gate-d-second';begin;${reserve}commit;`);
    await waitFor(async()=>await sql("select count(*) from pg_stat_activity where application_name='gate-d-second' and wait_event_type='Lock'")==='1');
    const [firstResult,secondResult]=await Promise.all([first,second]);
    assert.match(firstResult,/reserved/);
    assert.match(secondResult,/checkout_creation_in_progress/);
    assert.equal(await sql(`select count(*) from commerce_private.acceptance_grants where state='reserved'`),'1');

    const grantId=await sql(`select id from commerce_private.acceptance_grants`);
    const stale=(await sql(`select reservation_lease_token||'|'||attempt_id||'|'||reservation_lease_epoch
      from commerce_private.acceptance_grants`)).split('|');
    await sql(`update commerce_private.acceptance_grants set reservation_lease_until=now()-interval '1 second'`);
    const recovered=await sql(`begin;${reserve}commit;`);
    assert.match(recovered,/reservation_recovered/);
    const current=(await sql(`select reservation_lease_token||'|'||attempt_id||'|'||reservation_lease_epoch
      from commerce_private.acceptance_grants`)).split('|');
    assert.equal(current[1],stale[1]);
    assert.notEqual(current[0],stale[0]);
    assert.equal(Number(current[2]),Number(stale[2])+1);
    await assert.rejects(sql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
      select * from public.gate_d_prepare_checkout(
      '${grantId}','${stale[1]}',${stale[2]},'https://example.invalid');`),/Stale Gate D reservation epoch/);
    const currentPrepared=(await sql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
      select reservation_lease_token||'|'||stripe_parameters_sha256||'|'||provider_expires_at
      from public.gate_d_prepare_checkout('${grantId}','${current[1]}',${current[2]},'https://example.invalid');`)).split('\n').at(-1).split('|');
    const canonical=await sql(`select stripe_request_spec from commerce_private.acceptance_grants where id='${grantId}'`);
    assert.equal(currentPrepared[1],createHash('sha256').update(canonical).digest('hex'));
    const repeated=(await sql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
      select stripe_parameters_sha256 from public.gate_d_prepare_checkout(
        '${grantId}','${current[1]}',${current[2]},'https://example.invalid');`)).split('\n').at(-1);
    assert.equal(repeated,currentPrepared[1],'The second digest branch validates the frozen parameters');
    t.diagnostic('Gate D first preparation and identical retry both match independent Node SHA-256 with public.digest absent');
    await assert.rejects(sql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
      select public.gate_d_bind_checkout('${grantId}','${current[1]}','${stale[0]}',${current[2]},
        '${currentPrepared[1]}','cs_test_stalelease','${currentPrepared[2]}');`),/Stale or mismatched Gate D checkout binding/);
    assert.deepEqual((await sql(`select sequence from commerce_private.acceptance_grant_audit order by sequence`)).split('\n'),['1','2','3','4']);
  } finally {
    if(owned)await docker(['rm','--force',name]);
  }
});
