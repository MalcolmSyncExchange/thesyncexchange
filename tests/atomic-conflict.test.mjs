import test from 'node:test';import assert from 'node:assert/strict';
import {database,asActor,ids,source} from './helpers/artist-baseline-db.mjs';
const migration=source('supabase/migrations/20260924052925_nonretryable_artist_track_stale_conflict.sql');
const historical=source('supabase/migrations/20260915225349_atomic_artist_track_writes.sql');
const q=async(db,s)=>(await db.query(s)).rows;
const meta=async db=>(await q(db,"select p.oid,p.proowner,p.proacl,p.prosecdef,p.proconfig,p.proargtypes::text,p.prorettype,p.provolatile,p.proparallel,p.proisstrict,p.proleakproof,p.procost,p.prorows,p.prosrc from pg_proc p where oid='public.update_artist_track_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb)'::regprocedure"))[0];
const snapshot=async db=>JSON.stringify(await q(db,`select to_jsonb(t) track,(select jsonb_agg(r order by id) from rights_holders r where track_id=t.id) rights,(select jsonb_agg(o order by id) from track_license_options o where track_id=t.id) options,(select coalesce(jsonb_agg(a order by id),'[]') from track_audit_log a) audit from tracks t where id='${ids.draft}'`));
async function args(db){const t=(await q(db,`select * from tracks where id='${ids.draft}'`))[0];return [ids.a,ids.draft,t.updated_at,JSON.stringify({title:'Correct legitimate edit',status:'draft'}),JSON.stringify([{name:'Credit',email:'a@fixture.invalid',role_type:'owner',ownership_percent:100}]),JSON.stringify([{license_type_id:ids.license,price_cents:5000,active:true}])];}
const call=(db,a)=>db.query('select update_artist_track_atomic($1,$2,$3,$4,$5,$6)',a);
const fixture=fn=>async()=>{const db=await database();try{await fn(db)}finally{await db.close()}};
test('forward contract changes only SQLSTATE; signature owner ACL config OID and body preserved; idempotent',fixture(async db=>{
 await db.exec(historical);const before=await meta(db);await db.exec(migration);const after=await meta(db);
 assert.equal(after.prosrc,before.prosrc.replace("errcode='40001'","errcode='PT409'"));assert.deepEqual({...after,prosrc:null},{...before,prosrc:null});
 await db.exec(migration);assert.deepEqual(await meta(db),after);
}));
test('null and stale versions yield PT409 with no track/right/option/audit mutation',fixture(async db=>{
 const a=await args(db),before=await snapshot(db);
 for(const stale of [null,'1970-01-01T00:00:00Z'])await assert.rejects(call(db,[...a.slice(0,2),stale,...a.slice(3)]),e=>e.code==='PT409'&&e.message==='This track changed. Reload before saving.');
 assert.equal(await snapshot(db),before);
}));
test('foreign artist and nonartist still denied before stale contract; authenticated cannot execute',fixture(async db=>{
 const a=await args(db),before=await snapshot(db);
 for(const actor of [ids.b,ids.buyer,ids.admin])await assert.rejects(call(db,[actor,a[1],'1970-01-01T00:00:00Z',...a.slice(3)]),e=>e.code==='42501');
 await asActor(db,ids.a,()=>assert.rejects(call(db,a),e=>e.code==='42501'));assert.equal(await snapshot(db),before);
}));
test('legitimate current version still succeeds with same three audit events',fixture(async db=>{
 const oldIds=new Set((await q(db,'select id from track_audit_log')).map(x=>x.id));
 await call(db,await args(db));assert.equal((await q(db,`select title from tracks where id='${ids.draft}'`))[0].title,'Correct legitimate edit');
 assert.deepEqual((await q(db,'select id,action from track_audit_log order by action')).filter(x=>!oldIds.has(x.id)).map(x=>x.action),['rights_delete','rights_insert','track_updated']);
}));
test('audit failure still rolls back all atomic writes',fixture(async db=>{
 const a=await args(db),before=await snapshot(db);await db.exec("create function public.fail_audit_fixture() returns trigger language plpgsql as $$begin raise exception 'local fixture audit failure';end;$$;create trigger fail_audit_fixture before insert on track_audit_log for each row execute function public.fail_audit_fixture();");
 await assert.rejects(call(db,a),/local fixture audit failure/);assert.equal(await snapshot(db),before);
}));
test('unexpected body drift aborts migration without replacing the function',fixture(async db=>{
 const m=await meta(db);await db.exec("comment on function public.update_artist_track_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb) is 'local test';");
 const def=(await q(db,"select pg_get_functiondef('public.update_artist_track_atomic(uuid,uuid,timestamptz,jsonb,jsonb,jsonb)'::regprocedure) d"))[0].d;
 await db.exec(def.replace('Artist access required.','Different access message.'));await assert.rejects(db.exec(migration),/baseline mismatch/);await db.exec('rollback');assert.notEqual((await meta(db)).prosrc,m.prosrc);
}));
