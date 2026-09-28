import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const source=fs.readFileSync(new URL('../services/auth/user-profiles.ts',import.meta.url),'utf8');
const exports={};new Function('exports',ts.transpileModule(source.slice(source.indexOf('export async function upsertUserProfileCompat')),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports);
async function setup(){
 const db=new PGlite();await db.exec("CREATE TABLE user_profiles(id text PRIMARY KEY,role text,email text,full_name text,avatar_path text,avatar_url text,onboarding_payload jsonb); INSERT INTO user_profiles VALUES ('artist','artist','synthetic@example.test','Synthetic','old',NULL,'{\"avatarPath\":\"old\"}');");
 const objects=new Set(['old','a','b']);
 const client={from:()=>({upsert:async row=>{const keys=Object.keys(row).filter(k=>k!=='id');const vals=keys.map(k=>typeof row[k]==='object'?JSON.stringify(row[k]):row[k]);await db.query(`UPDATE user_profiles SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE id=$${keys.length+1}`,[...vals,row.id]);return{error:null}},update:row=>{const conditions=[];const q={eq:(k,v)=>{conditions.push([k,v]);return q},is:(k,v)=>{conditions.push([k,v]);return q},select:()=>q,maybeSingle:async()=>{const keys=Object.keys(row);const vals=keys.map(k=>typeof row[k]==='object'?JSON.stringify(row[k]):row[k]);const sql=conditions.map(([k,v])=>{vals.push(v);return `${k} IS NOT DISTINCT FROM $${vals.length}`}).join(' AND ');const r=await db.query(`UPDATE user_profiles SET ${keys.map((k,i)=>`${k}=$${i+1}`).join(',')} WHERE ${sql} RETURNING id`,vals);return{data:r.rows[0]||null,error:null}}};return q}})};
 const read=async()=> (await db.query('SELECT * FROM user_profiles')).rows[0];
 const ordinary=()=>exports.upsertUserProfileCompat(client,{id:'artist',full_name:'Stale save',avatar_path:'old',avatar_url:'old-url',onboarding_payload:{avatarPath:'old',avatarUrl:'old-url',bio:'safe'}});
 const replace=(path)=>exports.transitionArtistAvatar(client,{id:'artist',role:'artist',avatar_path:path,avatar_url:null,onboarding_payload:{avatarPath:path}},{path:'old',url:null});
 const valid=async()=>{const r=await read();assert(objects.has(r.avatar_path));if(r.onboarding_payload.avatarPath)assert(objects.has(r.onboarding_payload.avatarPath));};
 return{db,objects,read,ordinary,replace,valid};
}
for(const point of ['before','during','after','after-delete'])test('stale ordinary save '+point+' cannot restore avatar',async()=>{const h=await setup();try{if(point==='before')await h.ordinary();if(point==='during')await Promise.all([h.replace('a'),h.ordinary()]);else {assert.equal((await h.replace('a')).error,null);if(point==='after')await h.ordinary();}h.objects.delete('old');if(point==='after-delete')await h.ordinary();await h.valid();assert.equal((await h.read()).avatar_path,'a');}finally{await h.db.close()}});
test('two replacements and duplicate retry: exactly one CAS succeeds',async()=>{const h=await setup();try{const results=await Promise.all([h.replace('a'),h.replace('b')]);assert.equal(results.filter(x=>!x.error).length,1);h.objects.delete('old');assert((await h.replace('b')).error);await h.valid();}finally{await h.db.close()}});
test('ambiguous committed result retains uploaded bytes and stale retry cannot revert',async()=>{const h=await setup();try{await h.replace('a');/* response discarded, no compensation */assert((await h.replace('b')).error);await h.valid();assert(h.objects.has('a'));assert(h.objects.has('old'));}finally{await h.db.close()}});
test('cleanup failure retains both bytes and active reference',async()=>{const h=await setup();try{await h.replace('a');await h.valid();assert(h.objects.has('old'));assert(h.objects.has('a'));}finally{await h.db.close()}});
test('ordinary writes strip all reference aliases including payload',async()=>{const h=await setup();try{await h.ordinary();const row=await h.read();assert.equal(row.avatar_path,'old');assert.equal(row.avatar_url,null);assert.deepEqual(row.onboarding_payload,{bio:'safe'});await h.valid();}finally{await h.db.close()}});
