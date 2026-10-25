import test from 'node:test';
import assert from 'node:assert/strict';
import {database,source} from './helpers/artist-baseline-db.mjs';
const migration=source('supabase/migrations/20261025000001_production_upgrade_reconciliation.sql');
const signature='public.gate_d_prepare_checkout(uuid,uuid,bigint,text)';
test('production forward reconciliation is repeatable, preserves capability holds and narrows direct execute',async()=>{
  const db=await database('repository',{seed:false});try{
    const before=(await db.query('select row_to_json(c) value from commerce_private.capabilities c')).rows;
    await db.exec(migration);await db.exec(migration);
    assert.deepEqual((await db.query('select row_to_json(c) value from commerce_private.capabilities c')).rows,before);
    for(const name of ['get_own_artist_finance()','protect_staging_analytics_validation()'])
      assert.equal((await db.query(`select has_function_privilege('service_role','public.${name}','execute') allowed`)).rows[0].allowed,false);
    const body=(await db.query('select pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body;
    assert.doesNotMatch(body,/public\.digest\(/);assert.match(body,/extensions\.digest\(/);
  }finally{await db.close();}
});
test('unexpected production function drift fails before grant changes and leaves the body intact',async()=>{
  const db=await database('repository',{seed:false});try{
    await db.exec(`alter function ${signature} set search_path='public'; grant execute on function public.get_own_artist_finance() to service_role;`);
    const before=(await db.query('select pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body;
    await assert.rejects(db.exec(migration),/production_upgrade_function_drift/);await db.exec('rollback');
    assert.equal((await db.query('select pg_get_functiondef($1::regprocedure) body',[signature])).rows[0].body,before);
    assert.equal((await db.query("select has_function_privilege('service_role','public.get_own_artist_finance()','execute') allowed")).rows[0].allowed,true);
  }finally{await db.close();}
});
