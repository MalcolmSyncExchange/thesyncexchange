// Synthetic transport only, with actual rights migration SQL, canonical actor and RLS.
import {randomUUID} from 'node:crypto';
import {startArtistFixture,anonKey,serviceKey} from './artist-onboarding-provider-fixture.mjs';
export {anonKey,serviceKey};
export async function startRightsFixture(){const objects=new Map();let failUpload=false;const track=randomUUID();
 const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
 const base=await startArtistFixture({
  async initialize({db,auth}){await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false)");await db.query("update user_profiles set onboarding_step='complete',onboarding_completed_at=clock_timestamp() where id=$1",[auth.artist.id]);await db.query('insert into artist_profiles(user_id,artist_name,bio) values($1,$2,$3)',[auth.artist.id,'Synthetic Rights Artist','A synthetic rights account for isolated browser qualification.']);await db.query("insert into tracks(id,artist_user_id,title,slug,genre,subgenre,bpm,musical_key,duration_seconds,release_year,status) values($1,$2,'Synthetic Rights Recording','synthetic-rights','Electronic','Ambient',100,'C',120,2026,'draft')",[track,auth.artist.id]);},
  async rpc(name,args,{db}){const allowed=new Set(['rights_save','rights_submit','rights_review','rights_document_reserve','rights_document_access','rights_document_server','rights_document_restrict','rights_read','rights_list','rights_recover','rights_history','rights_document_withdraw']);if(!allowed.has(name))return null;const definition=(await db.query("select proargnames from pg_proc where proname=$1 and pronamespace='public'::regnamespace",[name])).rows[0];const params=definition.proargnames.map(k=>args[k]??null);return {value:(await db.query('select public.'+name+'('+params.map((_,i)=>'$'+(i+1)).join(',')+') value',params)).rows[0].value};},
  async storage(req,res,ctx,{db}){const prefix='/storage/v1/object/';if(!ctx.url.pathname.startsWith(prefix))return false;const key=decodeURIComponent(ctx.url.pathname.slice(prefix.length).replace(/^authenticated\//,''));if(!key.startsWith('rights-evidence/'))return false;
   if(!ctx.service){json(res,{error:'denied'},403);return true;}
   if(req.method==='GET'){const value=objects.get(key);if(!value){json(res,{error:'missing'},404);return true;}res.writeHead(200,{'content-type':value.type,'content-length':value.bytes.length,'cache-control':'no-store'});res.end(value.bytes);return true;}
   if(req.method!=='POST'||req.headers['x-upsert']==='true'||objects.has(key)){json(res,{error:'immutable'},409);return true;}
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4_000_000)throw Error('Fixture upload bound');chunks.push(chunk);}let bytes=Buffer.concat(chunks),type=String(req.headers['content-type']||'');
   if(type.startsWith('multipart/form-data')){const form=await new Request('http://127.0.0.1/synthetic',{method:'POST',headers:{'content-type':type},body:bytes}).formData();const file=[...form.values()].find(v=>v instanceof File);bytes=Buffer.from(await file.arrayBuffer());type=file.type;}
   const id=randomUUID(),version=randomUUID();await db.query('insert into storage.objects(id,bucket_id,name,version,metadata) values($1,$2,$3,$4,$5::jsonb)',[id,'rights-evidence',key.slice('rights-evidence/'.length),version,JSON.stringify({size:bytes.length,mimetype:type})]);objects.set(key,{bytes,type});if(failUpload){failUpload=false;json(res,{error:'synthetic lost response'},503);}else json(res,{Id:id,Key:key});return true;
  }
 });return {...base,track,objects,failNextUpload:()=>failUpload=true};
}
