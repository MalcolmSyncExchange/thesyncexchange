// Production UI + synthetic loopback provider, genuine catalog RPC SQL and RLS.
import {startArtistFixture,anonKey,serviceKey} from './artist-onboarding-provider-fixture.mjs';
import {seedDatabase,ids} from './artist-baseline-db.mjs';
import {approved} from './rights-verification-fixture.mjs';
import {readyLicenses} from './catalog-management-fixture.mjs';
export {anonKey,serviceKey};
export async function startCatalogFixture(){let rights;
 let queueFailure, holdNextQueueRead;
 const queueDependencies=new Set(['tracks','rights_holders','admin_flags','review_notes','artist_profiles']);

 const f=await startArtistFixture({
  tables:['tracks','rights_holders','admin_flags','review_notes','track_audit_log'],
  async rest(req,res,ctx,{db,execute,json}){
   const table=ctx.url.pathname.slice('/rest/v1/'.length);
   const pendingTracks=table==='tracks'&&ctx.url.searchParams.get('status')==='eq.pending_review'&&
    ctx.url.searchParams.get('select')?.includes('cover_art_path');
   if(req.method==='GET'&&ctx.service&&queueDependencies.has(table)&&(table!=='tracks'||pendingTracks)){
    if(pendingTracks&&holdNextQueueRead){
     const gate=holdNextQueueRead;holdNextQueueRead=undefined;
     gate.markStarted();
     await gate.released;
    }
    if(queueFailure?.table===table){
     json(res,{code:'SYNTHETIC_OUTAGE',message:'PRIVATE_QUEUE_DIAGNOSTIC'},queueFailure.status);
     return true;
    }
   }
   if(req.method!=='GET'||ctx.url.pathname!=='/rest/v1/tracks'||!/rights_holders\s*\(/.test(ctx.url.searchParams.get('select') || ''))return false;
   const id=ctx.url.searchParams.get('id')?.slice(3);
   const detail=await execute(ctx,async()=> (await db.query(`
    select t.*, coalesce((select jsonb_agg(r) from rights_holders r where r.track_id=t.id), '[]') rights_holders,
      '[]'::jsonb track_license_options from tracks t where t.id=$1`,[id])).rows);
   json(res, String(req.headers.accept||'').includes('object') ? detail[0] ?? null : detail);
   return true;
  },
  async initialize({db,auth}){
   // Remap only disposable Auth fixtures to the existing deterministic SQL ids.
   await db.exec("update user_profiles set email='initial-'||id::text||'@fixture.invalid';update auth.users set email='initial-'||id::text||'@fixture.invalid'");
   await seedDatabase(db);await db.query("update tracks set status='pending_review', title='Synthetic pending track' where id=$1",[ids.draft]);await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false)");
   for(const [key,actor]of [['a',auth.artist],['buyer',auth.buyer],['admin',auth.admin]]){const old=actor.id,p=auth.profiles.get(old);auth.profiles.delete(old);actor.id=ids[key];auth.profiles.set(actor.id,{...p,id:actor.id,onboarding_step:'complete',onboarding_completed_at:new Date().toISOString()});await db.query("update user_profiles set onboarding_step='complete',onboarding_completed_at=clock_timestamp() where id=$1",[actor.id]);}
   rights=await approved(db);
  },
  async rpc(name,args,{db}){const allowed=new Set(['catalog_save','catalog_submit','catalog_review','catalog_transition','catalog_reopen','catalog_read','catalog_list','catalog_recover','catalog_history','catalog_search','catalog_available_licenses']);if(!allowed.has(name))return null;const definition=(await db.query("select proargnames from pg_proc where proname=$1 and pronamespace='public'::regnamespace",[name])).rows[0];const params=definition.proargnames.map(k=>args[k]??null);return {value:(await db.query('select public.'+name+'('+params.map((_,i)=>'$'+(i+1)).join(',')+') value',params)).rows[0].value};}
 });return {...f,track:ids.live,draftTrack:ids.draft,
  setTrackQueueFailure:(table,status=503)=>{queueFailure=table?{table,status}:undefined;},
  pauseNextTrackQueueRead:()=>{
   let started=false,release;
   const released=new Promise(resolve=>{release=resolve;});
   holdNextQueueRead={markStarted:()=>{started=true;},released};
   return {get started(){return started;},release};
  },
  readyLicenses:()=>f.withDatabase(db=>readyLicenses(db,rights.rights)),revokeRights:()=>f.withDatabase(async db=>{const {admin,rev}=await import('./rights-verification-fixture.mjs');return admin(db,'rights_review',[ids.live,await rev(db),crypto.randomUUID(),rights.version,'revoked','Synthetic browser rights revocation.',{}]);})};
}
