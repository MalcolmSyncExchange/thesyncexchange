// Production UI + synthetic loopback provider, genuine catalog RPC SQL and RLS.
import {startArtistFixture,anonKey,serviceKey} from './artist-onboarding-provider-fixture.mjs';
import {seedDatabase,ids} from './artist-baseline-db.mjs';
import {approved} from './rights-verification-fixture.mjs';
import {readyLicenses} from './catalog-management-fixture.mjs';
export {anonKey,serviceKey};
export async function startCatalogFixture(){let rights;
 const f=await startArtistFixture({
  async initialize({db,auth}){
   // Remap only disposable Auth fixtures to the existing deterministic SQL ids.
   await db.exec("update user_profiles set email='initial-'||id::text||'@fixture.invalid';update auth.users set email='initial-'||id::text||'@fixture.invalid'");
   await seedDatabase(db);await db.exec("insert into storage.buckets(id,name,public) values('rights-evidence','rights-evidence',false)");
   for(const [key,actor]of [['a',auth.artist],['buyer',auth.buyer],['admin',auth.admin]]){const old=actor.id,p=auth.profiles.get(old);auth.profiles.delete(old);actor.id=ids[key];auth.profiles.set(actor.id,{...p,id:actor.id,onboarding_step:'complete',onboarding_completed_at:new Date().toISOString()});await db.query("update user_profiles set onboarding_step='complete',onboarding_completed_at=clock_timestamp() where id=$1",[actor.id]);}
   rights=await approved(db);
  },
  async rpc(name,args,{db}){const allowed=new Set(['catalog_save','catalog_submit','catalog_review','catalog_transition','catalog_reopen','catalog_read','catalog_list','catalog_recover','catalog_history','catalog_search','catalog_available_licenses']);if(!allowed.has(name))return null;const definition=(await db.query("select proargnames from pg_proc where proname=$1 and pronamespace='public'::regnamespace",[name])).rows[0];const params=definition.proargnames.map(k=>args[k]??null);return {value:(await db.query('select public.'+name+'('+params.map((_,i)=>'$'+(i+1)).join(',')+') value',params)).rows[0].value};}
 });return {...f,track:ids.live,readyLicenses:()=>f.withDatabase(db=>readyLicenses(db,rights.rights)),revokeRights:()=>f.withDatabase(async db=>{const {admin,rev}=await import('./rights-verification-fixture.mjs');return admin(db,'rights_review',[ids.live,await rev(db),crypto.randomUUID(),rights.version,'revoked','Synthetic browser rights revocation.',{}]);})};
}
