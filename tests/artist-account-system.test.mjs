import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {database,asActor,ids,source} from './helpers/artist-baseline-db.mjs';
import {artistIdentitySchema,artistDeclarationsSchema,artistBuyerPreview,countryCodes} from '../lib/artist/account-contract.ts';
const notice=JSON.parse(source('lib/artist/onboarding-notice.json'));
const identity={legalName:'Private Legal Representative',entityType:'company',businessName:'Private Studio Ltd',country:'GB',contactEmail:'private-contact@fixture.invalid'};
const declarations={masterRights:'shared',publishingRights:'none',collaboratorStatus:'listed',collaborators:[{name:'Private Collaborator',role:'songwriter'}]};
const basic={fullName:'Account Display',artistName:'Public Stage'},profile={bio:'Public biography with useful artistic context.',location:'London',website:'https://fixture.invalid',instagram:'public_stage',spotify:'',youtube:''};
const fresh=async fn=>{const db=await database('repository',{seed:false});try{await db.exec(`insert into auth.users(id,email) values('${ids.a}','artist@fixture.invalid'),('${ids.b}','other@fixture.invalid'),('${ids.buyer}','buyer@fixture.invalid'),('${ids.admin}','admin@fixture.invalid');insert into user_profiles(id,email,role,full_name,onboarding_step) values('${ids.a}','artist@fixture.invalid','artist','Artist','basics'),('${ids.b}','other@fixture.invalid','artist','Other','basics'),('${ids.buyer}','buyer@fixture.invalid','buyer','Buyer','basics'),('${ids.admin}','admin@fixture.invalid','admin','Admin','complete');`);await fn(db);}finally{await db.close();}};
const row=async db=>(await db.query('select * from user_profiles where id=$1',[ids.a])).rows[0];
const snapshot=async db=>JSON.stringify((await db.query("select (select to_jsonb(u) from user_profiles u where id=$1) as profile,(select jsonb_agg(to_jsonb(a)) from artist_profiles a where user_id=$1) as artist,(select jsonb_agg(to_jsonb(d)) from artist_account_details d where user_id=$1) as details,(select jsonb_agg(to_jsonb(e)) from artist_account_events e where user_id=$1) as events",[ids.a])).rows);
const save=async(db,step,pub,priv={},opts={})=>db.query('select save_artist_account_step($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7,$8,$9)',[ids.a,opts.version??(await row(db)).updated_at,step,JSON.stringify(pub),JSON.stringify(priv),opts.avatar||null,Boolean(opts.remove),opts.noticeVersion||notice.version,opts.accept!==false]);
async function all(db){await save(db,'basics',basic,identity);await save(db,'profile',profile);await save(db,'licensing',{payoutEmail:'',defaultLicensingPreferences:'Private internal preference'},declarations);await save(db,'first-track',{firstTrackChoice:'later'});}
const finish=async db=>db.query('select complete_artist_onboarding_atomic($1,$2)',[ids.a,(await row(db)).updated_at]);
const editPublic={...basic,...profile,defaultLicensingPreferences:'Private internal preference'};
test('source-bound notice preserves exact document versions and never claims final Terms approval',()=>{
 for(const document of notice.documents){assert.equal(createHash('sha256').update(readFileSync(new URL('../app/(marketing)'+document.path+'/page.tsx',import.meta.url))).digest('hex'),document.sourceSha256);}
 assert.match(notice.text,/account-level declarations only/);assert.match(notice.text,/draft/);assert.equal(countryCodes.length,249);
});
test('private identity/declarations reject invalid country, incomplete companies, oversized and mismatched collaborators',()=>{
 assert.ok(artistIdentitySchema.safeParse(identity).success);for(const patch of [{country:'ZZ'},{legalName:'X'},{businessName:''},{contactEmail:'bad'}])assert.equal(artistIdentitySchema.safeParse({...identity,...patch}).success,false);
 assert.ok(artistDeclarationsSchema.safeParse(declarations).success);for(const patch of [{masterRights:'verified'},{collaboratorStatus:'solo'},{collaborators:Array(21).fill(declarations.collaborators[0])},{collaborators:[{name:'Private',role:'admin'}]}])assert.equal(artistDeclarationsSchema.safeParse({...declarations,...patch}).success,false);
});
test('complete lifecycle stores private preparation separately, requires consent and never approves catalog rights',()=>fresh(async db=>{
 await all(db);assert.equal((await row(db)).onboarding_completed_at,null);await finish(db);assert.ok((await row(db)).onboarding_completed_at);
 assert.equal((await db.query('select count(*)::int n from artist_profiles where user_id=$1',[ids.a])).rows[0].n,1);
 const data=(await row(db)).onboarding_payload;for(const key of ['legalName','businessName','country','contactEmail','collaborators','masterRights','publishingRights','payoutEmail'])assert.equal(key in data,false,key);
 const a=(await db.query('select notice_snapshot,accepted_at from artist_account_acceptances where user_id=$1',[ids.a])).rows[0];assert.deepEqual(a.notice_snapshot,notice);assert.ok(a.accepted_at);
 assert.equal((await db.query('select verification_status from artist_profiles where user_id=$1',[ids.a])).rows[0].verification_status,'unverified');assert.equal((await db.query('select count(*)::int n from tracks')).rows[0].n,0);
 await finish(db);assert.equal((await db.query('select count(*)::int n from artist_account_acceptances where user_id=$1',[ids.a])).rows[0].n,1);
}));
test('old completion RPC cannot bypass private identity, rights or current notice requirements',()=>fresh(async db=>{
 for(const [step,data]of [['basics',basic],['profile',profile],['licensing',{payoutEmail:''}],['first-track',{firstTrackChoice:'later'}]])await db.query('select save_artist_onboarding_atomic($1,$2,$3,$4::jsonb)',[ids.a,(await row(db)).updated_at,step,JSON.stringify(data)]);
 await assert.rejects(finish(db),e=>e.code==='22023');assert.equal((await row(db)).onboarding_completed_at,null);
}));
test('missing acceptance or stale notice rolls back public/private progress and audit together',()=>fresh(async db=>{
 await save(db,'basics',basic,identity);await save(db,'profile',profile);const before=await snapshot(db);
 await assert.rejects(save(db,'licensing',{payoutEmail:''},declarations,{accept:false}),e=>e.code==='22023');assert.equal(await snapshot(db),before);
 await assert.rejects(save(db,'licensing',{payoutEmail:''},declarations,{noticeVersion:'superseded'}),e=>e.code==='PT409');assert.equal(await snapshot(db),before);
}));
test('interrupted response retries cannot duplicate profiles; stale concurrent versions fail closed',()=>fresh(async db=>{
 const version=(await row(db)).updated_at;await save(db,'basics',basic,identity,{version});const before=await snapshot(db);
 const outcomes=await Promise.allSettled([save(db,'basics',{...basic,artistName:'Tab One'},identity,{version}),save(db,'basics',{...basic,artistName:'Tab Two'},identity,{version})]);assert.ok(outcomes.every(x=>x.status==='rejected'&&x.reason.code==='PT409'));assert.equal(await snapshot(db),before);
 assert.equal((await db.query('select count(*)::int n from artist_profiles where user_id=$1',[ids.a])).rows[0].n,1);
}));
test('database failure after presentation write cannot leave partial identity, progress or audit',()=>fresh(async db=>{
 await db.exec("create function public.fail_artist_account_fixture() returns trigger language plpgsql as $$begin raise exception 'synthetic account failure';end$$;create trigger fail_artist_account_fixture before insert on artist_account_details for each row execute function public.fail_artist_account_fixture();");const before=await snapshot(db);await assert.rejects(save(db,'basics',basic,identity),/synthetic account failure/);assert.equal(await snapshot(db),before);
}));
test('completed profile editing is atomic, preserves completion/verification/finance and clears optional links',()=>fresh(async db=>{
 await all(db);await finish(db);const old=(await row(db)).onboarding_completed_at;await db.exec(`update artist_profiles set verification_status='verified',payout_email='kept@fixture.invalid' where user_id='${ids.a}'`);
 await save(db,'edit',{...editPublic,artistName:'Edited Stage',website:'',instagram:'',spotify:'',youtube:''},{identity:{...identity,businessName:'Updated Private Ltd'},declarations});
 assert.equal(String((await row(db)).onboarding_completed_at),String(old));assert.equal((await row(db)).onboarding_step,'complete');const artist=(await db.query('select * from artist_profiles where user_id=$1',[ids.a])).rows[0];assert.equal(artist.artist_name,'Edited Stage');assert.equal(artist.website,null);assert.equal(artist.instagram_url,null);assert.equal(artist.payout_email,'kept@fixture.invalid');assert.equal(artist.verification_status,'verified');assert.equal((await row(db)).onboarding_payload.artistName,'Edited Stage');
}));
test('public direct edits advance the profile version and append audit, preventing stale editor overwrite',()=>fresh(async db=>{
 await all(db);await finish(db);const prior=(await row(db)).updated_at;
 await asActor(db,ids.a,()=>db.query('update artist_profiles set bio=$1 where user_id=$2',['A public biography changed through owned RLS.',ids.a]));assert.notEqual((await row(db)).updated_at.toISOString(),prior.toISOString());await assert.rejects(save(db,'edit',editPublic,{identity,declarations},{version:prior}),e=>e.code==='PT409');assert.ok((await db.query("select count(*)::int n from artist_account_events where user_id=$1 and action='presentation_saved'",[ids.a])).rows[0].n>0);
}));
test('RLS isolates all private rows; canonical Admin needs MFA; ordinary callers cannot mutate evidence or RPCs',()=>fresh(async db=>{
 await all(db);const rootVersion=(await row(db)).updated_at;for(const actor of [ids.b,ids.buyer])await asActor(db,actor,async()=>{for(const table of ['artist_account_details','artist_account_acceptances','artist_account_events'])assert.equal((await db.query('select * from '+table+' where user_id=$1',[ids.a])).rows.length,0);await assert.rejects(save(db,'basics',basic,identity,{version:rootVersion}),e=>e.code==='42501');});
 await asActor(db,ids.a,async()=>{assert.equal((await db.query('select * from artist_account_details')).rows.length,1);for(const sql of ["update artist_account_details set identity='{}'",'delete from artist_account_acceptances',"insert into artist_account_acceptances(user_id,notice_version,notice_snapshot) values('"+ids.a+"','forged','{}')"])await assert.rejects(db.exec(sql),e=>e.code==='42501');});
 await asActor(db,ids.admin,async()=>assert.equal((await db.query('select * from artist_account_details')).rows.length,0),'authenticated','','aal1');
 await asActor(db,ids.admin,async()=>assert.equal((await db.query('select * from artist_account_details')).rows.length,1));
 await asActor(db,null,()=>assert.rejects(db.exec('select * from artist_account_details'),e=>e.code==='42501'),'anon');
 for(const table of ['artist_account_events','artist_account_acceptances'])await assert.rejects(db.exec('delete from '+table),e=>e.code==='42501');
}));
test('foreign, absent, contradictory or removed image references cannot cross ownership boundaries',()=>fresh(async db=>{
 await all(db);await finish(db);const before=await snapshot(db);for(const avatar of [ids.b+'/profile/1234567890123-11111111-1111-4111-8111-111111111111.png',ids.a+'/profile/1234567890123-11111111-1111-4111-8111-111111111111.png'])await assert.rejects(save(db,'edit',editPublic,{identity,declarations},{avatar}),e=>e.code==='42501');assert.equal(await snapshot(db),before);
 const avatar=ids.a+'/profile/1234567890123-11111111-1111-4111-8111-111111111111.png';await db.query("insert into storage.objects(bucket_id,name) values('avatars',$1)",[avatar]);await save(db,'edit',editPublic,{identity,declarations},{avatar});assert.equal((await row(db)).avatar_path,avatar);await save(db,'edit',editPublic,{identity,declarations},{remove:true});assert.equal((await row(db)).avatar_path,null);
}));
test('Buyer Preview projection omits all private/finance/rights/verification fields and rejects unsafe links',()=>{
 const view=artistBuyerPreview({...identity,...declarations,...basic,artist_name:'Public Stage',...profile,payout_email:'payout@fixture.invalid',verification_status:'verified',default_licensing_preferences:'Private internal preference',website:'javascript:alert(1)',spotify_url:'https://name:secret@fixture.invalid',youtube_url:'https://www.youtube.com/@public',instagram_url:'public_stage'},null);
 const encoded=JSON.stringify(view);for(const secret of ['Private Legal','Private Studio','private-contact','Private Collaborator','payout@','verification_status','Private internal','secret'])assert.equal(encoded.includes(secret),false,secret);assert.equal(view.links.website,null);assert.equal(view.links.spotify,null);assert.equal(view.links.youtube,'https://www.youtube.com/@public');
});
test('migration replay preserves rows and immutable notice; helper/RPC grants remain narrow',()=>fresh(async db=>{
 await all(db);const before=await snapshot(db);await db.exec(source('supabase/migrations/20261024032018_system02_artist_account.sql'));assert.equal(await snapshot(db),before);const functions=(await db.query("select prosecdef,has_function_privilege('authenticated',oid,'EXECUTE') allowed from pg_proc where proname in ('save_artist_account_step','validate_artist_account','require_artist_account_ready')")).rows;assert.equal(functions.length,3);for(const f of functions){assert.equal(f.prosecdef,false);assert.equal(f.allowed,false);}
}));

test('Artist layout serializes only the display name into the client workspace shell',()=>{assert.match(source('app/(app)/artist/layout.tsx'),/ArtistWorkspaceShell user=\{\{ fullName: user.fullName \}\}/);assert.doesNotMatch(source('app/(app)/artist/layout.tsx'),/ArtistWorkspaceShell user=\{user\}/);});
test('a reused notice version with different content fails closed',()=>fresh(async db=>{
 const migration=source('supabase/migrations/20261024032018_system02_artist_account.sql');await assert.rejects(db.exec(migration.replaceAll('The current Terms of Use are marked as draft','Changed content at reused notice version')),e=>e.code==='22023');
}));

test('Buyer Preview performs a public-only read and starts a fresh document from the private editor',()=>{const route=source('app/(app)/artist/profile/preview/page.tsx');assert.doesNotMatch(route,/getArtistOnboardingState/);assert.match(route,/getArtistPublicPresentation/);assert.match(source('components/artist/profile/artist-profile-editor.tsx'),/<a className="underline" href="\/artist\/profile\/preview">/);});
