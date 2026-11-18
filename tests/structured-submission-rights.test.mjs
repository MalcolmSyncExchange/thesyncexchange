import test from 'node:test';import assert from 'node:assert/strict';import{randomUUID}from'node:crypto';
import{blankSubmissionDraft,submissionDraftSchema}from'../lib/media/submission-draft.ts';
import{blankAuthority,blankSample,blankClaim,blankAgreement,structuredRightsMissing}from'../lib/media/submission-rights.ts';
import{uploadsFixture,create,artist,invoke,asActor,ids,quote}from'./helpers/music-uploads-fixture.mjs';
import {productionRightsFixture} from './helpers/production-rights-fixture.mjs';
const fresh=async fn=>{const db=await productionRightsFixture();try{await db.exec("insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('rights-evidence','rights-evidence',false,3000000,array['application/pdf'])");await fn(db);}finally{await db.close();}};
const complete=()=>({...blankSubmissionDraft(),masterOwners:[{name:'Master A',percentage:'60'},{name:'Master B',percentage:'40'}],publishingOwners:[{name:'Self-published Writer A',percentage:'60'},{name:'Publisher B',percentage:'40'}],authority:{...blankAuthority(),mode:'owners'},rightsDeclared:true});
const validate=(db,s,d,full=true)=>db.query('select submission_media.validate_workspace_rights($1,$2,$3)',[s,d,full]);
const reserve=(db,s,kind='agreement',key=randomUUID())=>artist(db,'media_workspace_document_reserve',[s,kind,'Synthetic Agreement.pdf',100,key]);
async function receive(db,s,id,kind='agreement'){
 await db.query("insert into storage.objects(bucket_id,name,version,metadata) values('rights-evidence',$1,'object-v1',jsonb_build_object('size',100,'mimetype','application/pdf'))",[ids.a+'/'+s+'/'+id+'/original']);
 return asActor(db,null,()=>invoke(db,'media_workspace_document_received',[ids.a,id,'a'.repeat(64)]),'service_role');
}
test('composition/publishing ownership totals are exact, separate from master and not inferred from legacy notes',()=>{
 const d=complete();assert.deepEqual(structuredRightsMissing(d),[]);
 for(const pool of ['publishingOwners']){for(const rows of [[],[{name:'A',percentage:'99.99'}],[{name:'A',percentage:'60'},{name:'B',percentage:'50'}],[{name:'',percentage:'100'}]])assert.ok(structuredRightsMissing({...d,[pool]:rows}).some(x=>x.toLowerCase().includes(pool==='compositionOwners'?'composition':'publishing')));}
 const{publishingOwners,authority,hasSamples,samples,hasClaims,claims,hasAgreements,agreements,...legacy}=d;const loaded=submissionDraftSchema.parse({...legacy,publishingOwnership:'Original publisher notes'});assert.equal(loaded.publishingOwnership,'Original publisher notes');assert.equal(loaded.authority.mode,'unknown');assert.ok(structuredRightsMissing(loaded).length>=2);
});
test('smart disclosures keep draft input but reject hidden rows, invalid regions and unsupported claims',()=>{
 const d=complete();assert.ok(submissionDraftSchema.safeParse({...d,hasSamples:true,samples:[blankSample()]}).success);assert.ok(structuredRightsMissing({...d,samples:[blankSample()]}).includes('Complete sample details, locations and clearance status'));
 const sample={...blankSample(),title:'Original',artist:'Synthetic',use:'recording',masterOwner:'Owner',publisher:'Publisher',sourceStart:'0',sourceEnd:'2.5',trackStart:'10',trackEnd:'12.5',description:'Short synthetic quote',clearance:'pending'};
 assert.deepEqual(structuredRightsMissing({...d,hasSamples:true,samples:[sample]}),[]);
 assert.ok(structuredRightsMissing({...d,hasSamples:true,samples:[{...sample,trackEnd:'1e2'}]}).length);
 assert.ok(structuredRightsMissing({...d,hasSamples:true,samples:[{...sample,clearance:'claimed_cleared'}]}).length);
 assert.ok(structuredRightsMissing({...d,hasClaims:true,claims:[blankClaim()]}).length);
 assert.ok(structuredRightsMissing({...d,hasAgreements:true,agreements:[blankAgreement()]}).length);
 for(const bad of [{...d,authority:{...d.authority,approved:true}},{...d,samples:Array(11).fill(blankSample())},{...d,claims:[{...blankClaim(),details:'bad\u0001'}]}])assert.equal(submissionDraftSchema.safeParse(bad).success,false);
});
test('representative authority requires identified parties, bounded scope, valid dates and evidence',()=>{
 const d=complete(),a={...blankAuthority(),mode:'representative',legalName:'Synthetic Agent',capacity:'Agent',email:'agent@example.test',jurisdiction:'US',address:'Synthetic address',representedOwners:'Writer A and Writer B',rights:'both',uses:'Sync',territories:'US',validFrom:'2026-01-01',exclusivity:'nonexclusive',documentId:randomUUID()};
 assert.deepEqual(structuredRightsMissing({...d,authority:a}),[]);
 for(const changes of [{email:'invalid'},{documentId:''},{validFrom:'2026-02-30'},{validUntil:'2025-01-01'},{rights:'unknown'},{representedOwners:''}])assert.ok(structuredRightsMissing({...d,authority:{...a,...changes}}).length);
});
test('database independently validates structured shares, samples, claims and stale clients while preserving incomplete saves',()=>fresh(async db=>{
 const s=await create(db),d=complete();await validate(db,s,d);await validate(db,s,{...blankSubmissionDraft(),hasSamples:true,samples:[blankSample()]},false);
 for(const data of [{...d,publishingOwners:[{name:'A',percentage:'99.99'}]},{...d,publishingOwners:[{name:'A',percentage:'110'}]},{...d,authority:blankAuthority()},{...d,hasSamples:false,samples:[blankSample()]},{...d,hasClaims:true,claims:[blankClaim()]},{...d,authority:{...d.authority,approved:true}},{...d,hasAgreements:true,agreements:[blankAgreement()]}])await assert.rejects(validate(db,s,data),e=>e.code==='22023');
 await artist(db,'media_submission_save_draft',[s,d,0,randomUUID()]);const legacy={...d};for(const k of ['publishingOwners','authority','hasSamples','samples','hasClaims','claims','hasAgreements','agreements'])delete legacy[k];await assert.rejects(artist(db,'media_submission_save_draft',[s,legacy,1,randomUUID()]),e=>e.code==='22023');
 assert.deepEqual((await artist(db,'media_upload_read',[s])).draft_data,d);
}));
test('private document reservations recover idempotently and deny foreign actors, roles, kinds and over-limit content',()=>fresh(async db=>{
 const s=await create(db),key=randomUUID(),a=await reserve(db,s,'agreement',key);assert.deepEqual(await reserve(db,s,'agreement',key),a);
 await assert.rejects(reserve(db,s,'authority',key),e=>e.code==='22023');
 for(const who of [ids.b,ids.buyer]){await asActor(db,who,()=>assert.rejects(invoke(db,'media_workspace_document_reserve',[s,'agreement','Synthetic.pdf',100,randomUUID()]),e=>e.code==='42501'));await asActor(db,who,()=>assert.rejects(invoke(db,'media_workspace_document_access',[a.document_id,true,false]),e=>e.code==='42501'));}
 for(const role of ['anon','service_role'])await asActor(db,null,()=>assert.rejects(invoke(db,'media_workspace_document_reserve',[s,'agreement','Synthetic.pdf',100,randomUUID()]),e=>e.code==='42501'),role);
 for(const[name,bytes,kind]of [['../file.pdf',100,'agreement'],['file.html',100,'agreement'],['file.pdf',3000001,'agreement'],['file.pdf',100,'other']])await assert.rejects(artist(db,'media_workspace_document_reserve',[s,kind,name,bytes,randomUUID()]),e=>e.code==='22023');
 assert.equal((await db.query('select count(*)::int n from submission_media.workspace_documents')).rows[0].n,1);
}));
test('received agreements are immutable, version-bound, private and visible to MFA Admin without approving rights',()=>fresh(async db=>{
 const rightsBefore=(await db.query('select count(*)::int n from rights_holders')).rows[0].n;
 const s=await create(db),id=(await reserve(db,s)).document_id;await receive(db,s,id);
 assert.deepEqual(await receiveAgain(),{id,received:true});
 async function receiveAgain(){return asActor(db,null,()=>invoke(db,'media_workspace_document_received',[ids.a,id,'a'.repeat(64)]),'service_role');}
 const docs=await artist(db,'media_workspace_documents',[s,false]);assert.equal(docs[0].state,'received');assert.equal('path'in docs[0],false);
 const admin=await asActor(db,ids.admin,()=>invoke(db,'media_workspace_document_access',[id,false,true]));assert.equal(admin.bucket,'rights-evidence');
 await asActor(db,ids.admin,()=>assert.rejects(invoke(db,'media_workspace_document_access',[id,true,true]),e=>e.code==='42501'));
 await asActor(db,ids.a,()=>assert.rejects(invoke(db,'media_workspace_document_received',[ids.a,id,'b'.repeat(64)]),e=>e.code==='42501'));
 await assert.rejects(db.query('update submission_media.workspace_documents set sha256=$2 where id=$1',[id,'b'.repeat(64)]),/Immutable/);
 await assert.rejects(db.query('delete from submission_media.workspace_documents where id=$1',[id]),/Immutable/);
 const d={...complete(),hasAgreements:true,agreements:[{...blankAgreement(),title:'Synthetic Agreement',counterparty:'Synthetic Other',kind:'publishing',rights:'publishing',validFrom:'2026-01-01',territories:'US',documentId:id}]};await validate(db,s,d);
 const other=await create(db);await assert.rejects(validate(db,other,d),e=>e.code==='22023');
 await db.query("update storage.objects set version='replacement' where name=$1",[ids.a+'/'+s+'/'+id+'/original']);await assert.rejects(artist(db,'media_workspace_document_access',[id,false,false]),e=>e.code==='22023');
 assert.equal((await db.query('select count(*)::int n from rights_holders')).rows[0].n,rightsBefore);
}));
test('document policy grants and audit history remain closed to browser and broker roles',()=>fresh(async db=>{
 for(const role of ['anon','authenticated','service_role','submission_media_broker','media_broker_production_login']){const x=(await db.query(`select has_table_privilege($1,'submission_media.workspace_documents','SELECT') readable,has_function_privilege($1,'submission_media.validate_workspace_rights(uuid,jsonb,boolean)','EXECUTE') callable`,[role])).rows[0];assert.equal(x.readable,false);assert.equal(x.callable,false);}
 const s=await create(db),id=(await reserve(db,s)).document_id;await receive(db,s,id);await artist(db,'media_workspace_document_audit',[id,false,'authorized']);await assert.rejects(db.query('delete from submission_media.workspace_document_events where document_id=$1',[id]),/immutable/i);
 const snapshots=(await db.query('select count(*)::int n from licensing_private.evidence')).rows[0].n;assert.equal(snapshots,0);
}));
test('private evidence fails closed when bucket is missing/public and bounds every reservation without altering Storage policies',()=>fresh(async db=>{
 const s=await create(db);await db.exec("update storage.buckets set public=true where id='rights-evidence'");await assert.rejects(reserve(db,s),e=>e.code==='55000');await db.exec("update storage.buckets set public=false where id='rights-evidence'");
 for(let i=0;i<20;i++)await reserve(db,s);await assert.rejects(reserve(db,s),e=>e.code==='54000');assert.equal((await db.query('select count(*)::int n from submission_media.workspace_documents')).rows[0].n,20);
}));
test('rich structured draft edits, reopens and resubmits without dropping fields or private document references',()=>fresh(async db=>{
 const s=await create(db),doc=(await reserve(db,s)).document_id;await receive(db,s,doc);
 const d={...complete(),title:'Synthetic Round Trip',primaryArtist:'Synthetic Artist',description:'A fully synthetic round-trip recording for rights compatibility.',genre:'Electronic',subgenre:'Ambient',moods:'Calm',bpm:'100',key:'C',language:'zxx',vocal:'instrumental',explicit:'clean',releaseYear:'2026',licenseCategories:['digital'],permittedUses:'Sync',territories:'US',
 masterOwnership:'Preserved master note',publishingOwnership:'Preserved publishing note',licensingAuthority:'Preserved authority note',rightsNotes:'Preserved disclosures',
 hasSamples:true,samples:[{...blankSample(),title:'Synthetic source',artist:'Synthetic performer',use:'interpolation',publisher:'Synthetic publisher',sourceStart:'0',sourceEnd:'2',trackStart:'3',trackEnd:'5',description:'Synthetic interpolation',clearance:'pending'}],
 hasClaims:true,claims:[{...blankClaim(),claimant:'Synthetic claimant',kind:'ownership',details:'Synthetic dispute retained for review',status:'open'}],
 hasAgreements:true,agreements:[{...blankAgreement(),title:'Synthetic Agreement',counterparty:'Synthetic owner',kind:'publishing',rights:'publishing',validFrom:'2026-01-01',territories:'US',documentId:doc}]};
 let saved=await artist(db,'media_submission_save_draft',[s,submissionDraftSchema.parse(d),0,randomUUID()]);
 const loaded=(await artist(db,'media_upload_read',[s])).draft_data;assert.deepEqual(submissionDraftSchema.parse(loaded),d);
 const edited=submissionDraftSchema.parse({...loaded,authority:{...loaded.authority,company:'Edited company'},claims:loaded.claims.map(c=>({...c,reference:'Updated dispute reference'}))});
 saved=await artist(db,'media_submission_save_draft',[s,edited,saved.draft_revision,randomUUID()]);assert.deepEqual((await artist(db,'media_upload_read',[s])).draft_data,edited);
 const {readyPackage,revision}=await import('./helpers/music-uploads-fixture.mjs');await readyPackage(db,s);
 await artist(db,'media_submission_prepare',[s,await revision(db,s),randomUUID()]);
 const first=await artist(db,'media_upload_submit',[s,await revision(db,s),randomUUID()]);
 let hash=(await db.query("select encode(package_hash,'hex') h from submission_media.master_reviews where id=$1",[first.review_id])).rows[0].h;
 const reviewRevision=await revision(db,s);await asActor(db,ids.admin,()=>invoke(db,'media_decide_master_review',[first.review_id,false,hash,reviewRevision,randomUUID()]));
 const second=await artist(db,'media_upload_submit',[s,await revision(db,s),randomUUID()]);assert.notEqual(second.review_id,first.review_id);assert.deepEqual((await artist(db,'media_upload_read',[s])).draft_data,edited);
 await assert.rejects(artist(db,'media_submission_save_draft',[s,edited,saved.draft_revision,randomUUID()]),e=>e.code==='42501');
 assert.equal((await artist(db,'media_workspace_documents',[s,false]))[0].id,doc);
}));
