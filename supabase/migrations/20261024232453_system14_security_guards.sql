-- System14: fail closed on NULL canonical roles and revoked media sessions.
-- Additive definitions only; no historical evidence or hosted state is changed.
begin;
set local lock_timeout='5s';

create or replace function public.auth_session_is_active() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.sec_account_allowed() and exists(select 1 from auth.sessions s where s.user_id=auth.uid()
 and s.id::text=auth.jwt()->>'session_id' and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>statement_timestamp())
 and (public.current_app_role() is distinct from 'admin' or to_jsonb(s)->>'created_at' is null or (to_jsonb(s)->>'created_at')::timestamptz>statement_timestamp()-interval '8 hours'))
$$;

create or replace function sec_private.can(p_cap text) returns boolean language plpgsql stable security definer set search_path='' as $$declare d jsonb;begin
 if p_cap not in('founder','full_admin','users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents','audit') or p_cap is null then return false;end if;
 if auth.role() is distinct from 'authenticated' or public.current_app_role() is distinct from 'admin' or auth.jwt()->>'aal' is distinct from 'aal2' or not public.auth_session_is_active() then return false;end if;
 if p_cap='founder' then return exists(select 1 from sec_private.founder where user_id=auth.uid());end if;
 d:=sec_private.latest('permissions',auth.uid());
 if d is null then return not exists(select 1 from sec_private.founder) or exists(select 1 from sec_private.founder where user_id=auth.uid());end if; -- Existing canonical Admins retain their baseline operational access, not founder authority.
 return coalesce(d->>'status'='active' and (d->>'expiresAt')::timestamptz>statement_timestamp() and ((d->'capabilities') ? p_cap or (d->'capabilities') ? 'full_admin'),false);
end$$;

create or replace function public.sec_context() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or public.current_app_role() is distinct from 'admin' or auth.jwt()->>'aal' is distinct from 'aal2' or not public.auth_session_is_active() then raise exception 'Canonical active MFA Admin required' using errcode='42501';end if;
 return jsonb_build_object('actorId',auth.uid(),'founder',sec_private.can('founder'),'capabilities',(select jsonb_agg(c) from unnest(array['full_admin','users','support','integrity','deals','subscriptions','settings','organizations','incidents','audit']) c where sec_private.can(c)),'founderBinding',case when exists(select 1 from sec_private.founder) then 'bound' else 'pending' end);
end$$;

create or replace function public.sec_customer_command(p_module text,p_id uuid,p_expected bigint,p_request uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r text:=public.current_app_role();d jsonb;old jsonb;rev bigint;owner uuid;h text;op sec_private.operations;result jsonb;t public.tracks;begin
 if auth.role() is distinct from 'authenticated' or (r is null or r not in('buyer','artist')) or not public.auth_session_is_active() then raise exception 'Active canonical customer required' using errcode='42501';end if;
 if p_module not in('support','deals') or p_id is null or p_request is null or p_expected is null or p_expected<0 then raise exception 'Invalid customer request';end if;
 perform sec_private.keys(p_data,case when p_module='support' then array['title','category','message','orderId','trackId'] else array['title','trackId','message'] end);
 if length(coalesce(p_data->>'message','')) not between 5 and 4000 then raise exception 'Bounded message required';end if;
 perform pg_advisory_xact_lock(hashtextextended('sec-request:'||u::text||p_request::text,0));
 h:=encode(extensions.digest(jsonb_build_array(p_module,p_id,p_expected,p_action,p_data)::text,'sha256'),'hex');select * into op from sec_private.operations where actor_id=u and request_id=p_request;
 if found then if op.request_hash<>h then raise exception 'Conflicting customer request';end if;return op.result;end if;
 perform pg_advisory_xact_lock(hashtextextended('sec-entity:'||p_module||p_id::text,0));
 select data,revision,owner_id into old,rev,owner from sec_private.revisions where module=p_module and entity_id=p_id order by revision desc limit 1;rev:=coalesce(rev,0);
 if rev<>p_expected then raise exception 'Stale SEC revision' using errcode='40001';end if;
 if p_module='deals' and ((p_action='create' and sec_private.pause('custom_licensing_pause')) or(p_action='message' and sec_private.pause('messaging_pause'))) then raise exception 'Deal workflow paused' using errcode='42501';end if;
 if rev=0 then
  if p_action<>'create' or length(coalesce(p_data->>'title','')) not between 3 and 200 then raise exception 'New request title required';end if;owner:=u;
  if p_module='support' then
   if p_data->>'category' is null or p_data->>'category' not in('buyer','artist','licensing','payment','delivery','rights','security','account') then raise exception 'Support category required';end if;
   if p_data->>'orderId' is not null and not exists(select 1 from public.orders ord join public.tracks tr on tr.id=ord.track_id where ord.id=(p_data->>'orderId')::uuid and (ord.buyer_user_id=u or tr.artist_user_id=u)) then raise exception 'Owned order required' using errcode='42501';end if;
   if p_data->>'trackId' is not null and not exists(select 1 from public.tracks where id=(p_data->>'trackId')::uuid and artist_user_id=u) then raise exception 'Owned track required' using errcode='42501';end if;
   d:=p_data||jsonb_build_object('status','new');
  else
   select * into t from public.tracks where id=(p_data->>'trackId')::uuid;
   if r is distinct from 'buyer' or t.id is null or not catalog_private.visible(t.id) then raise exception 'Published track and Buyer required';end if;
   d:=p_data||jsonb_build_object('buyerId',u,'sellerId',t.artist_user_id,'stage','inquiry');
  end if;
 else
  if p_action<>'message' or not (owner=u or (p_module='deals' and old->>'sellerId'=u::text)) then raise exception 'Conversation participant required' using errcode='42501';end if;
  perform sec_private.keys(p_data,array['message']);d:=old||p_data;
 end if;
 insert into sec_private.revisions(module,entity_id,revision,owner_id,data,actor_id,action,reason,reference,request_id) values(p_module,p_id,rev+1,owner,d,u,p_action,'Customer request','Authenticated customer',p_request);
 result:=jsonb_build_object('id',p_id,'revision',rev+1,'recorded',true);perform sec_private.log(p_action,p_module,p_id::text,null,jsonb_build_object('revision',rev+1),'Customer request',p_request::text);
 insert into sec_private.operations values(u,p_request,h,result);return result;
end$$;

create or replace function public.sec_read(p_module text,p_page integer default 1,p_search text default '',p_status text default '',p_sort text default 'newest') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;customer boolean:=not sec_private.can(p_module);begin
 if p_page is null or p_page not between 1 and 10000 or p_search is null or length(p_search)>200 or p_status is null or length(p_status)>80 or p_sort not in('newest','oldest') then raise exception 'Bounded SEC query required';end if;
 if p_module not in('users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents','audit') then raise exception 'Unknown SEC module';end if;
 if customer and (p_module not in('support','deals') or auth.role() is distinct from 'authenticated' or (public.current_app_role() is null or public.current_app_role() not in('artist','buyer')) or not public.auth_session_is_active()) then raise exception 'SEC permission denied' using errcode='42501';end if;
 if p_module='audit' then
  select count(*) into n from sec_private.audit where (p_search='' or entity_id ilike '%'||p_search||'%' or action ilike '%'||p_search||'%');
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select * from sec_private.audit where (p_search='' or entity_id ilike '%'||p_search||'%' or action ilike '%'||p_search||'%') order by case when p_sort='newest' then id end desc,case when p_sort='oldest' then id end asc limit 25 offset(p_page-1)*25)x;
 else
  with latest as(select distinct on(entity_id) * from sec_private.revisions where module=p_module order by entity_id,revision desc)
  select count(*) into n from latest where (not customer or owner_id=auth.uid() or (p_module='deals' and data->>'sellerId'=auth.uid()::text)) and (p_search='' or entity_id::text ilike '%'||p_search||'%' or data->>'title' ilike '%'||p_search||'%') and (p_status='' or coalesce(data->>'status',data->>'stage')=p_status);
  with latest as(select distinct on(entity_id) * from sec_private.revisions where module=p_module order by entity_id,revision desc)
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into rows from(select entity_id as id,revision,owner_id,created_at,
  case when customer then data-array['internalNote','message','assignee','billingReference'] else data end as data,
  case when p_module='subscriptions' then jsonb_build_object('billingVerified',false,'effectiveEntitlements',case when data->>'status'='complimentary' and (data->>'expiresAt')::timestamptz>statement_timestamp() and sec_private.account_allowed(entity_id) then coalesce(data->'entitlements','[]') else '[]'::jsonb end,'grantExpired',coalesce(data->>'status'='complimentary' and (data->>'expiresAt')::timestamptz<=statement_timestamp(),false)) else null end as effective,
  (select coalesce(jsonb_agg(jsonb_build_object('revision',z.revision,'actorId',z.actor_id,'action',z.action,'at',z.created_at,'message',case when not customer or z.action in('create','message','reply') then z.data->>'message' end,'reason',case when not customer then z.reason end) order by z.revision),'[]') from (select * from sec_private.revisions where module=p_module and entity_id=l.entity_id order by revision desc limit 100) z) as history
  from latest l where (not customer or owner_id=auth.uid() or (p_module='deals' and data->>'sellerId'=auth.uid()::text)) and (p_search='' or entity_id::text ilike '%'||p_search||'%' or data->>'title' ilike '%'||p_search||'%') and (p_status='' or coalesce(data->>'status',data->>'stage')=p_status)
  order by case when p_sort='newest' then sequence end desc,case when p_sort='oldest' then sequence end asc limit 25 offset(p_page-1)*25)x;
 end if;
 return jsonb_build_object('items',rows,'total',n,'page',p_page,'pageSize',25,'customer',customer,'proposedPlans',case when p_module='subscriptions' then jsonb_build_array(jsonb_build_object('plan','free','priceMinor',null,'approval','unverified'),jsonb_build_object('plan','pro','priceMinor','1999','currency','USD','interval','month','approval','proposed'),jsonb_build_object('plan','teams','priceMinor','4999','currency','USD','interval','month','approval','proposed')) else null end);
end$$;

create or replace function submission_media.require_actor(p_role text) returns uuid language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or not sec_private.account_allowed(auth.uid()) then raise exception 'Account restricted' using errcode='42501';end if;return submission_media.require_actor_before_system11(p_role);end$$;

create or replace function public.analytics_preferences(p_consent boolean default null,p_notice text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c analytics_private.configuration;p analytics_private.preferences;begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or (public.current_app_role() is null or public.current_app_role() not in('artist','buyer','admin')) then raise exception 'Active canonical account required' using errcode='42501';end if;
 select * into strict c from analytics_private.configuration;
 if p_consent is not null then
  if p_notice is distinct from c.notice_version then raise exception 'Current analytics notice required' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('analytics-consent:'||auth.uid()::text,0));
  insert into analytics_private.preferences(user_id,consented,notice_version,source) values(auth.uid(),p_consent,p_notice,'account')
  on conflict(user_id) do update set consented=excluded.consented,notice_version=excluded.notice_version,source='account',changed_at=clock_timestamp();
  if not p_consent then delete from public.analytics_outbox where actor_id=auth.uid();end if;
 end if;
 select * into p from analytics_private.preferences where user_id=auth.uid();
 return jsonb_build_object('consented',coalesce(p.consented and p.notice_version=c.notice_version,false),'noticeVersion',c.notice_version,'deliveryEnabled',c.enabled and c.privacy_approved,'retentionDays',c.retention_days,'changedAt',p.changed_at);
end$$;

create or replace function public.notification_preferences(p_operational boolean default null,p_marketing boolean default null,p_notice text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare p notifications_private.preferences;begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or (public.current_app_role() is null or public.current_app_role() not in('artist','buyer','admin')) then raise exception 'Active canonical account required' using errcode='42501';end if;
 if p_operational is not null or p_marketing is not null then
 if p_notice is distinct from 'notifications-v1' then raise exception 'Current notification notice required';end if;
 insert into notifications_private.preferences(user_id,operational,marketing) values(auth.uid(),coalesce(p_operational,true),coalesce(p_marketing,false)) on conflict(user_id) do update set operational=coalesce(p_operational,notifications_private.preferences.operational),marketing=coalesce(p_marketing,notifications_private.preferences.marketing),changed_at=clock_timestamp();
 end if;
 select * into p from notifications_private.preferences where user_id=auth.uid();
 return jsonb_build_object('operational',coalesce(p.operational,true),'marketing',coalesce(p.marketing,false),'essential',true,'notice','notifications-v1','sendingEnabled',(select enabled from notifications_private.configuration));
end$$;

create or replace function security_private.audit_artist_presentation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' and (auth.uid()=new.user_id and public.current_app_role()='artist') is distinct from true and not public.is_admin() then raise exception 'Artist profile authority required' using errcode='42501';end if;
 if tg_op='UPDATE' and (new.artist_name,new.bio,new.location,new.website,new.instagram_url,new.spotify_url,new.youtube_url,new.social_links) is not distinct from (old.artist_name,old.bio,old.location,old.website,old.instagram_url,old.spotify_url,old.youtube_url,old.social_links) then return new;end if;
 update public.user_profiles set updated_at=clock_timestamp() where id=new.user_id;
 insert into public.artist_account_events(user_id,actor_id,action,snapshot) values(new.user_id,auth.uid(),'presentation_saved',jsonb_build_object('artistName',new.artist_name,'bio',new.bio,'location',new.location,'website',new.website,'instagram',new.instagram_url,'spotify',new.spotify_url,'youtube',new.youtube_url));
 return new;
end$$;

-- Recovery proof is issued only after the server verifies a literal recovery OTP.
-- Plaintext provider tokens and the random browser proof are never persisted.
create schema auth_security_private;
revoke all on schema auth_security_private from public,anon,authenticated,service_role;
create table auth_security_private.recovery_grants(
 proof_hash text primary key check(proof_hash ~ '^[0-9a-f]{64}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null,
 issued_at timestamptz not null default statement_timestamp(),
 expires_at timestamptz not null default statement_timestamp()+interval '15 minutes',
 consumed_at timestamptz,
 check(expires_at>issued_at and expires_at<=issued_at+interval '15 minutes')
);
alter table auth_security_private.recovery_grants enable row level security;
alter table auth_security_private.recovery_grants force row level security;
create policy trusted_owner on auth_security_private.recovery_grants to postgres using(true) with check(true);
revoke all on auth_security_private.recovery_grants from public,anon,authenticated,service_role;
create function public.auth_issue_recovery_grant(p_user uuid,p_session uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' then raise exception 'Trusted recovery verification required' using errcode='42501';end if;
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' or not exists(select 1 from auth.sessions s where s.id=p_session and s.user_id=p_user and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>statement_timestamp())) or not sec_private.account_allowed(p_user) then raise exception 'Recovery session unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('recovery:'||p_session::text,0));
 update auth_security_private.recovery_grants set consumed_at=clock_timestamp() where session_id=p_session and consumed_at is null;
 insert into auth_security_private.recovery_grants(proof_hash,user_id,session_id) values(p_hash,p_user,p_session);
 return true;
end$$;
create function public.auth_recovery_ready(p_proof text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.role()='authenticated' and public.auth_session_is_active() and p_proof ~ '^[0-9a-f]{64}$' and exists(select 1 from auth_security_private.recovery_grants g where g.proof_hash=encode(extensions.digest(p_proof,'sha256'),'hex') and g.user_id=auth.uid() and g.session_id::text=auth.jwt()->>'session_id' and g.consumed_at is null and g.expires_at>statement_timestamp()),false)
$$;
create function public.auth_consume_recovery_grant(p_proof text) returns boolean language plpgsql security definer set search_path='' as $$declare used text;begin
 if not public.auth_recovery_ready(p_proof) then return false;end if;
 update auth_security_private.recovery_grants g set consumed_at=clock_timestamp() where g.proof_hash=encode(extensions.digest(p_proof,'sha256'),'hex') and g.user_id=auth.uid() and g.session_id::text=auth.jwt()->>'session_id' and g.consumed_at is null and g.expires_at>statement_timestamp() returning proof_hash into used;
 return used is not null;
end$$;
revoke all on function public.auth_issue_recovery_grant(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.auth_issue_recovery_grant(uuid,uuid,text) to service_role;
revoke all on function public.auth_recovery_ready(text),public.auth_consume_recovery_grant(text) from public,anon,authenticated,service_role;
grant execute on function public.auth_recovery_ready(text),public.auth_consume_recovery_grant(text) to authenticated;


-- Direct PostgREST/Storage APIs must respect provider session revocation too.
-- These restrictive fences add no grants and leave anonymous public delivery
-- and explicit service-role workflows unchanged. Do not change Storage ownership.
do $$declare t record;begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
  execute format('create policy system14_active_session on public.%I as restrictive for all to authenticated using ((select public.auth_session_is_active())) with check ((select public.auth_session_is_active()))',t.tablename);
 end loop;
end$$;
create policy system14_active_session on storage.objects as restrictive for all to authenticated
 using ((select public.auth_session_is_active())) with check ((select public.auth_session_is_active()));
create or replace function public.get_own_artist_finance() returns table(payout_email text) language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or public.current_app_role() is distinct from 'artist' then raise exception 'Active Artist finance access required.' using errcode='42501';end if;
 return query select p.payout_email from public.artist_profiles p where p.user_id=auth.uid();
end$$;

commit;
