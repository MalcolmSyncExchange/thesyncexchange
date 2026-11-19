import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {randomUUID} from 'node:crypto';
import {serialDraftFlush} from '../lib/media/draft-save-queue.mjs';
import {blankSubmissionDraft,submissionIssues,submissionDraftSchema} from '../lib/media/submission-draft.ts';
import {canonicalMood,genres,durationLabel,audioVersions,tempoSuggestion} from '../lib/media/discovery-options.ts';
import {estimatePulse,localTempo} from '../public/media/local-tempo.mjs';
import {uploadsFixture,create,artist,revision,readyPackage,asActor,invoke,ids} from './helpers/music-uploads-fixture.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('slow background saves never block edits; rapid requests coalesce and flush includes newer edits',async()=>{
 let version=0,persisted=0,value='',saved='',calls=0;const gate=deferred();
 const flush=serialDraftFlush(async()=>{if(version===persisted)return;const at=version,snapshot=value;calls++;if(calls===1)await gate.promise;saved=snapshot;persisted=at;});
 version++;value='first';const started=performance.now(),pending=flush();value='newest';version++;for(let i=0;i<30;i++)void flush();
 assert.equal(value,'newest');assert.equal(calls,1);assert.ok(performance.now()-started<100,'scheduling does not await a simulated network response');gate.resolve();await pending;
 assert.equal(saved,'newest');assert.equal(persisted,version);assert.equal(calls,2);await flush();assert.equal(calls,2);
});
test('network and stale-save failures retain local edits and require successful explicit recovery',async()=>{
 let local='retained',fail=true,committed='';const flush=serialDraftFlush(async()=>{if(fail)throw Object.assign(Error('STALE_REVISION'),{status:409});committed=local;});await assert.rejects(flush(),/STALE/);local='newer retained edit';assert.equal(committed,'');fail=false;await flush();assert.equal(committed,local);
});
test('precise field requirements keep optional subgenre/description and each rights gate separate',()=>{
 const d=blankSubmissionDraft();assert.ok(submissionIssues(d).some(x=>x.field==='vocal'&&x.message.includes('Song Type')));assert.ok(submissionIssues(d).some(x=>x.field==='releaseYear'));assert.ok(!submissionIssues(d).some(x=>['description','subgenre'].includes(x.field)));
 assert.equal(tempoSuggestion('125',true,null,120),null);assert.equal(tempoSuggestion('',true,null,120),null);assert.equal(tempoSuggestion('120',false,'120',140),'140');assert.equal(tempoSuggestion('125',false,null,120),null);
 assert.equal(submissionDraftSchema.parse({...d,explicit:'censored'}).explicit,'censored');assert.equal(canonicalMood(' CHILL '),'Relaxed');assert.equal(canonicalMood('euphoric'),'Euphoric');
 assert.ok(genres.some(g=>g.label==='Classical'));assert.ok(genres.some(g=>g.label==='Latin'));assert.ok(genres.some(g=>g.label==='Country'));assert.equal(new Set(genres.map(g=>g.id)).size,genres.length);
 assert.equal(durationLabel(172_600_000),'2:53');assert.equal(durationLabel(59_600_000),'1:00');assert.equal(audioVersions.filter(v=>v[0]==='alternate').length,5);
 const langs=JSON.parse(readFileSync(new URL('../lib/media/languages.json',import.meta.url)));assert.ok(langs.length>480);assert.ok(langs.some(l=>l.id==='en'));assert.ok(langs.some(l=>l.id==='zxx'));assert.equal(new Set(langs.map(l=>l.id)).size,langs.length);
});
test('tempo estimation reports ambiguity and refuses silence, flat sustained tones and short audio',()=>{
 for(const bpm of [90,120,150]){const e=Array.from({length:2000},(_,i)=>i%Math.round(6000/bpm)<3?1:0);const r=estimatePulse(e);assert.ok(Math.abs(r.bpm-bpm)<=3,JSON.stringify(r));assert.ok(Array.isArray(r.alternatives));}
 for(const e of [Array(2000).fill(0),Array(2000).fill(1),Array(200).fill(1)])assert.equal(estimatePulse(e).bpm,undefined);
});
function virtualWav(size){const rate=44100,align=6,bytes=Math.floor((size-44)/align)*align,header=new Uint8Array(44),v=new DataView(header.buffer);const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};str(0,'RIFF');v.setUint32(4,bytes+36,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,rate,true);v.setUint32(28,rate*align,true);v.setUint16(32,align,true);v.setUint16(34,24,true);str(36,'data');v.setUint32(40,bytes,true);return {size:bytes+44,slice(at,end){return {async arrayBuffer(){const n=end-at;if(at<44)return header.slice(at,end).buffer;const out=new Uint8Array(n);for(let i=0;i<n;i+=3){const frame=Math.floor((at-44+i)/align),pulse=(frame/rate)%.5<.06,amplitude=pulse?Math.floor(Math.sin(frame*.2)*6000000):0;out[i]=amplitude&255;out[i+1]=(amplitude>>8)&255;out[i+2]=(amplitude>>16)&255;}return out.buffer;}};}};}
test('45/100/150 MB PCM fixtures retain bounded read and CPU cost without whole-file decoding',async()=>{for(const size of [45_500_000,100_000_000,150_000_000]){const r=await localTempo(virtualWav(size));assert.ok(r.readBytes<=8388620);assert.ok(r.elapsedMs<2500);assert.ok(Math.abs(r.bpm-120)<=2);console.log('BPM benchmark',size,JSON.stringify(r));}});
const fresh=async fn=>{const db=await uploadsFixture();try{await fn(db);}finally{await db.close();}};
const complete=()=>({...blankSubmissionDraft(),title:'TSE SYNTHETIC QA ONLY',primaryArtist:'TSE QA',genre:'Classical',bpm:'120',key:'unknown',moods:'Calm',moodSuggestions:['Starlit'],language:'zxx',explicit:'censored',vocal:'instrumental',releaseYear:'2026',masterOwners:[{name:'Synthetic QA owner',percentage:'100'}],publishingOwners:[{name:'Synthetic QA owner',percentage:'100'}],authority:{...blankSubmissionDraft().authority,mode:'owners'},rightsDeclared:true,licenseCategories:['digital'],permittedUses:'Synthetic QA only',territories:'Worldwide'});
test('optional metadata, censored classification and private suggestions round-trip through SEC submission',()=>fresh(async db=>{
 await db.exec('alter table tracks add constraint live_audio_flag_compat check(not(instrumental and vocals))');const s=await create(db),d={...complete(),vocal:'mixed'};await artist(db,'media_submission_save_draft',[s,d,0,randomUUID()]);await readyPackage(db,s);const prepared=await artist(db,'media_submission_prepare',[s,await revision(db,s),randomUUID()]);const catalog=await artist(db,'catalog_read',[prepared.track_id,false]);assert.equal(catalog.draft.subgenre,'');assert.equal(catalog.draft.description,'');assert.equal(catalog.draft.explicit,'censored');assert.equal(catalog.draft.vocal,'mixed');assert.deepEqual((await db.query('select instrumental,vocals from tracks where id=$1',[prepared.track_id])).rows[0],{instrumental:false,vocals:true});assert.deepEqual(catalog.draft.moods,['Calm']);assert.equal(JSON.stringify(catalog.draft).includes('Starlit'),false);
 const submitted=await artist(db,'media_upload_submit',[s,await revision(db,s),randomUUID()]);assert.ok(submitted.review_id);assert.equal((await artist(db,'media_upload_read',[s])).review.state,'pending');assert.equal((await db.query('select status from tracks where id=$1',[prepared.track_id])).rows[0].status,'pending_review');assert.equal((await db.query('select count(*)::int n from generated_licenses')).rows[0].n,0);
 const notices=await artist(db,'media_account_notices');assert.ok(notices.some(n=>n.submission===s&&n.kind==='master_review_requested'));await asActor(db,ids.b,async()=>assert.equal((await invoke(db,'media_account_notices')).some(n=>n.submission===s),false));for(const role of ['anon','service_role'])await asActor(db,null,()=>assert.rejects(invoke(db,'media_account_notices'),e=>e.code==='42501'),role);
 const before=(await db.query("select pg_get_functiondef('public.media_submission_save_draft(uuid,jsonb,bigint,uuid)'::regprocedure) f")).rows[0].f;await db.exec(readFileSync(new URL('../supabase/migrations/20261119193818_submission_workflow_repair.sql',import.meta.url),'utf8'));assert.equal((await db.query("select pg_get_functiondef('public.media_submission_save_draft(uuid,jsonb,bigint,uuid)'::regprocedure) f")).rows[0].f,before);
}));
test('rights incomplete or unaccepted audio still cannot enter SEC through the convenience path',()=>fresh(async db=>{const s=await create(db),d={...complete(),publishingOwners:[]};await artist(db,'media_submission_save_draft',[s,d,0,randomUUID()]);await readyPackage(db,s);await assert.rejects(artist(db,'media_submission_prepare',[s,await revision(db,s),randomUUID()]));assert.equal((await artist(db,'media_upload_read',[s])).track_id,null);}));

test('compatibility migration preserves old routine owners, ACLs, role gates, rows and historical accounting',async()=>{
 const db=await uploadsFixture({throughMigration:'20261119064613_continuous_audio_health.sql'});try{
 const snapshot=async()=>({functions:(await db.query("select oid::regprocedure::text identity,proowner,proacl,prosecdef,proconfig from pg_proc where oid in ('public.media_submission_save_draft(uuid,jsonb,bigint,uuid)'::regprocedure,'public.media_upload_save_metadata(uuid,jsonb,bigint,uuid)'::regprocedure,'catalog_private.validate(jsonb,boolean)'::regprocedure) order by oid::regprocedure::text")).rows,rows:(await db.query('select (select count(*) from tracks)::int tracks,(select count(*) from submission_media.do_runs)::int reservations,(select count(*) from submission_media.events)::int events')).rows});
 const before=await snapshot();await db.exec(readFileSync(new URL('../supabase/migrations/20261119193818_submission_workflow_repair.sql',import.meta.url),'utf8'));assert.deepEqual(await snapshot(),before);
 const s=await create(db);await assert.rejects(artist(db,'media_submission_save_draft',[s,{...complete(),moodSuggestions:['Calm',' calm ']},0,randomUUID()]),e=>e.code==='22023');
 }finally{await db.close();}
});

test('upload-first navigation groups every retained field into the correct four-step destination',()=>{
 const ui=readFileSync(new URL('../components/artist/uploads/submission-workspace.tsx',import.meta.url),'utf8');
 assert.match(ui,/const sections=\['Upload Music','Track Details','Rights & Ownership','Review & Submit'\]/);
 assert.match(ui,/\[active,setActive\]=useState\(0\)/);
 assert.match(ui,/setVisualFile\(file\);setActive\(0\);await flush\(\);setFirstFile\(file\)/);
 assert.match(ui,/active===0\|\|active===3\?'':'hidden'/,'workbench remains mounted during background analysis and transfer');
 assert.match(ui,/if\(!dirty\|\|loading\|\|conflict\|\|recovery\)return/,'draft autosave does not wait for file transfer');
 const issues=submissionIssues({...blankSubmissionDraft(),contributors:[{name:'',role:'writer'}]});
 assert.equal(issues.find(x=>x.field==='title').step,1);assert.equal(issues.find(x=>x.field==='contributors').step,1);assert.equal(issues.find(x=>x.field==='rightsDeclared').step,2);assert.equal(issues.find(x=>x.field==='licenseCategories').step,2);
 assert.ok(!issues.some(x=>x.field==='bpm'),'unavailable BPM estimate is not a submission blocker');
 for(const bpm of ['0','221','NaN','1.2'])assert.ok(submissionIssues({...complete(),bpm}).some(x=>x.field==='bpm'));
});

test('audio mood suggestions require measured evidence and never invent tonal or emotional certainty',async()=>{
 const {suggestAudioMoods}=await import('../public/media/local-tempo.mjs');
 assert.deepEqual(suggestAudioMoods(Array(2000).fill(0),{bpm:130,confidence:.9}),[]);
 assert.deepEqual(suggestAudioMoods(Array(2000).fill(NaN),{bpm:130,confidence:.9}),[]);
 assert.deepEqual(suggestAudioMoods(Array(2000).fill(.2),{bpm:130,confidence:.9}),['Driving','Energetic']);
 assert.deepEqual(suggestAudioMoods(Array(2000).fill(.03),{bpm:80,confidence:.9}),['Calm']);
 assert.deepEqual(suggestAudioMoods(Array(2000).fill(.2),{}),[]);
 const r=await localTempo(virtualWav(45_500_000));assert.equal(r.sampleRate,44100);assert.equal(r.channels,2);assert.equal(r.bits,24);assert.ok(Math.abs(r.durationUs/1e6-(45_500_000-44)/6/44100)<.001);assert.ok(r.moods.every(m=>['Calm','Dramatic','Driving','Energetic'].includes(m)));
 assert.equal(tempoSuggestion('',true,'120',140),null,'manual clearing is preserved');assert.equal(tempoSuggestion('130',true,'120',140),null,'manual correction is preserved');
});

test('unknown BPM reaches pending SEC review without publication; invalid non-null tempo still fails',()=>fresh(async db=>{
 const s=await create(db),d={...complete(),bpm:''};await artist(db,'media_submission_save_draft',[s,d,0,randomUUID()]);await readyPackage(db,s);
 const target="'public.media_upload_save_metadata(uuid,jsonb,bigint,uuid)'::regprocedure,'public.media_submission_prepare(uuid,bigint,uuid)'::regprocedure";
 const before=(await db.query(`select oid::regprocedure::text identity,proowner,proacl,prosecdef,proconfig from pg_proc where oid in (${target}) order by 1`)).rows;
 const migration=readFileSync(new URL('../supabase/migrations/20261119222415_upload_first_optional_tempo.sql',import.meta.url),'utf8');await db.exec(migration);await db.exec(migration);
 assert.deepEqual((await db.query(`select oid::regprocedure::text identity,proowner,proacl,prosecdef,proconfig from pg_proc where oid in (${target}) order by 1`)).rows,before);
 const p=await artist(db,'media_submission_prepare',[s,await revision(db,s),randomUUID()]);assert.equal((await db.query('select bpm from tracks where id=$1',[p.track_id])).rows[0].bpm,null);
 const state=await artist(db,'media_upload_read',[s]);for(const bpm of ['120',0,221,120.5,{},true])await assert.rejects(artist(db,'media_upload_save_metadata',[s,{...state.metadata,bpm},await revision(db,s),randomUUID()]),e=>e.code==='22023');
 await artist(db,'media_upload_submit',[s,await revision(db,s),randomUUID()]);assert.equal((await artist(db,'media_upload_read',[s])).review.state,'pending');assert.equal((await db.query('select status from tracks where id=$1',[p.track_id])).rows[0].status,'pending_review');
}));
