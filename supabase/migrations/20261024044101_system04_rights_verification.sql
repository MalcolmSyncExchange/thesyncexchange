-- System 04: Artist/SEC rights review over the existing PK03/PK04 authority chain.
-- No bucket creation, Storage DDL, activation, legal template or commercial policy.
begin;
do $$begin if current_user<>'postgres' or to_regprocedure('licensing_private.check_offer(uuid,timestamptz)') is null or to_regprocedure('public.media_upload_submit(uuid,bigint,uuid)') is null then raise exception 'Verified postgres installer and accepted PK03/04/System03 required' using errcode='55000';end if;end$$;
create schema rights_private;
revoke all on schema rights_private from public,anon,authenticated,service_role;
create table rights_private.cases(
 track_id uuid primary key references public.tracks(id) on delete restrict,owner_id uuid not null references public.user_profiles(id) on delete restrict,
 revision bigint not null default 0,context_epoch bigint not null default 0, state text not null default 'draft' check(state in('draft','pending','clarification','approved','rejected','disputed','expired','revoked')),
 draft jsonb not null default '{}',submitted_version uuid,approved_decision uuid,note text not null default '',updated_at timestamptz not null default clock_timestamp()
);
create table rights_private.documents(
 id uuid primary key default gen_random_uuid(),track_id uuid not null references rights_private.cases(track_id),owner_id uuid not null,
 kind text not null check(kind in('declaration','mandate','administration','label','publishing','contributor','splits','permission','transfer','correspondence')),
 filename text not null,declared_bytes bigint not null check(declared_bytes between 1 and 3000000),media_type text not null check(media_type in('application/pdf','image/png','image/jpeg')),
 state text not null default 'reserved' check(state in('reserved','received','revoked','disputed','withdrawn')),
 object_id uuid references storage.objects(id) on delete restrict,object_version text,sha256 text,expires_at timestamptz not null default clock_timestamp()+interval '24 hours',created_at timestamptz not null default clock_timestamp(),
 check((object_id is null and object_version is null and sha256 is null) or (object_id is not null and length(object_version)>0 and sha256~'^[a-f0-9]{64}$'))
);
create table rights_private.versions(
 id uuid primary key default gen_random_uuid(),track_id uuid not null references rights_private.cases(track_id),payload jsonb not null,payload_hash text not null,source_hash text not null,
 documents jsonb not null,submitted_by uuid not null,submitted_at timestamptz not null default clock_timestamp()
);
create table rights_private.decisions(
 id uuid primary key default gen_random_uuid(),track_id uuid not null references rights_private.cases(track_id),version_id uuid references rights_private.versions(id),
 state text not null check(state in('clarification','approved','rejected','disputed','expired','revoked')),note text not null,checklist jsonb not null,licensing_rights jsonb,
 reviewer_id uuid not null references public.user_profiles(id),created_at timestamptz not null default clock_timestamp()
);
create table rights_private.events(id bigint generated always as identity primary key,track_id uuid not null references rights_private.cases(track_id),actor_id uuid not null,action text not null,resource_id uuid,recorded_at timestamptz not null default clock_timestamp());
create table rights_private.operations(track_id uuid not null references rights_private.cases(track_id),key uuid not null,actor_id uuid not null,request_hash text not null,result jsonb not null,created_at timestamptz not null default clock_timestamp(),primary key(track_id,key));
create table rights_private.document_reviews(document_id uuid not null references rights_private.documents(id),version_id uuid not null references rights_private.versions(id),evidence_id uuid not null references licensing_private.evidence(id),primary key(document_id,version_id));
alter table rights_private.cases add foreign key(submitted_version) references rights_private.versions(id),add foreign key(approved_decision) references rights_private.decisions(id);
create index rights_docs_track on rights_private.documents(track_id,created_at);
create index rights_operations_actor on rights_private.operations(actor_id,created_at);
create index rights_events_actor on rights_private.events(actor_id,action,recorded_at);
create index rights_events_track on rights_private.events(track_id,id);
create function rights_private.actor(p_admin boolean default false) returns uuid language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null or not public.auth_session_is_active() or (p_admin and not public.is_admin()) or (not p_admin and not exists(select 1 from public.user_profiles where id=auth.uid() and role='artist')) then raise exception 'Rights access denied' using errcode='42501';end if;return auth.uid();end$$;
create function rights_private.lock_case(p_track uuid,p_admin boolean default false) returns rights_private.cases language plpgsql security definer set search_path='' as $$declare c rights_private.cases;u uuid:=rights_private.actor(p_admin);begin
 perform 1 from public.tracks where id=p_track and (p_admin or artist_user_id=u) for update;if not found then raise exception 'Rights unavailable' using errcode='42501';end if;
 select * into c from rights_private.cases where track_id=p_track and (p_admin or owner_id=u) for update;return c;end$$;
create function rights_private.bump(p_track uuid) returns bigint language plpgsql security definer set search_path='' as $$declare r bigint;begin
 update rights_private.cases set revision=revision+1,updated_at=clock_timestamp() where track_id=p_track returning revision into r;
 insert into licensing_private.rights_revisions values(p_track,1) on conflict(track_id) do update set revision=licensing_private.rights_revisions.revision+1;return r;end$$;
create function rights_private.source_hash(p_track uuid) returns text language sql stable security definer set search_path='' as $$
 select licensing_private.hash_json(jsonb_build_object('contextEpoch',coalesce((select context_epoch from rights_private.cases where track_id=t.id),0),'legacyClaims',(select coalesce(jsonb_agg(to_jsonb(r)-array['created_at','updated_at'] order by r.id),'[]') from public.rights_holders r where r.track_id=t.id),'owner',t.artist_user_id,'legacyRecording',t.audio_file_path,'master',a.id,'sha256',encode(a.sha256,'hex'),'objectVersion',a.storage_version)) from public.tracks t left join submission_media.submissions s on s.track_id=t.id left join submission_media.assets a on a.id=s.working_master_id where t.id=p_track
$$;
create function rights_private.replay(p_track uuid,p_key uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare o rights_private.operations;begin
 if p_key is null then raise exception 'Operation key required' using errcode='22023';end if;select * into o from rights_private.operations where track_id=p_track and key=p_key;if found then if o.actor_id<>auth.uid() or o.request_hash<>licensing_private.hash_json(p_request) then raise exception 'Conflicting operation key' using errcode='40001';end if;return o.result;end if;if (select count(*) from rights_private.operations where actor_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=1000 then raise exception 'Rights operation limit' using errcode='54000';end if;return null;end$$;
create function rights_private.finish(p_track uuid,p_key uuid,p_request jsonb,p_result jsonb,p_action text,p_resource uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$begin
 insert into rights_private.operations(track_id,key,actor_id,request_hash,result) values(p_track,p_key,auth.uid(),licensing_private.hash_json(p_request),p_result);insert into rights_private.events(track_id,actor_id,action,resource_id) values(p_track,auth.uid(),p_action,p_resource);return p_result;end$$;
create function rights_private.check_party_shape(p jsonb,p_seller boolean) returns void language plpgsql set search_path='' as $$declare k text;begin
 if jsonb_typeof(p) is distinct from 'object' or p-array['id','legalName','entityType','jurisdiction','address','registrationNumber','userId']<>'{}' or (not p_seller and p ? 'userId') or p->>'entityType' is null or p->>'entityType' not in('individual','company') then raise exception 'Invalid legal party shape' using errcode='22023';end if;
 foreach k in array array['legalName','jurisdiction','address'] loop if jsonb_typeof(p->k) is distinct from 'string' or length(p->>k)>500 then raise exception 'Invalid legal party text' using errcode='22023';end if;end loop;
 if (p ? 'id' and (jsonb_typeof(p->'id')<>'string' or length(p->>'id')>100)) or (p ? 'registrationNumber' and (jsonb_typeof(p->'registrationNumber')<>'string' or length(p->>'registrationNumber')>100)) then raise exception 'Invalid legal party identifier' using errcode='22023';end if;
end$$;
create function rights_private.validate(p jsonb,p_complete boolean) returns void language plpgsql security definer set search_path='' as $$declare h jsonb;pool text;total integer;controlled integer;d rights_private.documents;s jsonb:=p->'scope';begin
 if jsonb_typeof(p) is distinct from 'object' or octet_length(p::text)>100000 or p-array['seller','recordingIdentifier','workIdentifier','master','publishing','scope']<>'{}' then raise exception 'Bounded rights declaration required' using errcode='22023';end if;
 if jsonb_typeof(p->'seller') is distinct from 'object' or jsonb_typeof(s) is distinct from 'object' then raise exception 'Rights scope and seller required' using errcode='22023';end if;
 perform rights_private.check_party_shape(p->'seller',true);
 if jsonb_typeof(p->'recordingIdentifier') is distinct from 'string' or jsonb_typeof(p->'workIdentifier') is distinct from 'string' or length(p->>'recordingIdentifier')>100 or length(p->>'workIdentifier')>100 then raise exception 'Invalid recording/work identity' using errcode='22023';end if;
 foreach pool in array array['master','publishing'] loop
  if jsonb_typeof(p->pool) is distinct from 'array' or jsonb_array_length(p->pool)>50 then raise exception 'Separate rights pools required' using errcode='22023';end if;total:=0;controlled:=0;
  for h in select value from jsonb_array_elements(p->pool) loop
   if jsonb_typeof(h) is distinct from 'object' or h-array['party','role','ownershipBps','controlledBps','authority','documentId']<>'{}' or h->>'role' is null or h->>'role' not in('owner','writer','composer','publisher','administrator','label','distributor','representative','producer','other') or h->>'authority' is null or h->>'authority' not in('owner','agent','exclusive_controller') or coalesce(h->>'ownershipBps','')!~'^[0-9]{1,5}$' or coalesce(h->>'controlledBps','')!~'^[0-9]{1,5}$' or (h->>'ownershipBps')::int not between 0 and 10000 or (h->>'controlledBps')::int not between 0 and (h->>'ownershipBps')::int or jsonb_typeof(h->'party') is distinct from 'object' or octet_length((h->'party')::text)>3000 then raise exception 'Invalid party, role or percentage' using errcode='22023';end if;
   if jsonb_typeof(h->'documentId') is distinct from 'string' or ((h->>'documentId')<>'' and (h->>'documentId')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid document identity' using errcode='22023';end if;perform rights_private.check_party_shape(h->'party',false);total:=total+(h->>'ownershipBps')::int;controlled:=controlled+(h->>'controlledBps')::int;
   if p_complete then perform licensing_private.check_party(h->'party');if length(coalesce(h#>>'{party,id}','')) not between 2 and 100 or coalesce(h->>'documentId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' or ((h->>'ownershipBps')::int=0 and (h->>'role' not in('administrator','label','distributor','representative') or h->>'authority'='owner')) then raise exception 'Identified documented contributors required' using errcode='22023';end if;end if;
  end loop;
  if total>10000 or controlled>10000 or (p_complete and (total<>10000 or controlled<>10000 or jsonb_array_length(p->pool)=0)) then raise exception 'Each rights pool needs 100 percent ownership and control' using errcode='22023';end if;
  if exists(select 1 from jsonb_array_elements(p->pool) claims group by claims.value#>>'{party,id}' having count(*)>1) then raise exception 'Duplicate ownership claim' using errcode='22023';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements((p->'master')||(p->'publishing')) claims group by claims.value#>>'{party,id}' having count(distinct claims.value->'party')>1) then raise exception 'Conflicting party identities' using errcode='22023';end if;
 if s-array['uses','territories','restrictions','excludedUses','validFrom','validUntil','outsideClearances','maxDurationDays','exclusivity','exclusivityConflict']<>'{}' or s->>'exclusivity' is null or s->>'exclusivity' not in('nonexclusive','exclusive','both') or jsonb_typeof(s->'exclusivityConflict') is distinct from 'boolean' then raise exception 'Explicit exclusivity restrictions required' using errcode='22023';end if;
 foreach pool in array array['uses','territories','restrictions','excludedUses'] loop
  if jsonb_typeof(s->pool) is distinct from 'array' or jsonb_array_length(s->pool)>250 or exists(select 1 from jsonb_array_elements(s->pool) v where jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 2000) then raise exception 'Invalid rights scope list' using errcode='22023';end if;
 end loop;
 foreach pool in array array['validFrom','validUntil'] loop if jsonb_typeof(s->pool) is distinct from 'string' or length(s->>pool)>50 or ((s->>pool)<>'' and (s->>pool)!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T') then raise exception 'Invalid authority date' using errcode='22023';end if;if (s->>pool)<>'' then perform (s->>pool)::timestamptz;end if;end loop;
 if s->'maxDurationDays' is distinct from 'null'::jsonb and (coalesce(s->>'maxDurationDays','')!~'^[0-9]{1,5}$' or (s->>'maxDurationDays')::int not between 1 and 36500) then raise exception 'Invalid usage duration limit' using errcode='22023';end if;
 if p_complete then
  perform licensing_private.check_party(p->'seller');
  if length(coalesce(p->>'recordingIdentifier','')) not between 2 and 100 or length(coalesce(p->>'workIdentifier','')) not between 2 and 100 or jsonb_array_length(s->'uses')=0 or jsonb_array_length(s->'territories')=0 or coalesce(s->>'validFrom','')='' or coalesce(s->>'validUntil','')='' or (s->>'validUntil')::timestamptz<=greatest(clock_timestamp(),(s->>'validFrom')::timestamptz) or (s->>'exclusivityConflict')::boolean or exists(select 1 from jsonb_array_elements_text(s->'uses') use_code where (s->'excludedUses') ? use_code) then raise exception 'Complete unexpired, conflict-free licensing scope required' using errcode='22023';end if;
  if jsonb_typeof(s->'outsideClearances') is distinct from 'array' or jsonb_array_length(s->'outsideClearances')<>5 or exists(select 1 from unnest(array['public_performance','distribution','third_party_samples','performer_likeness','other_permissions']) k where (select count(*) from jsonb_array_elements(s->'outsideClearances') c where c->>'kind'=k)<>1) or exists(select 1 from jsonb_array_elements(s->'outsideClearances') c where c->>'responsibility' is null or c->>'responsibility' not in('included','excluded','buyer_responsibility','not_applicable') or length(coalesce(c->>'description','')) not between 5 and 2000) then raise exception 'Outside permissions must be explicit' using errcode='22023';end if;
 end if;
end$$;
create function rights_private.check_documents(p_track uuid,p jsonb) returns void language plpgsql security definer set search_path='' as $$declare h jsonb;d rights_private.documents;begin
 if (select count(distinct claims.value->>'documentId') from jsonb_array_elements((p->'master')||(p->'publishing')) claims)>20 then raise exception 'At most twenty evidence documents per review' using errcode='22023';end if;
 for h in select value from jsonb_array_elements((p->'master')||(p->'publishing')) loop
  select * into d from rights_private.documents where id=(h->>'documentId')::uuid and track_id=p_track and state='received';
  if not found or not exists(select 1 from storage.objects o join storage.buckets b on b.id=o.bucket_id and not b.public where o.id=d.object_id and o.version=d.object_version and o.bucket_id='rights-evidence' and o.name=d.owner_id::text||'/'||d.track_id::text||'/'||d.id::text||'/original' and (o.metadata->>'size')::bigint=d.declared_bytes) or (h->>'authority'<>'owner' and d.kind not in('mandate','administration','label','publishing','contributor','permission','transfer')) then raise exception 'Missing private evidence or mandate' using errcode='22023';end if;
 end loop;end$$;
create function public.rights_save(p_track uuid,p_revision bigint,p_key uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare c rights_private.cases;r jsonb;req jsonb:=jsonb_build_object('action','save','revision',p_revision,'payload',p_payload);begin
 c:=rights_private.lock_case(p_track);if c.track_id is null then insert into rights_private.cases(track_id,owner_id) values(p_track,auth.uid()) returning * into c;end if;
 r:=rights_private.replay(p_track,p_key,req);if r is not null then return r;end if;
 if p_revision is null or c.revision<>p_revision then raise exception 'Stale rights revision' using errcode='40001';end if;if c.state='pending' then raise exception 'Pending review cannot be edited' using errcode='42501';end if;
 perform rights_private.validate(p_payload,false);if p_payload#>>'{seller,userId}' is distinct from auth.uid()::text then raise exception 'Canonical seller required' using errcode='42501';end if;update rights_private.cases set draft=p_payload,state='draft',approved_decision=null,note='Changed rights require a new review.' where track_id=p_track;
 return rights_private.finish(p_track,p_key,req,jsonb_build_object('revision',rights_private.bump(p_track)),'declaration_saved');end$$;
create function public.rights_submit(p_track uuid,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c rights_private.cases;v uuid;ds jsonb;r jsonb;req jsonb:=jsonb_build_object('action','submit','revision',p_revision);begin
 c:=rights_private.lock_case(p_track);r:=rights_private.replay(p_track,p_key,req);if r is not null then return r;end if;if c.track_id is null or p_revision is null or c.revision<>p_revision then raise exception 'Stale rights revision' using errcode='40001';end if;
 if c.state='pending' then raise exception 'Review already pending' using errcode='42501';end if;perform rights_private.validate(c.draft,true);perform rights_private.check_documents(p_track,c.draft);
 select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'kind',d.kind,'sha256',d.sha256,'objectId',d.object_id,'objectVersion',d.object_version,'bytes',d.declared_bytes) order by d.id),'[]') into ds from rights_private.documents d where d.track_id=p_track and d.id in(select (h->>'documentId')::uuid from jsonb_array_elements((c.draft->'master')||(c.draft->'publishing')) h);
 insert into rights_private.versions(track_id,payload,payload_hash,source_hash,documents,submitted_by) values(p_track,c.draft,licensing_private.hash_json(c.draft),rights_private.source_hash(p_track),ds,auth.uid()) returning id into v;
 update rights_private.cases set state='pending',submitted_version=v,approved_decision=null,note='Awaiting separate master and publishing authority review.' where track_id=p_track;
 return rights_private.finish(p_track,p_key,req,jsonb_build_object('revision',rights_private.bump(p_track),'version_id',v),'rights_submitted',v);end$$;
create function public.rights_review(p_track uuid,p_revision bigint,p_key uuid,p_version uuid,p_state text,p_note text,p_checklist jsonb) returns jsonb language plpgsql security definer set search_path='' as $$declare c rights_private.cases;v rights_private.versions;h jsonb;pool text;out jsonb;parts jsonb;doc rights_private.documents;e uuid;rid uuid;result jsonb;req jsonb:=jsonb_build_object('action','review','revision',p_revision,'version',p_version,'state',p_state,'note',p_note,'checklist',p_checklist);begin
 c:=rights_private.lock_case(p_track,true);result:=rights_private.replay(p_track,p_key,req);if result is not null then return result;end if;
 if c.track_id is null or p_revision is null or c.revision<>p_revision or p_version is distinct from c.submitted_version then raise exception 'Stale rights review' using errcode='40001';end if;
 if p_state is null or p_state not in('clarification','approved','rejected','disputed','expired','revoked') or length(coalesce(p_note,'')) not between 5 and 2000 or jsonb_typeof(p_checklist) is distinct from 'object' or octet_length(p_checklist::text)>2000 or p_checklist-array['master','publishing','documents','mandates','scope','contributors','conflicts','secureHandling']<>'{}' or exists(select 1 from jsonb_each(p_checklist) ck where jsonb_typeof(ck.value)<>'boolean') then raise exception 'Review decision and explanation required' using errcode='22023';end if;
 if p_state in('approved','rejected','clarification') and c.state<>'pending' then raise exception 'A new pending submission is required' using errcode='42501';end if;
 select * into strict v from rights_private.versions where id=p_version and track_id=p_track;
 if p_state='approved' then
  if not exists(select 1 from public.user_profiles where id=c.owner_id and role='artist') then raise exception 'Canonical Artist seller required' using errcode='42501';end if;
  if p_checklist is distinct from '{"master":true,"publishing":true,"documents":true,"mandates":true,"scope":true,"contributors":true,"conflicts":true,"secureHandling":true}'::jsonb then raise exception 'Every authority review check is required' using errcode='22023';end if;
  if v.source_hash<>rights_private.source_hash(p_track) then raise exception 'Recording changed; require a new submission' using errcode='40001';end if;
  perform rights_private.validate(v.payload,true);perform rights_private.check_documents(p_track,v.payload);out:=v.payload;
  foreach pool in array array['master','publishing'] loop parts:='[]';for h in select value from jsonb_array_elements(v.payload->pool) loop
   select * into strict doc from rights_private.documents where id=(h->>'documentId')::uuid;select evidence_id into e from rights_private.document_reviews where document_id=doc.id and version_id=v.id;
   if not found then insert into licensing_private.evidence(object_id,object_version,byte_size,sha256,review_reference,reviewed_by,valid_until) values(doc.object_id,doc.object_version,doc.declared_bytes,doc.sha256,'System04:'||v.id||' '||p_note,auth.uid(),(v.payload#>>'{scope,validUntil}')::timestamptz) returning id into e;insert into rights_private.document_reviews values(doc.id,v.id,e);end if;
   if (h->>'ownershipBps')::int=0 then out:=jsonb_set(out,array['participants'],coalesce(out->'participants','[]'::jsonb)||jsonb_build_array((h-'documentId')||jsonb_build_object('evidenceId',e,'pool',pool)));else parts:=parts||jsonb_build_array((h-'documentId')||jsonb_build_object('evidenceId',e));end if;end loop;out:=jsonb_set(out,array[pool],parts);end loop;
  out:=out||jsonb_build_object('verification',jsonb_build_object('versionId',v.id,'declarationHash',v.payload_hash,'sourceHash',v.source_hash,'documents',v.documents,'submittedBy',v.submitted_by,'submittedAt',v.submitted_at,'reviewedBy',auth.uid(),'reviewedAt',clock_timestamp()));
 end if;
 insert into rights_private.decisions(track_id,version_id,state,note,checklist,licensing_rights,reviewer_id) values(p_track,v.id,p_state,p_note,p_checklist,out,auth.uid()) returning id into rid;
 update rights_private.cases set state=p_state,approved_decision=case when p_state='approved' then rid else null end,note=p_note where track_id=p_track;
 return rights_private.finish(p_track,p_key,req,jsonb_build_object('revision',rights_private.bump(p_track),'decision_id',rid),'rights_'||p_state,rid);end$$;
-- Documents are opaque private originals. Browser never obtains Storage coordinates.
create function public.rights_document_reserve(p_track uuid,p_revision bigint,p_key uuid,p_kind text,p_filename text,p_bytes bigint,p_type text) returns jsonb language plpgsql security definer set search_path='' as $$declare c rights_private.cases;d uuid;r jsonb;req jsonb:=jsonb_build_object('action','document','revision',p_revision,'kind',p_kind,'filename',p_filename,'bytes',p_bytes,'type',p_type);begin
 perform pg_advisory_xact_lock(hashtextextended('rights-documents:'||rights_private.actor()::text,0));c:=rights_private.lock_case(p_track);r:=rights_private.replay(p_track,p_key,req);if r is not null then return r;end if;
 if c.track_id is null or p_revision is null or p_revision<>c.revision then raise exception 'Save a current rights draft first' using errcode='40001';end if;
 if c.state='pending' or p_kind is null or p_kind not in('declaration','mandate','administration','label','publishing','contributor','splits','permission','transfer','correspondence') or length(coalesce(p_filename,'')) not between 1 and 200 or p_filename~'[[:cntrl:]/\\]' or p_bytes is null or p_bytes not between 1 and 3000000 or p_type is null or p_type not in('application/pdf','image/png','image/jpeg') then raise exception 'Invalid private document reservation' using errcode='22023';end if;
 if (select count(*) from rights_private.documents where owner_id=auth.uid() and created_at>clock_timestamp()-interval '1 day')>=30 then raise exception 'Document admission limit reached' using errcode='54000';end if;
 insert into rights_private.documents(track_id,owner_id,kind,filename,declared_bytes,media_type) values(p_track,auth.uid(),p_kind,p_filename,p_bytes,p_type) returning id into d;
 return rights_private.finish(p_track,p_key,req,jsonb_build_object('document_id',d,'revision',rights_private.bump(p_track)),'document_reserved',d);end$$;
create function public.rights_document_withdraw(p_document uuid,p_revision bigint,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare d rights_private.documents;c rights_private.cases;r jsonb;req jsonb:=jsonb_build_object('action','withdraw','document',p_document,'revision',p_revision);begin
 perform rights_private.actor();select * into d from rights_private.documents where id=p_document and owner_id=auth.uid();if not found then raise exception 'Document denied' using errcode='42501';end if;c:=rights_private.lock_case(d.track_id);r:=rights_private.replay(d.track_id,p_key,req);if r is not null then return r;end if;
 if p_revision is null or c.revision<>p_revision then raise exception 'Stale rights revision' using errcode='40001';end if;
 if c.state='pending' or d.state not in('reserved','received') or exists(select 1 from rights_private.versions v where v.track_id=d.track_id and v.documents @> jsonb_build_array(jsonb_build_object('id',d.id))) or exists(select 1 from jsonb_array_elements((c.draft->'master')||(c.draft->'publishing')) h where h->>'documentId'=d.id::text) then raise exception 'Referenced evidence must be retained' using errcode='42501';end if;
 update rights_private.documents set state='withdrawn' where id=d.id;return rights_private.finish(d.track_id,p_key,req,jsonb_build_object('revision',rights_private.bump(d.track_id)),'unused_document_withdrawn',d.id);end$$;
create function public.rights_document_access(p_document uuid,p_write boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare d rights_private.documents;begin
 if auth.role() is distinct from 'authenticated' or auth.uid() is null or not public.auth_session_is_active() then raise exception 'Document denied' using errcode='42501';end if;
 select * into d from rights_private.documents where id=p_document and ((owner_id=auth.uid() and exists(select 1 from public.user_profiles where id=auth.uid() and role='artist')) or (not p_write and public.is_admin()));
 if not found or (p_write and (d.state not in('reserved','received') or d.expires_at<=clock_timestamp() or exists(select 1 from rights_private.cases where track_id=d.track_id and state='pending'))) then raise exception 'Document denied' using errcode='42501';end if;
 return jsonb_build_object('id',d.id,'track_id',d.track_id,'bytes',d.declared_bytes,'type',d.media_type,'state',d.state,'sha256',d.sha256,'version',d.object_version);end$$;
create function public.rights_document_server(p_actor uuid,p_document uuid,p_hash text default null,p_object uuid default null,p_outcome text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare d rights_private.documents;o storage.objects;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted document server required' using errcode='42501';end if;
 select * into strict d from rights_private.documents where id=p_document;
 perform 1 from public.tracks where id=d.track_id for update;
 select * into strict d from rights_private.documents where id=p_document for update;
 if not exists(select 1 from public.user_profiles where id=p_actor and ((id=d.owner_id and role='artist') or (role='admin' and p_hash is null))) then raise exception 'Document actor denied' using errcode='42501';end if;
 if not exists(select 1 from storage.buckets where id='rights-evidence' and not public) then raise exception 'Private evidence storage unavailable' using errcode='55000';end if;
 if p_hash is not null then
  if p_actor<>d.owner_id or d.state not in('reserved','received') or d.expires_at<=clock_timestamp() or exists(select 1 from rights_private.cases where track_id=d.track_id and state='pending') or p_hash!~'^[a-f0-9]{64}$' then raise exception 'Document confirmation denied' using errcode='42501';end if;
  select * into strict o from storage.objects where (p_object is null or id=p_object) and bucket_id='rights-evidence' and name=d.owner_id::text||'/'||d.track_id::text||'/'||d.id::text||'/original' and version is not null and (metadata->>'size')::bigint=d.declared_bytes;
  if d.object_id is not null then if d.object_id<>o.id or d.object_version<>o.version or d.sha256<>p_hash then raise exception 'Immutable document conflict' using errcode='40001';end if;
  else update rights_private.documents set state='received',object_id=o.id,object_version=o.version,sha256=p_hash where id=d.id;insert into rights_private.events(track_id,actor_id,action,resource_id) values(d.track_id,p_actor,'document_received',d.id);perform rights_private.bump(d.track_id);end if;
 elsif p_outcome is not null then
  if p_outcome='authorized' and (select count(*) from rights_private.events where actor_id=p_actor and action='document_access_authorized' and recorded_at>clock_timestamp()-interval '1 minute')>=60 then raise exception 'Document access limit' using errcode='54000';end if;
  if p_outcome not in('authorized','delivered','failed') then raise exception 'Invalid access outcome' using errcode='22023';end if;insert into rights_private.events(track_id,actor_id,action,resource_id) values(d.track_id,p_actor,'document_access_'||p_outcome,d.id);
 end if;
 if d.state not in('reserved','received','revoked','disputed','withdrawn') then raise exception 'Document unavailable' using errcode='42501';end if;
 return jsonb_build_object('id',d.id,'track_id',d.track_id,'bucket','rights-evidence','path',d.owner_id::text||'/'||d.track_id::text||'/'||d.id::text||'/original','bytes',d.declared_bytes,'type',d.media_type,'state',d.state,'sha256',coalesce(p_hash,d.sha256),'version',coalesce(o.version,d.object_version));end$$;
create function public.rights_document_restrict(p_document uuid,p_revision bigint,p_key uuid,p_state text,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$declare d rights_private.documents;c rights_private.cases;r jsonb;req jsonb:=jsonb_build_object('action','restrict_document','document',p_document,'revision',p_revision,'state',p_state,'note',p_note);begin
 perform rights_private.actor(true);select * into strict d from rights_private.documents where id=p_document;c:=rights_private.lock_case(d.track_id,true);r:=rights_private.replay(d.track_id,p_key,req);if r is not null then return r;end if;
 if p_revision is null or c.revision<>p_revision then raise exception 'Stale rights revision' using errcode='40001';end if;if p_state is null or p_state not in('revoked','disputed') or length(coalesce(p_note,'')) not between 5 and 2000 then raise exception 'Restriction explanation required' using errcode='22023';end if;
 update rights_private.documents set state=p_state where id=d.id;update rights_private.cases set state=p_state,approved_decision=null,note=p_note where track_id=d.track_id;
 insert into licensing_private.status_events(kind,resource_id,state,actor_id,reason) select 'evidence',r.evidence_id,p_state,auth.uid(),p_note from rights_private.document_reviews r where r.document_id=d.id on conflict(kind,resource_id) do nothing;
 return rights_private.finish(d.track_id,p_key,req,jsonb_build_object('revision',rights_private.bump(d.track_id)),'document_'||p_state,d.id);end$$;
create function rights_private.assert_current(p_track uuid,p_rights jsonb default null) returns void language plpgsql security definer set search_path='' as $$declare c rights_private.cases;d rights_private.decisions;v rights_private.versions;begin
 select * into c from rights_private.cases where track_id=p_track;if not found then return;end if;
 select * into d from rights_private.decisions where id=c.approved_decision;select * into v from rights_private.versions where id=d.version_id;
 if not exists(select 1 from public.user_profiles where id=c.owner_id and role='artist') or c.state<>'approved' or d.id is null or d.state<>'approved' or v.source_hash<>rights_private.source_hash(p_track) or (p_rights is not null and p_rights<>d.licensing_rights) then raise exception 'Current verified rights review required' using errcode='42501';end if;
 perform rights_private.validate(v.payload,true);perform rights_private.check_documents(p_track,v.payload);
 if exists(select 1 from rights_private.document_reviews dr join licensing_private.evidence e on e.id=dr.evidence_id where dr.version_id=v.id and (e.valid_until<clock_timestamp() or exists(select 1 from licensing_private.status_events se where se.kind='evidence' and se.resource_id=e.id))) then raise exception 'Reviewed documentation revoked or expired' using errcode='42501';end if;
end$$;
-- A material edit is irreversible evidence of change: reverting bytes/claims
-- never revives an old approval. No general Artist writer can reset this epoch.
create function rights_private.invalidate_context() returns trigger language plpgsql security definer set search_path='' as $$declare tracks uuid[]:='{}';begin
 if tg_table_name='rights_holders' then
  if tg_op<>'INSERT' then tracks:=array_append(tracks,old.track_id);end if;if tg_op<>'DELETE' then tracks:=array_append(tracks,new.track_id);end if;
 elsif tg_table_name='submissions' then
  if (new.owner_id,new.working_master_id,new.track_id) is not distinct from (old.owner_id,old.working_master_id,old.track_id) then return new;end if;tracks:=array[old.track_id,new.track_id];
 else
  if (new.artist_user_id,new.audio_file_path) is not distinct from(old.artist_user_id,old.audio_file_path) then return new;end if;tracks:=array[new.id];
 end if;
 update rights_private.cases set context_epoch=context_epoch+1,revision=revision+1,updated_at=clock_timestamp() where track_id=any(tracks);
 return case when tg_op='DELETE' then old else new end;end$$;
create trigger system04_rights_context after insert or update or delete on public.rights_holders for each row execute function rights_private.invalidate_context();
create trigger system04_recording_context after update on public.tracks for each row execute function rights_private.invalidate_context();
create trigger system04_master_context after update on submission_media.submissions for each row execute function rights_private.invalidate_context();
create function rights_private.guard_offer() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform rights_private.assert_current(new.track_id,new.rights);
 if exists(select 1 from rights_private.cases where track_id=new.track_id) and (new.license_exclusive and new.rights#>>'{scope,exclusivity}'='nonexclusive' or not new.license_exclusive and new.rights#>>'{scope,exclusivity}'='exclusive') then raise exception 'License exceeds reviewed exclusivity' using errcode='42501';end if;return new;end$$;
create trigger system04_rights_offer before insert on licensing_private.offers for each row execute function rights_private.guard_offer();
create or replace function public.guard_track_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rights_total numeric(7,2);
begin
  -- Service-role operations and verified admins are trusted moderation paths.
  if auth.role() = 'service_role' or public.is_admin() then
    if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
      if exists(select 1 from rights_private.cases where track_id=new.id) then
        perform rights_private.assert_current(new.id);
      else
      select coalesce(sum(ownership_percent), 0)
      into rights_total
      from public.rights_holders
      where track_id = new.id;

      if abs(rights_total - 100) > 0.01 then
        raise exception 'Approved tracks must have rights holder ownership totals equal to 100%%.';
      end if;

      end if;
      new.approved_at = coalesce(new.approved_at, now());
      new.approved_by = coalesce(new.approved_by, auth.uid());
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.artist_user_id <> auth.uid() then
      raise exception 'Artists may only create their own tracks.';
    end if;

    if new.status not in ('draft', 'pending_review') then
      raise exception 'Artists may only create drafts or submit tracks for review.';
    end if;

    if new.approved_at is not null or new.approved_by is not null then
      raise exception 'Approval fields are managed by admin workflows only.';
    end if;

    if new.featured then
      raise exception 'Featured state is managed by admins.';
    end if;

    return new;
  end if;

  if old.artist_user_id <> auth.uid() then
    raise exception 'Artists may only update their own tracks.';
  end if;

  if new.artist_user_id is distinct from old.artist_user_id then
    raise exception 'Track ownership cannot be changed by artists.';
  end if;

  if new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by then
    raise exception 'Approval fields are managed by admin workflows only.';
  end if;

  if new.featured is distinct from old.featured then
    raise exception 'Featured state is managed by admins.';
  end if;

  if old.status = 'approved' then
    if new.status <> 'archived' then
      raise exception 'Approved tracks may only be archived by artists.';
    end if;

    return new;
  end if;

  if new.status not in ('draft', 'pending_review', 'archived') then
    raise exception 'Artists may only save drafts, submit for review, or archive their own tracks.';
  end if;

  return new;
end;
$$;


revoke all on function public.guard_track_write() from public,anon,authenticated,service_role;
-- Preserve check_offer's OID and every established PK03 check.
do $$declare definition text;begin
 select pg_get_functiondef('licensing_private.check_offer(uuid,timestamptz)'::regprocedure) into definition;
 execute replace(definition,'licensing_private.check_offer(','licensing_private.check_offer_before_system04(');
end$$;
create or replace function licensing_private.check_offer(p_id uuid,p_until timestamptz) returns licensing_private.offers language plpgsql security definer set search_path='' as $$declare o licensing_private.offers;begin
 o:=licensing_private.check_offer_before_system04(p_id,p_until);perform rights_private.assert_current(o.track_id,o.rights);return o;end$$;
create function rights_private.guard_quote() returns trigger language plpgsql security definer set search_path='' as $$declare maxdays int;begin
 if exists(select 1 from rights_private.cases where track_id=(new.schedule#>>'{track,id}')::uuid) then
  perform rights_private.assert_current((new.schedule#>>'{track,id}')::uuid,new.schedule->'rights');maxdays:=(new.schedule#>>'{rights,scope,maxDurationDays}')::int;
  if maxdays is not null and (new.schedule#>>'{usage,endsAt}')::timestamptz-(new.schedule#>>'{usage,startsAt}')::timestamptz>make_interval(days=>maxdays) then raise exception 'Usage exceeds approved duration' using errcode='42501';end if;
 end if;return new;end$$;
create trigger system04_rights_quote before insert on licensing_private.quotes for each row execute function rights_private.guard_quote();
create function public.rights_read(p_track uuid,p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare c rights_private.cases;u uuid:=rights_private.actor(p_admin);effective text;d rights_private.decisions;begin
 perform 1 from public.tracks where id=p_track and (p_admin or artist_user_id=u);if not found then raise exception 'Rights unavailable' using errcode='42501';end if;
 select * into c from rights_private.cases where track_id=p_track and (p_admin or owner_id=u);effective:=coalesce(c.state,case when exists(select 1 from licensing_private.offer_heads where track_id=p_track) then 'previous_review' else 'not_started' end);
 if c.state='approved' then begin perform rights_private.assert_current(p_track);exception when others then effective:=case when (c.draft#>>'{scope,validUntil}')::timestamptz<=clock_timestamp() then 'expired' else 'needs_review' end;end;end if;
 select * into d from rights_private.decisions where id=c.approved_decision;
 return jsonb_build_object('track_id',p_track,'title',(select title from public.tracks where id=p_track),'revision',coalesce(c.revision,0),'state',effective,'note',case when effective='expired' then 'Authority has expired. Supply current evidence and scope for re-review.' when effective='needs_review' then 'Recording, ownership or supporting evidence changed. A fresh rights review is required.' else coalesce(c.note,case when effective='previous_review' then 'Earlier licensing reviews are retained. Saving a new declaration pauses current licensing eligibility until re-review; historical licenses retain their original evidence.' else '' end) end,'draft',c.draft,'submitted_version',c.submitted_version,'approved_rights',d.licensing_rights,
 'document_cursor',(select id from rights_private.documents where track_id=p_track order by created_at desc,id desc offset 19 limit 1),
 'documents',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'filename',filename,'bytes',declared_bytes,'type',media_type,'state',state,'sha256',sha256,'version',object_version) order by created_at desc,id desc) from rights_private.documents where track_id=p_track and (id in(select id from rights_private.documents where track_id=p_track order by created_at desc,id desc limit 20) or id in(select (h->>'documentId')::uuid from jsonb_array_elements((c.draft->'master')||(c.draft->'publishing')) h where h->>'documentId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'))),'[]'),
 'versions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'hash',payload_hash,'source_hash',source_hash,'payload',payload,'documents',documents,'submitted_by',submitted_by,'submitted_at',submitted_at) order by submitted_at desc,id desc) from (select * from rights_private.versions where track_id=p_track order by submitted_at desc,id desc limit 20) version_page),'[]'),
 'decisions',coalesce((select jsonb_agg(jsonb_build_object('id',id,'version_id',version_id,'state',state,'note',note,'reviewer_id',reviewer_id,'created_at',created_at,'checklist',checklist) order by created_at desc,id desc) from (select * from rights_private.decisions where track_id=p_track order by created_at desc,id desc limit 20) decision_page),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(e)) from (select id,action,actor_id,resource_id,recorded_at from rights_private.events where track_id=p_track order by id desc limit 50)e),'[]'));
end$$;
create function public.rights_history(p_track uuid,p_kind text,p_before text,p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=rights_private.actor(p_admin);items jsonb;begin
 perform 1 from public.tracks where id=p_track and (p_admin or artist_user_id=u);if not found then raise exception 'Rights history denied' using errcode='42501';end if;
 if p_kind in('versions','decisions','documents') and (p_before is null or p_before!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid history cursor' using errcode='22023';end if;
 if p_kind='versions' then select coalesce(jsonb_agg(to_jsonb(v) order by submitted_at desc,id desc),'[]') into items from (select id,payload_hash as hash,source_hash,payload,documents,submitted_at,submitted_by from rights_private.versions where track_id=p_track and (submitted_at,id)<(select submitted_at,id from rights_private.versions where track_id=p_track and id=p_before::uuid) order by submitted_at desc,id desc limit 20)v;
 elsif p_kind='decisions' then select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc,id desc),'[]') into items from (select id,version_id,state,note,checklist,reviewer_id,created_at from rights_private.decisions where track_id=p_track and (created_at,id)<(select created_at,id from rights_private.decisions where track_id=p_track and id=p_before::uuid) order by created_at desc,id desc limit 20)d;
 elsif p_kind='documents' then select coalesce(jsonb_agg(to_jsonb(d) order by created_at desc,id desc),'[]') into items from (select id,kind,filename,declared_bytes as bytes,media_type as type,state,sha256,object_version as version,created_at from rights_private.documents where track_id=p_track and (created_at,id)<(select created_at,id from rights_private.documents where track_id=p_track and id=p_before::uuid) order by created_at desc,id desc limit 20)d;
 elsif p_kind='events' then if coalesce(p_before,'')!~'^[0-9]{1,18}$' then raise exception 'Invalid audit cursor' using errcode='22023';end if;select coalesce(jsonb_agg(to_jsonb(e) order by id desc),'[]') into items from (select id,action,actor_id,resource_id,recorded_at from rights_private.events where track_id=p_track and id<p_before::bigint order by id desc limit 50)e;
 else raise exception 'Invalid history type' using errcode='22023';end if;
 return jsonb_build_object('items',items);end$$;
create function public.rights_recover(p_track uuid,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare c rights_private.cases;r jsonb;begin
 c:=rights_private.lock_case(p_track,public.is_admin());select result into r from rights_private.operations where track_id=p_track and key=p_key and actor_id=auth.uid();return jsonb_build_object('committed',r is not null,'result',r);end$$;
create function public.rights_list(p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$declare u uuid:=rights_private.actor(p_admin);begin
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title,'slug',slug,'state',public.rights_read(t.id,p_admin)->>'state') order by title) from (select id,title,slug from public.tracks where p_admin or artist_user_id=u order by updated_at desc limit 100)t),'[]');end$$;
create function rights_private.guard_document() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or (new.id,new.track_id,new.owner_id,new.kind,new.filename,new.declared_bytes,new.media_type,new.created_at,new.expires_at) is distinct from (old.id,old.track_id,old.owner_id,old.kind,old.filename,old.declared_bytes,old.media_type,old.created_at,old.expires_at) or (old.object_id is not null and (new.object_id,new.object_version,new.sha256) is distinct from(old.object_id,old.object_version,old.sha256)) then raise exception 'Immutable document identity' using errcode='42501';end if;return new;end$$;
create trigger document_identity before update or delete on rights_private.documents for each row execute function rights_private.guard_document();
do $$declare t text;f regprocedure;begin
 foreach t in array array['cases','documents','versions','decisions','events','operations','document_reviews'] loop
  execute format('alter table rights_private.%I enable row level security',t);execute format('alter table rights_private.%I force row level security',t);execute format('create policy trusted_owner on rights_private.%I to postgres using(true) with check(true)',t);
  if t not in('cases','documents') then execute format('create trigger immutable_rights before update or delete on rights_private.%I for each row execute function licensing_private.immutable()',t);end if;
 end loop;
end$$;
revoke all on all tables in schema rights_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema rights_private from public,anon,authenticated,service_role;
revoke all on all functions in schema rights_private from public,anon,authenticated,service_role;
revoke all on function licensing_private.check_offer_before_system04(uuid,timestamptz) from public,anon,authenticated,service_role;
do $$declare f regprocedure;begin
 for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('rights_save','rights_submit','rights_review','rights_document_reserve','rights_document_access','rights_document_restrict','rights_read','rights_list','rights_recover','rights_history','rights_document_withdraw') loop execute format('revoke all on function %s from public,anon,service_role',f);execute format('grant execute on function %s to authenticated',f);end loop;
end$$;
revoke all on function public.rights_document_server(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.rights_document_server(uuid,uuid,text,uuid,text) to service_role;
commit;
