// Deliberately separate from baseline characterization. These are required security outcomes,
// not accepted exceptions. This command is expected to fail until remediation is approved.
import test from 'node:test';
import assert from 'node:assert/strict';
import {database,asActor,ids,source} from './helpers/artist-baseline-db.mjs';
async function inDatabase(fn){const db=await database();try{await fn(db);}finally{await db.close();}}
test('RELEASE GATE: general profile writer cannot self-verify',()=>inDatabase(db=>asActor(db,ids.a,async()=>{
 await assert.rejects(db.exec("update artist_profiles set verification_status='verified'"));
})));
test('RELEASE GATE: reviewed rights cannot be changed by a general artist writer',()=>inDatabase(db=>asActor(db,ids.a,async()=>{
 await assert.rejects(db.exec(`update rights_holders set ownership_percent=50 where track_id='${ids.live}'`));
})));
test('RELEASE GATE: buyer cannot retrieve full-audio storage path',()=>inDatabase(db=>asActor(db,ids.buyer,async()=>{
 let rows;try{rows=(await db.query(`select audio_file_path from tracks where id='${ids.live}'`)).rows;}catch(e){assert.match(e.message,/permission/);return;}
 assert.ok(rows.every(r=>!r.audio_file_path),'Full-audio path is exposed');
})));
test('RELEASE GATE: general profile grant does not include finance contact',()=>inDatabase(db=>asActor(db,ids.a,async()=>{
 let rows;try{rows=(await db.query('select payout_email from artist_profiles')).rows;}catch(e){assert.match(e.message,/permission/);return;}
 assert.ok(rows.every(r=>!r.payout_email),'Profile and finance permissions remain coupled');
})));
test('RELEASE GATE: admin action authorizes before privileged resource access',()=>{
 const s=source('services/admin/actions.ts').split('export async function updateTrackStatusAction')[1].split('export async function')[0];
 assert.ok(s.indexOf('await requireAdminActorId()')<s.indexOf('await createPrivilegedSupabaseClient()'),'Admin authorization still occurs after privileged context read');
});
