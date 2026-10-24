-- System 02: private account preparation, immutable acknowledgment and audited profile editing.
-- Local additive migration only; no bucket or hosted configuration mutation.
begin;
create table if not exists public.artist_account_details (
 user_id uuid primary key references public.user_profiles(id) on delete restrict,
 identity jsonb not null default '{}'::jsonb, declarations jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default clock_timestamp()
);
create table if not exists public.artist_account_acceptances (
 id bigint generated always as identity primary key, user_id uuid not null references public.user_profiles(id) on delete restrict,
 notice_version text not null, notice_snapshot jsonb not null, accepted_at timestamptz not null default clock_timestamp(),
 unique(user_id,notice_version)
);
-- Audit identities remain stable even if an unused legacy account is removed.
-- A presentation-only audit must not create a new account-deletion restriction.
create table if not exists public.artist_account_events (
 id bigint generated always as identity primary key, user_id uuid not null,
 actor_id uuid, action text not null, snapshot jsonb not null, created_at timestamptz not null default clock_timestamp()
);
create table if not exists security_private.artist_onboarding_notices(version text primary key, document jsonb not null, created_at timestamptz not null default clock_timestamp());
revoke all on security_private.artist_onboarding_notices from public,anon,authenticated;
grant select,insert on security_private.artist_onboarding_notices to service_role;
insert into security_private.artist_onboarding_notices(version,document) values('artist-account-2026-10-23-v1',$notice${"version": "artist-account-2026-10-23-v1", "text": "I am authorized to provide these account and collaborator details. I have read the linked Terms of Use and Privacy Policy. I understand that master recording and composition/publishing rights are separate, these are account-level declarations only, and every track must pass its own rights and licensing review. Completing onboarding does not verify rights, approve a catalog, authorize a license, or enable payouts. The current Terms of Use are marked as draft and require legal approval before commercial use.", "documents": [{"path": "/terms", "version": "terms-placeholder-baseline-b87e943", "sourceSha256": "8269a58f313154f1ccb37b6851e29a42e5989e91fb8cd6566ba3f136783fc380", "status": "draft"}, {"path": "/privacy", "version": "privacy-2026-04-30", "sourceSha256": "94b9273c0ca2fc3dd2d9c057ea6c97605ca2df9cb8ff6188bd482c6c107f331a", "status": "published-copy-review-required"}]}$notice$::jsonb) on conflict(version) do nothing;
do $verify_notice$ begin
 if (select document from security_private.artist_onboarding_notices where version='artist-account-2026-10-23-v1') is distinct from $notice${"version": "artist-account-2026-10-23-v1", "text": "I am authorized to provide these account and collaborator details. I have read the linked Terms of Use and Privacy Policy. I understand that master recording and composition/publishing rights are separate, these are account-level declarations only, and every track must pass its own rights and licensing review. Completing onboarding does not verify rights, approve a catalog, authorize a license, or enable payouts. The current Terms of Use are marked as draft and require legal approval before commercial use.", "documents": [{"path": "/terms", "version": "terms-placeholder-baseline-b87e943", "sourceSha256": "8269a58f313154f1ccb37b6851e29a42e5989e91fb8cd6566ba3f136783fc380", "status": "draft"}, {"path": "/privacy", "version": "privacy-2026-04-30", "sourceSha256": "94b9273c0ca2fc3dd2d9c057ea6c97605ca2df9cb8ff6188bd482c6c107f331a", "status": "published-copy-review-required"}]}$notice$::jsonb then raise exception 'Onboarding notice version reused with different content' using errcode='22023';end if;
end $verify_notice$;

create or replace function security_private.artist_evidence_immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'Artist account evidence is append-only' using errcode='42501';end;$$;
revoke all on function security_private.artist_evidence_immutable() from public,anon,authenticated;
do $$declare name text;begin
 foreach name in array array['artist_account_acceptances','artist_account_events'] loop
  execute format('drop trigger if exists artist_evidence_immutable on public.%I',name);
  execute format('create trigger artist_evidence_immutable before update or delete on public.%I for each row execute function security_private.artist_evidence_immutable()',name);
 end loop;
end$$;
drop trigger if exists artist_evidence_immutable on security_private.artist_onboarding_notices;
create trigger artist_evidence_immutable before update or delete on security_private.artist_onboarding_notices for each row execute function security_private.artist_evidence_immutable();
do $$declare name text;begin
 foreach name in array array['artist_account_details','artist_account_acceptances','artist_account_events'] loop
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public,anon,authenticated',name);
  execute format('grant select on public.%I to authenticated',name);
  execute format('grant all on public.%I to service_role',name);
  execute format('drop policy if exists own_artist_account_read on public.%I',name);
  execute format('create policy own_artist_account_read on public.%I for select to authenticated using ((user_id=auth.uid() and public.current_app_role()=''artist'') or public.is_admin())',name);
 end loop;
end$$;
revoke all on sequence public.artist_account_acceptances_id_seq,public.artist_account_events_id_seq from public,anon,authenticated;
grant usage,select on sequence public.artist_account_acceptances_id_seq,public.artist_account_events_id_seq to service_role;

create or replace function security_private.validate_artist_account(p_kind text,p_data jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare k text; item jsonb; code text;
begin
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Invalid private artist details' using errcode='22023';end if;
 for k in select jsonb_object_keys(p_data) loop
  if (p_kind='identity' and k not in ('legalName','entityType','businessName','country','contactEmail')) or
    (p_kind='declarations' and k not in ('masterRights','publishingRights','collaboratorStatus','collaborators')) then raise exception 'Unsupported artist detail' using errcode='22023';end if;
  if k<>'collaborators' and (jsonb_typeof(p_data->k) is distinct from 'string' or p_data->>k is distinct from btrim(p_data->>k)) then raise exception 'Invalid artist detail' using errcode='22023';end if;
 end loop;
 if p_kind='identity' then
  if coalesce(length(p_data->>'legalName'),0) not between 2 and 120 or coalesce(p_data->>'entityType','') not in ('individual','company')
   or length(coalesce(p_data->>'businessName',''))>160 or (p_data->>'entityType'='company' and coalesce(length(p_data->>'businessName'),0)<2)
   or coalesce(p_data->>'contactEmail','')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or length(p_data->>'contactEmail')>254 then raise exception 'Complete the private legal identity and contact details' using errcode='22023';end if;
  if not coalesce(p_data->>'country','')=any(array['AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ','BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR','CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR','GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU','ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ','LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ','MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF','PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI','SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR','TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW']) then raise exception 'Choose a country' using errcode='22023';end if;
 elsif p_kind='declarations' then
  if coalesce(p_data->>'masterRights','') not in ('owner','representative','shared','none','unknown') or coalesce(p_data->>'publishingRights','') not in ('owner','representative','shared','none','unknown')
   or coalesce(p_data->>'collaboratorStatus','') not in ('solo','listed','unknown') or jsonb_typeof(p_data->'collaborators') is distinct from 'array' then raise exception 'Complete the separate rights declarations' using errcode='22023';end if;
  if jsonb_array_length(p_data->'collaborators')>20 or ((p_data->>'collaboratorStatus'='listed') is distinct from (jsonb_array_length(p_data->'collaborators')>0)) then raise exception 'List known collaborators or select solo / unknown' using errcode='22023';end if;
  for item in select value from jsonb_array_elements(p_data->'collaborators') loop
   if jsonb_typeof(item) is distinct from 'object' or (item-array['name','role'])<>'{}'::jsonb or jsonb_typeof(item->'name') is distinct from 'string'
    or coalesce(length(item->>'name'),0) not between 2 and 120 or item->>'name' is distinct from btrim(item->>'name')
    or coalesce(item->>'role','') not in ('master-owner','songwriter','publisher','administrator','other') then raise exception 'Invalid collaborator details' using errcode='22023';end if;
  end loop;
 else raise exception 'Unsupported private detail kind' using errcode='22023';end if;
end$$;
revoke all on function security_private.validate_artist_account(text,jsonb) from public,anon,authenticated;
grant execute on function security_private.validate_artist_account(text,jsonb) to service_role;

create or replace function security_private.require_artist_account_ready(p_actor uuid) returns void language plpgsql security invoker set search_path='' as $$
declare account public.artist_account_details%rowtype; current_version text;
begin
 select * into account from public.artist_account_details where user_id=p_actor for update;
 if not found then raise exception 'Complete private account preparation before finishing' using errcode='22023';end if;
 perform security_private.validate_artist_account('identity',account.identity);
 perform security_private.validate_artist_account('declarations',account.declarations);
 select version into current_version from security_private.artist_onboarding_notices order by created_at desc,version desc limit 1;
 if current_version is null or not exists(select 1 from public.artist_account_acceptances where user_id=p_actor and notice_version=current_version) then raise exception 'Read and acknowledge the current onboarding notice' using errcode='22023';end if;
end$$;
revoke all on function security_private.require_artist_account_ready(uuid) from public,anon,authenticated;
grant execute on function security_private.require_artist_account_ready(uuid) to service_role;

-- Public presentation writes retain existing ownership/RLS controls, while every
-- change advances the same optimistic version and leaves an immutable audit row.
create or replace function security_private.audit_artist_presentation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' and not (auth.uid()=new.user_id and public.current_app_role()='artist') and not public.is_admin() then raise exception 'Artist profile authority required' using errcode='42501';end if;
 if tg_op='UPDATE' and (new.artist_name,new.bio,new.location,new.website,new.instagram_url,new.spotify_url,new.youtube_url,new.social_links) is not distinct from (old.artist_name,old.bio,old.location,old.website,old.instagram_url,old.spotify_url,old.youtube_url,old.social_links) then return new;end if;
 update public.user_profiles set updated_at=clock_timestamp() where id=new.user_id;
 insert into public.artist_account_events(user_id,actor_id,action,snapshot) values(new.user_id,auth.uid(),'presentation_saved',jsonb_build_object('artistName',new.artist_name,'bio',new.bio,'location',new.location,'website',new.website,'instagram',new.instagram_url,'spotify',new.spotify_url,'youtube',new.youtube_url));
 return new;
end$$;
revoke all on function security_private.audit_artist_presentation() from public,anon,authenticated;
drop trigger if exists audit_artist_presentation on public.artist_profiles;
create trigger audit_artist_presentation after insert or update on public.artist_profiles for each row execute function security_private.audit_artist_presentation();

create or replace function security_private.validate_artist_onboarding_fields(p_step text,p_data jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare allowed text[]; k text; v text;
begin
 if p_step is null or p_step not in ('basics','profile','licensing','first-track') then
  raise exception 'Unsupported onboarding step.' using errcode='22023';
 end if;
 allowed := case p_step when 'basics' then array['fullName','artistName']
 when 'profile' then array['bio','location','website','instagram','spotify','youtube']
 when 'licensing' then array['payoutEmail','defaultLicensingPreferences']
 else array['firstTrackChoice'] end;
 if jsonb_typeof(p_data) is distinct from 'object' then
  raise exception 'Invalid onboarding fields.' using errcode='22023';
 end if;
 for k,v in select key,value from jsonb_each_text(p_data) loop
  if not (k=any(allowed)) or jsonb_typeof(p_data->k) is distinct from 'string' then
   raise exception 'Unsupported onboarding fields.' using errcode='22023';
  end if;
  if v is distinct from btrim(v) then raise exception 'Trim onboarding fields.' using errcode='22023'; end if;
 end loop;
 if p_step='basics' and (coalesce(length(p_data->>'fullName'),0) not between 2 and 120
    or coalesce(length(p_data->>'artistName'),0) not between 2 and 120) then
  raise exception 'Full name and artist name are required (2-120 characters).' using errcode='22023';
 elsif p_step='profile' then
  if coalesce(length(p_data->>'bio'),0) not between 24 and 5000 or coalesce(length(p_data->>'location'),0) not between 2 and 120 then
   raise exception 'Bio (24-5000 characters) and location (2-120 characters) are required.' using errcode='22023';
  end if;
  foreach k in array array['website','spotify','youtube'] loop
   v:=p_data->>k;
   if v is not null and v<>'' and (length(v)>2048 or v!~'^https?://[^[:space:]/?#]+[^[:space:]]*$') then
    raise exception 'Enter valid full http(s) links.' using errcode='22023';
   end if;
  end loop;
  if length(coalesce(p_data->>'instagram',''))>120 then raise exception 'Instagram handle is too long.' using errcode='22023'; end if;
 elsif p_step='licensing' and ((coalesce(p_data->>'payoutEmail','')<>'' and coalesce(p_data->>'payoutEmail','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
     or length(p_data->>'payoutEmail')>254 or length(coalesce(p_data->>'defaultLicensingPreferences',''))>3000) then
  raise exception 'A valid payout email and bounded preferences are required.' using errcode='22023';
 elsif p_step='first-track' and coalesce(p_data->>'firstTrackChoice','') not in ('upload','later') then
  raise exception 'Choose upload or later.' using errcode='22023';
 end if;
end;$$;
revoke all on function security_private.validate_artist_onboarding_fields(text,jsonb) from public,anon,authenticated;
grant execute on function security_private.validate_artist_onboarding_fields(text,jsonb) to service_role;



create or replace function public.save_artist_account_step(
 p_actor uuid,p_expected timestamptz,p_step text,p_public jsonb,p_private jsonb,
 p_avatar text default null,p_remove_avatar boolean default false,p_notice_version text default null,p_accept boolean default false
) returns timestamptz language plpgsql security invoker set search_path='' as $$
declare prior public.user_profiles%rowtype; detail public.artist_account_details%rowtype; notice jsonb; version text; result_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted artist workflow required' using errcode='42501';end if;
 select * into prior from public.user_profiles where id=p_actor for update;
 if not found or prior.role is distinct from 'artist' then raise exception 'Canonical artist required' using errcode='42501';end if;
 if p_expected is null or prior.updated_at is distinct from p_expected then raise exception 'Profile changed. Reload before saving.' using errcode='PT409';end if;
 if p_step not in ('basics','profile','licensing','first-track','edit') or p_step is null then raise exception 'Unsupported account step' using errcode='22023';end if;
 if jsonb_typeof(p_private) is distinct from 'object' or jsonb_typeof(p_public) is distinct from 'object' then raise exception 'Invalid account payload' using errcode='22023';end if;
 if p_remove_avatar and p_step not in ('basics','edit') then raise exception 'Image removal belongs to profile basics' using errcode='22023';end if;
 if p_remove_avatar and p_avatar is not null then raise exception 'Choose replace or remove image' using errcode='22023';end if;
 if p_step='edit' then
  if prior.onboarding_completed_at is null then raise exception 'Finish onboarding before editing the workspace profile' using errcode='22023';end if;
  perform security_private.validate_artist_onboarding_fields('basics',p_public-array['bio','location','website','instagram','spotify','youtube','defaultLicensingPreferences']);
  perform security_private.validate_artist_onboarding_fields('profile',p_public-array['fullName','artistName','defaultLicensingPreferences']);
  if (p_public-array['fullName','artistName','bio','location','website','instagram','spotify','youtube','defaultLicensingPreferences'])<>'{}'::jsonb or length(coalesce(p_public->>'defaultLicensingPreferences',''))>3000 then raise exception 'Unsupported public profile data' using errcode='22023';end if;
  if (p_private-array['identity','declarations'])<>'{}'::jsonb then raise exception 'Unsupported private profile data' using errcode='22023';end if;
  perform security_private.validate_artist_account('identity',p_private->'identity');
  perform security_private.validate_artist_account('declarations',p_private->'declarations');
  if p_avatar is not null and (p_avatar !~ ('^'||p_actor::text||'/profile/[0-9]{13}-[0-9a-f-]+[.](jpg|jpeg|png|webp)$') or not exists(select 1 from storage.objects where bucket_id='avatars' and name=p_avatar)) then raise exception 'Verified owned avatar required' using errcode='42501';end if;
  update public.artist_profiles set artist_name=p_public->>'artistName',bio=p_public->>'bio',location=p_public->>'location',website=nullif(p_public->>'website',''),instagram_url=nullif(p_public->>'instagram',''),spotify_url=nullif(p_public->>'spotify',''),youtube_url=nullif(p_public->>'youtube',''),
   social_links=jsonb_strip_nulls(jsonb_build_object('instagram',nullif(p_public->>'instagram',''),'spotify',nullif(p_public->>'spotify',''),'youtube',nullif(p_public->>'youtube',''))),default_licensing_preferences=nullif(p_public->>'defaultLicensingPreferences','') where user_id=p_actor;
  if not found then raise exception 'Artist profile is unavailable' using errcode='22023';end if;
  update public.user_profiles set full_name=p_public->>'fullName',onboarding_payload=(coalesce(onboarding_payload,'{}')-'payoutEmail'-'avatarPath'-'avatarUrl'-'avatar_path'-'avatar_url')||p_public,avatar_path=coalesce(p_avatar,avatar_path),avatar_url=case when p_avatar is not null then null else avatar_url end,updated_at=clock_timestamp() where id=p_actor;
 else
  if p_step in ('basics','licensing') then perform security_private.validate_artist_account(case when p_step='basics' then 'identity' else 'declarations' end,p_private);
  elsif p_private<>'{}'::jsonb then raise exception 'Private details do not belong to this step' using errcode='22023';end if;
  perform public.save_artist_onboarding_atomic(p_actor,p_expected,p_step,p_public,p_avatar);
 end if;
 if p_step in ('basics','licensing','edit') then
  insert into public.artist_account_details(user_id,identity,declarations) values(p_actor,case when p_step='basics' then p_private when p_step='edit' then p_private->'identity' else '{}' end,case when p_step='licensing' then p_private when p_step='edit' then p_private->'declarations' else '{}' end)
  on conflict(user_id) do update set identity=case when p_step in ('basics','edit') then excluded.identity else artist_account_details.identity end,declarations=case when p_step in ('licensing','edit') then excluded.declarations else artist_account_details.declarations end,updated_at=clock_timestamp();
 end if;
 if p_step in ('licensing','edit') then
  select n.version,n.document into version,notice from security_private.artist_onboarding_notices n order by created_at desc,n.version desc limit 1;
  if p_accept then
   if p_notice_version is distinct from version then raise exception 'Onboarding notice changed. Reload and review.' using errcode='PT409';end if;
   insert into public.artist_account_acceptances(user_id,notice_version,notice_snapshot) values(p_actor,version,notice) on conflict(user_id,notice_version) do nothing;
  elsif not exists(select 1 from public.artist_account_acceptances where user_id=p_actor and notice_version=version) then raise exception 'Read and acknowledge the onboarding notice' using errcode='22023';end if;
 end if;
 if p_remove_avatar then update public.user_profiles set avatar_path=null,avatar_url=null,updated_at=clock_timestamp() where id=p_actor;end if;
 insert into public.artist_account_events(user_id,actor_id,action,snapshot) values(p_actor,p_actor,case when p_step='edit' then 'account_profile_edited' else 'onboarding_'||p_step end,jsonb_build_object('identity',(select identity from public.artist_account_details where user_id=p_actor),'declarations',(select declarations from public.artist_account_details where user_id=p_actor),'noticeVersion',p_notice_version,'priorAvatarPath',prior.avatar_path,'avatarPath',(select avatar_path from public.user_profiles where id=p_actor)));
 select updated_at into result_at from public.user_profiles where id=p_actor;
 return result_at;
end$$;
revoke all on function public.save_artist_account_step(uuid,timestamptz,text,jsonb,jsonb,text,boolean,text,boolean) from public,anon,authenticated;
grant execute on function public.save_artist_account_step(uuid,timestamptz,text,jsonb,jsonb,text,boolean,text,boolean) to service_role;

create or replace function public.complete_artist_onboarding_atomic(p_actor_id uuid,p_expected_updated_at timestamptz)
returns timestamptz language plpgsql security invoker set search_path='' as $$
declare prior public.user_profiles%rowtype; artist public.artist_profiles%rowtype; done_at timestamptz;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted artist workflow required.' using errcode='42501'; end if;
 select * into prior from public.user_profiles where id=p_actor_id for update;
 if not found or prior.role is distinct from 'artist' then raise exception 'Canonical artist access required.' using errcode='42501'; end if;
 if prior.onboarding_completed_at is null then perform security_private.require_artist_account_ready(p_actor_id); end if;
 select * into artist from public.artist_profiles where user_id=p_actor_id for update;
 if not found or prior.onboarding_step is distinct from 'complete' then raise exception 'Complete every artist onboarding step first.' using errcode='22023'; end if;
 perform security_private.validate_artist_onboarding_fields('basics',jsonb_build_object('fullName',prior.full_name,'artistName',artist.artist_name));
 perform security_private.validate_artist_onboarding_fields('profile',jsonb_build_object('bio',artist.bio,'location',artist.location,
   'website',coalesce(artist.website,''),'instagram',coalesce(artist.instagram_url,''),'spotify',coalesce(artist.spotify_url,''),'youtube',coalesce(artist.youtube_url,'')));
 perform security_private.validate_artist_onboarding_fields('licensing',jsonb_build_object('payoutEmail',artist.payout_email,'defaultLicensingPreferences',coalesce(artist.default_licensing_preferences,'')));
 perform security_private.validate_artist_onboarding_fields('first-track',jsonb_build_object('firstTrackChoice',prior.onboarding_payload->>'firstTrackChoice'));
 if prior.onboarding_completed_at is not null then return prior.onboarding_completed_at; end if;
 if p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at then raise exception 'Onboarding changed. Reload before completing.' using errcode='PT409'; end if;
 update public.user_profiles set onboarding_completed_at=clock_timestamp(),updated_at=clock_timestamp() where id=p_actor_id returning onboarding_completed_at into done_at;
 return done_at;
end;$$;
revoke all on function public.complete_artist_onboarding_atomic(uuid,timestamptz) from public,anon,authenticated;
grant execute on function public.complete_artist_onboarding_atomic(uuid,timestamptz) to service_role;


commit;
