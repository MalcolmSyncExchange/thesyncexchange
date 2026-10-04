// Explicit local-only test. It accepts no URL, credentials, host ports or
// volumes and uses only an already-cached postgres:17 image.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readdirSync} from 'node:fs';
import {fixtureBootstrapSql,seedDatabase,ids,root,source} from './helpers/artist-baseline-db.mjs';

function docker(args,input='') {
  return new Promise((resolve,reject)=>{
    const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';
    child.stdout.on('data',b=>out+=b);child.stderr.on('data',b=>err+=b);child.on('error',reject);
    child.on('close',code=>code===0?resolve(out.trim()):reject(Error(`Local Docker command failed (${code}): ${err}`)));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}

test('two PostgreSQL connections serialize one reservation, recover one attempt, and reject the stale lease', {timeout:60000},async()=>{
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

    const seed=[];await seedDatabase({exec:async statement=>seed.push(statement+';')});
    const bootstrap=fixtureBootstrapSql.replace(/\s*create function public\.digest\(value text,algorithm text\)[\s\S]*?\$\$;\n\s*(?=create function storage\.foldername)/,'\n   ');
    const migrations=readdirSync(new URL('supabase/migrations/',root)).filter(f=>f.endsWith('.sql')).sort().map(f=>source(`supabase/migrations/${f}`));
    await sql([bootstrap,...migrations,...seed].join('\n'));
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
    await assert.rejects(sql(`set role service_role; select set_config('request.jwt.claim.role','service_role',false);
      select public.gate_d_bind_checkout('${grantId}','${current[1]}','${stale[0]}',${current[2]},
        '${currentPrepared[1]}','cs_test_stalelease','${currentPrepared[2]}');`),/Stale or mismatched Gate D checkout binding/);
    assert.deepEqual((await sql(`select sequence from commerce_private.acceptance_grant_audit order by sequence`)).split('\n'),['1','2','3','4']);
  } finally {
    if(owned)await docker(['rm','--force',name]);
  }
});
