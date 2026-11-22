// Production UI + synthetic loopback provider, genuine catalog RPC SQL and RLS.
import {startArtistFixture,anonKey,serviceKey} from './artist-onboarding-provider-fixture.mjs';
import {seedDatabase,ids} from './artist-baseline-db.mjs';
import {approved} from './rights-verification-fixture.mjs';
import {readyLicenses} from './catalog-management-fixture.mjs';
export {anonKey,serviceKey};
export async function startCatalogFixture({media}={}){let rights;
 let queueFailure, holdNextQueueRead, trackDecisionFailure;
 const queueDependencies=new Set(['tracks','rights_holders','admin_flags','review_notes','artist_profiles']);

 const f=await startArtistFixture({
  tables:['tracks','rights_holders','admin_flags','review_notes','track_audit_log'],
  async rest(req,res,ctx,{db,execute,json}){
   const table=ctx.url.pathname.slice('/rest/v1/'.length);
   if(req.method==='PATCH'&&table==='tracks'){
    if(trackDecisionFailure){
     const failure=trackDecisionFailure;trackDecisionFailure=undefined;
     if(failure==='no-row')json(res,null);
     else if(failure==='rights')json(res,{code:'42501',message:'Current verified rights review required'},403);
     else json(res,{code:'08006',message:'PRIVATE_DECISION_DIAGNOSTIC'},500);
     return true;
    }
    const id=ctx.url.searchParams.get('id')?.slice(3);
    const {status,approved_at,approved_by}=ctx.body;
    try {
     const result=await execute(ctx,()=>db.query(
      'update tracks set status=$1,approved_at=$2,approved_by=$3 where id=$4 returning slug',
      [status,approved_at,approved_by,id]));
     json(res,String(req.headers.accept||'').includes('object') ? result.rows[0]??null : result.rows);
    }catch(error){json(res,{code:error.code,message:error.message},error.code==='42501'?403:400);}
    return true;
   }
   if(req.method==='POST'&&table==='track_audit_log'){
    const {track_id,actor_id,action,metadata}=ctx.body;
    await execute(ctx,()=>db.query('insert into track_audit_log(track_id,actor_id,action,metadata) values($1,$2,$3,$4)',
     [track_id,actor_id,action,JSON.stringify(metadata)]));
    json(res,null,201);
    return true;
   }
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
      '[]'::jsonb track_license_options from tracks t where $1::uuid is null or t.id=$1`,[id??null])).rows);
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
  storage: media?.storage,
  async rpc(name,args,{db}){const allowed=new Set(['catalog_save','catalog_submit','catalog_review','catalog_transition','catalog_reopen','catalog_read','catalog_list','catalog_recover','catalog_history','catalog_search','catalog_available_licenses','rights_read']);if(!allowed.has(name))return media?.rpc(name,args,db);const definition=(await db.query("select proargnames from pg_proc where proname=$1 and pronamespace='public'::regnamespace",[name])).rows[0];const params=definition.proargnames.map(k=>args[k]??null);return {value:(await db.query('select public.'+name+'('+params.map((_,i)=>'$'+(i+1)).join(',')+') value',params)).rows[0].value};}
 });return {...f,track:ids.live,draftTrack:ids.draft,
  failNextTrackDecision:failure=>{trackDecisionFailure=failure;},
  setTrackQueueFailure:(table,status=503)=>{queueFailure=table?{table,status}:undefined;},
  pauseNextTrackQueueRead:()=>{
   let started=false,release;
   const released=new Promise(resolve=>{release=resolve;});
   holdNextQueueRead={markStarted:()=>{started=true;},released};
   return {get started(){return started;},release};
  },
  readyLicenses:()=>f.withDatabase(db=>readyLicenses(db,rights.rights)),revokeRights:()=>f.withDatabase(async db=>{const {admin,rev}=await import('./rights-verification-fixture.mjs');return admin(db,'rights_review',[ids.live,await rev(db),crypto.randomUUID(),rights.version,'revoked','Synthetic browser rights revocation.',{}]);})};
}
