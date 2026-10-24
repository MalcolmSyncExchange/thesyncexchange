-- System 11: local SEC operations. No activation, hosted changes or new billing products.
begin;
set local lock_timeout='5s';
create schema sec_private;
revoke all on schema sec_private from public,anon,authenticated,service_role;
create table sec_private.revisions(
 sequence bigint generated always as identity primary key,
 module text not null check(module in('users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents')),
 entity_id uuid not null, revision bigint not null check(revision>0),owner_id uuid references public.user_profiles(id),
 data jsonb not null check(jsonb_typeof(data)='object'),actor_id uuid not null references public.user_profiles(id),
 action text not null,reason text not null check(length(reason) between 5 and 2000),reference text not null check(length(reference) between 3 and 500),
 request_id uuid not null,created_at timestamptz not null default clock_timestamp(),unique(module,entity_id,revision),unique(actor_id,request_id)
);
create index sec_latest on sec_private.revisions(module,entity_id,revision desc);
create table sec_private.operations(actor_id uuid not null,request_id uuid not null,request_hash text not null,result jsonb not null,primary key(actor_id,request_id));
create table sec_private.audit(
 id bigint generated always as identity primary key,actor_id uuid,action text not null,entity_type text not null,entity_id text not null,
 before_state jsonb,after_state jsonb,auth_evidence jsonb not null,reason text not null,outcome text not null,
 request_id text,recorded_at timestamptz not null default clock_timestamp(),digest text not null
);
create table sec_private.revoked_sessions(session_id uuid primary key,user_id uuid not null,reason text not null,revoked_at timestamptz not null default clock_timestamp());
create table sec_private.founder(user_id uuid primary key references public.user_profiles(id),approval_reference text not null,created_at timestamptz not null default clock_timestamp());
create function sec_private.immutable() returns trigger language plpgsql set search_path='' as $$begin raise exception 'SEC evidence is immutable' using errcode='42501';end$$;
do $$declare t text;begin foreach t in array array['revisions','operations','audit','revoked_sessions','founder'] loop
 execute format('alter table sec_private.%I enable row level security',t);execute format('alter table sec_private.%I force row level security',t);
 execute format('create policy trusted_owner on sec_private.%I to postgres using(true) with check(true)',t);
 execute format('revoke all on sec_private.%I from public,anon,authenticated,service_role',t);
 execute format('create trigger retain_sec before update or delete on sec_private.%I for each row execute function sec_private.immutable()',t);
 end loop;end$$;
create function sec_private.latest(p_module text,p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select data from sec_private.revisions where module=p_module and entity_id=p_id order by revision desc limit 1
$$;
create function sec_private.account_allowed(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user is not null and coalesce(sec_private.latest('users',p_user)->>'status','active')='active'
$$;
create function sec_private.admin_access_active(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from sec_private.founder where user_id=p_user) or
 (sec_private.latest('permissions',p_user) is null and not exists(select 1 from sec_private.founder)) or
 coalesce(sec_private.latest('permissions',p_user)->>'status'='active' and (sec_private.latest('permissions',p_user)->>'expiresAt')::timestamptz>statement_timestamp(),false)
$$;
-- Restriction checks add a fence; they do not grant access or replace existing ownership RLS.
create function public.sec_account_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select sec_private.account_allowed(auth.uid()) and (public.current_app_role() is distinct from 'admin' or sec_private.admin_access_active(auth.uid())) and not exists(select 1 from sec_private.revoked_sessions where session_id::text=auth.jwt()->>'session_id')
$$;
create or replace function public.auth_session_is_active() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and public.sec_account_allowed() and exists(select 1 from auth.sessions s where s.user_id=auth.uid()
 and s.id::text=auth.jwt()->>'session_id' and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>statement_timestamp())
 and (public.current_app_role()<>'admin' or to_jsonb(s)->>'created_at' is null or (to_jsonb(s)->>'created_at')::timestamptz>statement_timestamp()-interval '8 hours'))
$$;
create function sec_private.can(p_cap text) returns boolean language plpgsql stable security definer set search_path='' as $$declare d jsonb;begin
 if p_cap not in('founder','full_admin','users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents','audit') or p_cap is null then return false;end if;
 if auth.role()<>'authenticated' or public.current_app_role()<>'admin' or auth.jwt()->>'aal' is distinct from 'aal2' or not public.auth_session_is_active() then return false;end if;
 if p_cap='founder' then return exists(select 1 from sec_private.founder where user_id=auth.uid());end if;
 d:=sec_private.latest('permissions',auth.uid());
 if d is null then return not exists(select 1 from sec_private.founder) or exists(select 1 from sec_private.founder where user_id=auth.uid());end if; -- Existing canonical Admins retain their baseline operational access, not founder authority.
 return coalesce(d->>'status'='active' and (d->>'expiresAt')::timestamptz>statement_timestamp() and ((d->'capabilities') ? p_cap or (d->'capabilities') ? 'full_admin'),false);
end$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select sec_private.can('full_admin') $$;
create function public.sec_has_capability(p_cap text) returns boolean language sql stable security definer set search_path='' as $$ select sec_private.can(p_cap) $$;
create function sec_private.step_up() returns void language plpgsql stable security definer set search_path='' as $$begin
 if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a where a->>'method' in('totp','webauthn')
 and (a->>'timestamp') ~ '^[0-9]{1,12}$' and (a->>'timestamp')::bigint between extract(epoch from statement_timestamp())::bigint-300 and extract(epoch from statement_timestamp())::bigint+30)
 then raise exception 'Fresh MFA step-up required' using errcode='42501';end if;
end$$;
create function sec_private.log(p_action text,p_module text,p_id text,p_before jsonb,p_after jsonb,p_reason text,p_request text,p_outcome text default 'applied') returns void language plpgsql security definer set search_path='' as $$declare a jsonb;t timestamptz:=clock_timestamp();v jsonb;begin
 a:=jsonb_build_object('role',public.current_app_role(),'aal',auth.jwt()->>'aal','sessionHash',encode(extensions.digest(coalesce(auth.jwt()->>'session_id',''),'sha256'),'hex'),'sourceRole',auth.role());
 v:=jsonb_build_object('actor',auth.uid(),'action',p_action,'module',p_module,'id',p_id,'before',p_before,'after',p_after,'authorization',a,'reason',p_reason,'request',p_request,'outcome',p_outcome,'at',t);
 insert into sec_private.audit(actor_id,action,entity_type,entity_id,before_state,after_state,auth_evidence,reason,outcome,request_id,recorded_at,digest)
 values(auth.uid(),p_action,p_module,p_id,p_before,p_after,a,p_reason,p_outcome,p_request,t,encode(extensions.digest(v::text,'sha256'),'hex'));
end$$;
-- Initial founder binding has no application route. Requires separately approved trusted provisioning.
create function public.sec_bind_founder(p_user uuid,p_reference text) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.role()<>'service_role' then raise exception 'Trusted provisioning required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('sec-founder',0));
 if exists(select 1 from sec_private.founder) or not exists(select 1 from public.user_profiles where id=p_user and role='admin') or length(p_reference) not between 10 and 500 then raise exception 'Founder binding requires verified canonical Admin and unique approval';end if;
 insert into sec_private.founder values(p_user,p_reference,clock_timestamp());perform sec_private.log('founder_bound','permissions',p_user::text,null,jsonb_build_object('userId',p_user),p_reference,null);
end$$;
-- Canonical Admin is never self-assigned through profile updates, even by another Admin.
-- Provisioning remains an explicit service-role workflow; SEC grants only restrict already canonical Admins.
create or replace function public.guard_user_profile_write() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' and sec_private.pause('signup_pause') then raise exception 'Account registration paused' using errcode='42501';end if;
 if auth.role()='service_role' then return new;end if;
 if auth.uid() is null then raise exception 'Authenticated profile access required' using errcode='42501';end if;
 if (tg_op='INSERT' and new.role is not null) or (tg_op='UPDATE' and new.role is distinct from old.role) then raise exception 'Role changes are managed by trusted server workflows only; founder approval is required' using errcode='42501';end if;
 if new.id<>auth.uid() and not public.is_admin() then raise exception 'Profile ownership required' using errcode='42501';end if;return new;
end$$;
create function public.sec_context() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.role()<>'authenticated' or public.current_app_role()<>'admin' or auth.jwt()->>'aal' is distinct from 'aal2' or not public.auth_session_is_active() then raise exception 'Canonical active MFA Admin required' using errcode='42501';end if;
 return jsonb_build_object('actorId',auth.uid(),'founder',sec_private.can('founder'),'capabilities',(select jsonb_agg(c) from unnest(array['full_admin','users','support','integrity','deals','subscriptions','settings','organizations','incidents','audit']) c where sec_private.can(c)),'founderBinding',case when exists(select 1 from sec_private.founder) then 'bound' else 'pending' end);
end$$;
create function sec_private.keys(p_data jsonb,p_keys text[]) returns void language plpgsql set search_path='' as $$begin
 if p_data is null or jsonb_typeof(p_data)<>'object' or octet_length(p_data::text)>12000 or exists(select 1 from jsonb_object_keys(p_data) k where not k=any(p_keys)) then raise exception 'Unsupported or oversized SEC fields' using errcode='22023';end if;
end$$;
create function public.sec_command(p_module text,p_id uuid,p_expected bigint,p_request uuid,p_action text,p_data jsonb,p_reason text,p_reference text) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old jsonb;d jsonb;owner uuid;rev bigint;h text;op sec_private.operations;result jsonb;u uuid;t public.tracks;o public.orders;current_stage text;next_stage text;cap text;
begin
 if p_module not in('users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents') or p_id is null or p_request is null or p_expected is null or p_expected<0 or p_action is null or p_data is null or p_reason is null or p_reference is null or length(p_reason) not between 5 and 2000 or length(p_reference) not between 3 and 500 then raise exception 'Invalid SEC request' using errcode='22023';end if;
 cap:=case when p_module='permissions' then 'founder' else p_module end;
 if not sec_private.can(cap) then raise exception 'SEC permission denied' using errcode='42501';end if;
 -- Same actor/request across different entities is serialized as well as entity CAS.
 perform pg_advisory_xact_lock(hashtextextended('sec-request:'||actor::text||p_request::text,0));
 h:=encode(extensions.digest(jsonb_build_array(p_module,p_id,p_expected,p_action,p_data,p_reason,p_reference)::text,'sha256'),'hex');
 select * into op from sec_private.operations where actor_id=actor and request_id=p_request;
 if found then if op.request_hash<>h then raise exception 'Conflicting SEC request';end if;return op.result;end if;
 perform pg_advisory_xact_lock(hashtextextended('sec-entity:'||p_module||p_id::text,0));
 select data,owner_id,revision into old,owner,rev from sec_private.revisions where module=p_module and entity_id=p_id order by revision desc limit 1;
 rev:=coalesce(rev,0);if rev<>p_expected then raise exception 'Stale SEC revision' using errcode='40001';end if;d:=coalesce(old,'{}');
 if p_module='users' then perform pg_advisory_xact_lock(hashtextextended('sec-account:'||p_id::text,0));end if;
 if p_module in('users','permissions','settings','subscriptions') then perform sec_private.step_up();end if;
 if p_module='users' then
  perform sec_private.keys(p_data,array[]::text[]);
  if not exists(select 1 from public.user_profiles where id=p_id) or p_id=actor or exists(select 1 from sec_private.founder where user_id=p_id) then raise exception 'Protected or missing account';end if;
  if exists(select 1 from public.user_profiles where id=p_id and role='admin') and not sec_private.can('founder') then raise exception 'Founder authority required for Admin restriction';end if;
  if p_action not in('restrict','suspend','reinstate','note') then raise exception 'Invalid account action';end if;
  d:=d||jsonb_build_object('status',case p_action when 'restrict' then 'restricted' when 'suspend' then 'suspended' when 'reinstate' then 'active' else coalesce(d->>'status','active') end);
  if p_action<>'note' then insert into sec_private.revoked_sessions(session_id,user_id,reason) select id,user_id,p_reason from auth.sessions where user_id=p_id on conflict do nothing;end if;
  owner:=p_id;
 elsif p_module='permissions' then
  perform sec_private.keys(p_data,array['capabilities','expiresAt']);
  if p_id=actor or exists(select 1 from sec_private.founder where user_id=p_id) or not exists(select 1 from public.user_profiles where id=p_id and role='admin') then raise exception 'Existing other canonical Admin required';end if;
  if p_action not in('request','approve','grant','revoke','review') then raise exception 'Invalid access action';end if;
  if p_action='request' then
   if jsonb_typeof(p_data->'capabilities') is distinct from 'array' or jsonb_array_length(p_data->'capabilities') not between 1 and 10 or exists(select 1 from jsonb_array_elements_text(p_data->'capabilities') c where c not in('full_admin','users','support','integrity','deals','subscriptions','settings','organizations','incidents','audit')) or (p_data->>'expiresAt')::timestamptz<=statement_timestamp() or (p_data->>'expiresAt')::timestamptz>statement_timestamp()+interval '90 days' or p_data->>'expiresAt' is null then raise exception 'Bounded capability request and expiry required';end if;
   d:=d||jsonb_build_object('status',coalesce(old->>'status','pending'),'workflowStatus','requested','requestedCapabilities',p_data->'capabilities','requestedExpiresAt',p_data->>'expiresAt','requestReference',p_reference);
  elsif p_action='approve' then
   perform sec_private.keys(p_data,array[]::text[]);
   if old->>'workflowStatus' is distinct from 'requested' or (old->>'requestedExpiresAt')::timestamptz<=statement_timestamp() then raise exception 'Current requested appointment required';end if;
   d:=d||jsonb_build_object('workflowStatus','approved','approvedBy',actor,'approvalReference',p_reference);
  elsif p_action='grant' then
   perform sec_private.keys(p_data,array[]::text[]);
   if old->>'workflowStatus' is distinct from 'approved' or (old->>'requestedExpiresAt')::timestamptz<=statement_timestamp() then raise exception 'Founder-approved current appointment required';end if;
   d:=d||jsonb_build_object('status','active','workflowStatus','granted','capabilities',old->'requestedCapabilities','expiresAt',old->>'requestedExpiresAt','grantReference',p_reference);
  elsif p_action='revoke' then perform sec_private.keys(p_data,array[]::text[]);d:=d||jsonb_build_object('status','revoked','workflowStatus','revoked');
  elsif old is null or old->>'status'<>'active' then raise exception 'No active appointment to review';else perform sec_private.keys(p_data,array[]::text[]);d:=d||jsonb_build_object('workflowStatus','reviewed');end if;
  if p_action in('grant','revoke') then insert into sec_private.revoked_sessions(session_id,user_id,reason) select id,user_id,p_reason from auth.sessions where user_id=p_id on conflict do nothing;end if;owner:=p_id;
 elsif p_module='support' then
  perform sec_private.keys(p_data,array['title','category','message','assignee','status','orderId','trackId']);
  if p_action not in('create','update','note','reply','resolve','reopen') or (rev=0)<>(p_action='create') then raise exception 'Invalid support transition';end if;
  if p_action in('reply','note') and length(coalesce(p_data->>'message','')) not between 5 and 4000 then raise exception 'Explicit bounded message required';end if;
  d:=(d-'message')||p_data;if rev=0 then owner:=actor;d:=d||jsonb_build_object('status','new');end if;
  if p_action='resolve' then d:=d||jsonb_build_object('status','resolved');elsif p_action='reopen' then d:=d||jsonb_build_object('status','triaged');end if;
  if d->>'category' is null or d->>'category' not in('buyer','artist','licensing','payment','delivery','rights','security','account') or d->>'status' not in('new','triaged','investigating','waiting_user','escalated','resolved','closed') or length(coalesce(d->>'title','')) not between 3 and 200 then raise exception 'Support category, title and status required';end if;
  if d->>'assignee' is not null and not sec_private.assignee_allowed((d->>'assignee')::uuid,'support') then raise exception 'Active canonical Admin assignee required';end if;
 elsif p_module='integrity' then
  perform sec_private.keys(p_data,array['title','subjectId','trackId','orderId','signal','evidence','decision']);
  if p_action not in('flag','investigate','decide','close') or (rev=0)<>(p_action='flag') then raise exception 'Invalid investigation transition';end if;
  if p_action in('decide','close') and length(coalesce(p_data->>'decision',''))<5 then raise exception 'Reasoned investigation decision required';end if;
  d:=d||p_data||jsonb_build_object('status',case p_action when 'flag' then 'signal' when 'investigate' then 'investigating' when 'decide' then 'decided' else 'closed' end,'automaticPenalty',false);
 elsif p_module='deals' then
  if (p_action in('create','advance') and sec_private.pause('custom_licensing_pause')) or (p_action='message' and sec_private.pause('messaging_pause')) then raise exception 'Deal workflow paused' using errcode='42501';end if;
  perform sec_private.keys(p_data,array['title','trackId','buyerId','stage','orderId','message','feePolicyId','introductionReference','attributionReference']);
  if p_action in('message','note') and length(coalesce(p_data->>'message','')) not between 5 and 4000 then raise exception 'Explicit bounded message required';end if;
  if p_action not in('create','advance','message','note','fee_reference') or (rev=0)<>(p_action='create') then raise exception 'Invalid deal action';end if;
  if rev=0 then
   select * into t from public.tracks where id=(p_data->>'trackId')::uuid;
   if t.id is null or not exists(select 1 from public.user_profiles where id=(p_data->>'buyerId')::uuid and role='buyer') then raise exception 'Canonical track and Buyer required';end if;
   d:=p_data||jsonb_build_object('sellerId',t.artist_user_id,'stage','discovery');owner:=(p_data->>'buyerId')::uuid;
  else
   if p_data ? 'trackId' or p_data ? 'buyerId' then raise exception 'Deal parties and track are immutable';end if;
   current_stage:=d->>'stage';next_stage:=p_data->>'stage';
   if p_action='advance' then
    if not ((current_stage='discovery' and next_stage='inquiry') or(current_stage='inquiry' and next_stage='quote') or(current_stage='quote' and next_stage='checkout') or(current_stage='checkout' and next_stage='license')) then raise exception 'Invalid deal stage progression';end if;
    if next_stage in('quote','checkout','license') then
     select * into o from public.orders where id=(p_data->>'orderId')::uuid;
     if o.id is null or o.buyer_user_id<>owner or o.track_id<>(d->>'trackId')::uuid or not exists(select 1 from licensing_private.acceptances where order_id=o.id) then raise exception 'Accepted canonical purchase required';end if;
     if (select snapshot#>>'{seller,userId}' from licensing_private.acceptances where order_id=o.id) is distinct from d->>'sellerId' then raise exception 'Accepted seller attribution conflict';end if;
     if next_stage='license' then perform licensing_private.assert_purchase(o.id,true);if not exists(select 1 from public.generated_licenses where order_id=o.id and status='generated') then raise exception 'Verified generated license required';end if;end if;
    end if;
   elsif p_data ? 'stage' or p_data ? 'orderId' then raise exception 'Stage updates require advance';end if;
   if p_data ? 'feePolicyId' and p_action<>'fee_reference' then raise exception 'Fee references require explicit review';end if;
   if p_action='fee_reference' and not exists(select 1 from finance_private.policy_actions pa join licensing_private.offers fo on fo.id=pa.offer_id where pa.request_id=(p_data->>'feePolicyId')::uuid and fo.track_id=(d->>'trackId')::uuid and pa.input->>'feeOverride'='true') then raise exception 'Approved immutable fee policy required';end if;
   d:=d||p_data;
  end if;
 elsif p_module='subscriptions' then
  if sec_private.pause('subscription_changes_pause') then raise exception 'Subscription changes paused' using errcode='42501';end if;
  perform sec_private.keys(p_data,array['plan','status','expiresAt','billingReference','entitlements']);
  if not exists(select 1 from public.user_profiles where id=p_id and role in('artist','buyer')) or p_action not in('observe','grant_complimentary','revoke_complimentary','request_cancel','record_renewal') then raise exception 'Invalid subscription subject or action';end if;
  if p_action not in('grant_complimentary','revoke_complimentary') and (p_data->>'status'='complimentary' or (old->>'status'='complimentary' and p_data ?| array['plan','status','expiresAt','entitlements'])) then raise exception 'Complimentary grant changes require founder grant workflow';end if;
  d:=d||p_data;
  if d->>'plan' is null or d->>'plan' not in('free','pro','teams') or d->>'status' is null or d->>'status' not in('unknown','free','complimentary','reported_active','past_due','cancel_requested','reported_canceled','reported_renewed') then raise exception 'Subscription observation required';end if;
  if p_action='revoke_complimentary' then
   if not sec_private.can('founder') or old->>'status'<>'complimentary' then raise exception 'Founder and original complimentary grant required';end if;d:=d||jsonb_build_object('status','unknown','entitlements','[]'::jsonb);
  elsif p_action='grant_complimentary' then
   if not sec_private.can('founder') or (d->>'expiresAt')::timestamptz<=statement_timestamp() or d->>'expiresAt' is null then raise exception 'Founder approved expiring grant required';end if;d:=d||jsonb_build_object('status','complimentary');
  elsif p_data ? 'entitlements' then raise exception 'Entitlements require explicit complimentary grant';end if;
  if d ? 'entitlements' and (jsonb_typeof(d->'entitlements')<>'array' or exists(select 1 from jsonb_array_elements_text(d->'entitlements') e where e not in('catalog_tools','team_workspace','priority_support'))) then raise exception 'Unsupported non-security entitlement';end if;
  if p_action='request_cancel' then d:=d||case when old->>'status'='complimentary' then jsonb_build_object('billingCancellationRequested',true) else jsonb_build_object('status','cancel_requested') end;elsif p_action='record_renewal' then d:=d||case when old->>'status'='complimentary' then jsonb_build_object('billingRenewalReported',true) else jsonb_build_object('status','reported_renewed') end;end if;
  d:=d||jsonb_build_object('billingVerified',false,'billingActivation',false);owner:=p_id;
 elsif p_module='settings' then
  perform sec_private.keys(p_data,array['key','value']);if not sec_private.can('founder') or p_action<>'configure' or p_data->>'key' is null or not p_data ? 'value' then raise exception 'Founder settings authority required';end if;
  if p_data->>'key' not in('checkout_pause','delivery_pause','issuance_pause','catalog_publication_pause','signup_pause','subscription_changes_pause','messaging_pause','custom_licensing_pause','marketplace_proposal','license_proposal','commercial_proposal','notification_preferences','security_proposal','audit_retention_proposal') then raise exception 'Unsupported setting; activation forbidden';end if;
  if p_data->>'key' in('checkout_pause','delivery_pause','issuance_pause','catalog_publication_pause','signup_pause','subscription_changes_pause','messaging_pause','custom_licensing_pause') and jsonb_typeof(p_data->'value') is distinct from 'boolean' then raise exception 'Boolean pause required';end if;
  perform pg_advisory_xact_lock(hashtextextended('sec-setting:'||(p_data->>'key'),0));
  if exists(select 1 from sec_private.revisions where module='settings' and data->>'key'=p_data->>'key' and entity_id<>p_id) then raise exception 'Setting identity conflict';end if;
  if old is not null and old->>'key'<>p_data->>'key' then raise exception 'Setting key immutable';end if;
  d:=p_data||jsonb_build_object('effective',p_data->>'key' in('checkout_pause','delivery_pause','issuance_pause','catalog_publication_pause','signup_pause','subscription_changes_pause','messaging_pause','custom_licensing_pause'),'activationAllowed',false);
 elsif p_module='organizations' then
  perform sec_private.keys(p_data,array['title','representativeId','members','verificationReference','status']);
  if p_action not in('register','verify','update','revoke') or (rev=0)<>(p_action='register') then raise exception 'Invalid organization action';end if;d:=d||p_data;
  if length(coalesce(d->>'title','')) not between 3 and 200 or not exists(select 1 from public.user_profiles where id=(d->>'representativeId')::uuid) then raise exception 'Identified organization representative required';end if;
  if d ? 'members' and (jsonb_typeof(d->'members')<>'array' or jsonb_array_length(d->'members')>50 or exists(select 1 from jsonb_array_elements(d->'members') m where m->>'role' is null or m->>'role' not in('owner','catalog','rights','finance','viewer') or not exists(select 1 from public.user_profiles where id=(m->>'userId')::uuid))) then raise exception 'Verified member IDs and non-platform organization roles required';end if;
  if p_action='verify' and length(coalesce(d->>'verificationReference',''))<5 then raise exception 'Organization verification evidence required';end if;
  d:=d||jsonb_build_object('status',case p_action when 'verify' then 'verified' when 'revoke' then 'revoked' else 'pending_review' end,'platformPrivilegesGranted',false);
 elsif p_module='incidents' then
  perform sec_private.keys(p_data,array['title','severity','status','assignee','recoveryReference']);
  if p_action not in('open','acknowledge','update','resolve') or (rev=0)<>(p_action='open') then raise exception 'Invalid incident action';end if;d:=d||p_data;
  if d->>'severity' is null or d->>'severity' not in('SEV1','SEV2','SEV3','SEV4') or length(coalesce(d->>'title','')) not between 3 and 200 then raise exception 'Incident severity and title required';end if;
  if d->>'assignee' is not null and not sec_private.assignee_allowed((d->>'assignee')::uuid,'incidents') then raise exception 'Authorized incident assignee required';end if;
  d:=d||jsonb_build_object('status',case p_action when 'open' then 'open' when 'acknowledge' then 'acknowledged' when 'resolve' then 'resolved' else coalesce(d->>'status','open') end);
 end if;
 if d ? 'message' and length(d->>'message')>4000 then raise exception 'Bounded message required';end if;
 if p_module='integrity' and d->>'subjectId' is not null and not exists(select 1 from public.user_profiles where id=(d->>'subjectId')::uuid) then raise exception 'Canonical investigation subject required';end if;
 if p_module='support' and owner is not null and exists(select 1 from public.user_profiles where id=owner and role in('artist','buyer')) and d->>'orderId' is not null and not exists(select 1 from public.orders x join public.tracks y on y.id=x.track_id where x.id=(d->>'orderId')::uuid and (x.buyer_user_id=owner or y.artist_user_id=owner)) then raise exception 'Support case ownership conflict';end if;
 if p_module in('support','integrity') then
  if d->>'orderId' is not null and not exists(select 1 from public.orders where id=(d->>'orderId')::uuid) then raise exception 'Canonical order reference required';end if;
  if d->>'trackId' is not null and not exists(select 1 from public.tracks where id=(d->>'trackId')::uuid) then raise exception 'Canonical track reference required';end if;
 end if;
 insert into sec_private.revisions(module,entity_id,revision,owner_id,data,actor_id,action,reason,reference,request_id) values(p_module,p_id,rev+1,owner,d,actor,p_action,p_reason,p_reference,p_request);
 result:=jsonb_build_object('id',p_id,'revision',rev+1,'data',d,'applied',true);
 perform sec_private.log(p_action,p_module,p_id::text,old,d,p_reason,p_request::text);
 insert into sec_private.operations values(actor,p_request,h,result);return result;
end$$;
create function sec_private.pause(p_key text) returns boolean language plpgsql security definer set search_path='' as $$declare v boolean;begin
 perform pg_advisory_xact_lock_shared(hashtextextended('sec-setting:'||p_key,0));
 select (data->>'value')::boolean into v from (select distinct on(entity_id) data from sec_private.revisions where module='settings' order by entity_id,revision desc)s where data->>'key'=p_key;return coalesce(v,false);end$$;
-- Existing workflow helpers keep their OIDs and caller grants. Originals remain private.
do $$declare f text;d text;n text;begin foreach f in array array['licensing_private.assert_purchase(uuid,boolean)','commerce_private.broker_can_deliver(uuid,uuid)','catalog_private.visible(uuid)','submission_media.require_actor(text)','rights_private.actor(boolean)','catalog_private.actor(boolean)'] loop
 select pg_get_functiondef(f::regprocedure) into d;n:=split_part(split_part(f,'(',1),'.',2);
 execute replace(d,split_part(f,'(',1)||'(',split_part(f,'(',1)||'_before_system11(');
 end loop;end$$;
create or replace function licensing_private.assert_purchase(p_order uuid,p_paid boolean) returns licensing_private.acceptances language plpgsql security definer set search_path='' as $$declare o public.orders;begin
 select * into strict o from public.orders where id=p_order;
 perform pg_advisory_xact_lock_shared(hashtextextended('sec-account:'||x::text,0)) from unnest(array[o.buyer_user_id,(select artist_user_id from public.tracks where id=o.track_id)]) x order by x;
 if not sec_private.account_allowed(o.buyer_user_id) or not sec_private.account_allowed((select artist_user_id from public.tracks where id=o.track_id)) or sec_private.pause('checkout_pause') then raise exception 'SEC account or purchase restriction' using errcode='42501';end if;
 return licensing_private.assert_purchase_before_system11(p_order,p_paid);
end$$;
create or replace function commerce_private.broker_can_deliver(p_entitlement uuid,p_buyer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sec_private.account_allowed(p_buyer) and not sec_private.pause('delivery_pause') and commerce_private.broker_can_deliver_before_system11(p_entitlement,p_buyer)
$$;
create or replace function commerce_private.delivery_session_active(p_buyer uuid,p_session uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_session is not null and sec_private.account_allowed(p_buyer) and not exists(select 1 from sec_private.revoked_sessions where session_id=p_session)
 and exists(select 1 from auth.sessions s join public.user_profiles u on u.id=s.user_id where s.id=p_session and s.user_id=p_buyer and u.role='buyer' and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>statement_timestamp()))
$$;
create or replace function catalog_private.visible(p_track uuid) returns boolean language sql stable security definer set search_path='' as $$
 select sec_private.account_allowed((select artist_user_id from public.tracks where id=p_track)) and catalog_private.visible_before_system11(p_track)
$$;
create or replace function submission_media.require_actor(p_role text) returns uuid language plpgsql security definer set search_path='' as $$begin
 if not sec_private.account_allowed(auth.uid()) then raise exception 'Account restricted' using errcode='42501';end if;return submission_media.require_actor_before_system11(p_role);end$$;
create or replace function rights_private.actor(p_admin boolean default false) returns uuid language plpgsql security definer set search_path='' as $$begin
 if not sec_private.account_allowed(auth.uid()) then raise exception 'Account restricted' using errcode='42501';end if;return rights_private.actor_before_system11(p_admin);end$$;
create or replace function catalog_private.actor(p_admin boolean default false) returns uuid language plpgsql security definer set search_path='' as $$begin
 if not sec_private.account_allowed(auth.uid()) then raise exception 'Account restricted' using errcode='42501';end if;return catalog_private.actor_before_system11(p_admin);end$$;
-- Apply an additional restrictive fence to existing RLS tables. No privileges are added.
do $$declare t record;begin for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
 execute format('create policy sec_account_restriction on public.%I as restrictive for all to authenticated using(public.sec_account_allowed()) with check(public.sec_account_allowed())',t.tablename);
 end loop;end$$;
-- Customer intake and conversations use verified ownership, never staff impersonation.
create function public.sec_customer_command(p_module text,p_id uuid,p_expected bigint,p_request uuid,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r text:=public.current_app_role();d jsonb;old jsonb;rev bigint;owner uuid;h text;op sec_private.operations;result jsonb;t public.tracks;begin
 if auth.role()<>'authenticated' or r not in('buyer','artist') or not public.auth_session_is_active() then raise exception 'Active canonical customer required' using errcode='42501';end if;
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
   if r<>'buyer' or t.id is null or not catalog_private.visible(t.id) then raise exception 'Published track and Buyer required';end if;
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
create function public.sec_read(p_module text,p_page integer default 1,p_search text default '',p_status text default '',p_sort text default 'newest') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rows jsonb;n bigint;customer boolean:=not sec_private.can(p_module);begin
 if p_page is null or p_page not between 1 and 10000 or p_search is null or length(p_search)>200 or p_status is null or length(p_status)>80 or p_sort not in('newest','oldest') then raise exception 'Bounded SEC query required';end if;
 if p_module not in('users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents','audit') then raise exception 'Unknown SEC module';end if;
 if customer and (p_module not in('support','deals') or auth.role()<>'authenticated' or public.current_app_role() not in('artist','buyer') or not public.auth_session_is_active()) then raise exception 'SEC permission denied' using errcode='42501';end if;
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
create function public.sec_dashboard() returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;f jsonb:=null;begin
 perform public.sec_context();
 if sec_private.can('full_admin') then f:=public.accounting_admin_report(1,1)->'summary';end if;
 result:=jsonb_build_object('checkedAt',statement_timestamp(),'counts',jsonb_build_object(
 'users',(select count(*) from public.user_profiles),'activeArtists',(select count(*) from public.user_profiles where role='artist' and sec_private.account_allowed(id)),
 'activeBuyers',(select count(*) from public.user_profiles where role='buyer' and sec_private.account_allowed(id)),
 'catalog',(select count(*) from public.tracks),'pendingSubmissions',(select count(*) from public.tracks where status='pending_review'),
 'rightsPending',(select count(*) from rights_private.cases where state in('pending','clarification')),'published',(select count(*) from catalog_private.cases where state='published'),
 'licenses',(select count(*) from public.generated_licenses where status='generated'),'orders',(select count(*) from public.orders),
 'refunds',(select count(*) from public.orders where status='refunded'),
 'providerFailures',(select count(*) from finance_private.provider_jobs where state in('dead','conflict','retry')),
 'disputes',(select count(*) from commerce_private.order_states where state='DISPUTED'),
 'administrativeActions',(select count(*) from(select distinct on(module,entity_id) data from sec_private.revisions where module in('support','integrity','incidents') order by module,entity_id,revision desc) x where coalesce(data->>'status','new') not in('resolved','closed'))),
 'finance',f,'externalMonitoring',null,'scheduledWorkers',null,'billingProvider',null,'independentArchive',null,
 'activeMeaning','Active means account eligible, not recent sign-in or engagement. Finance comes from immutable accounting contracts. External monitoring is unverified.');
 return result;
end$$;
-- Existing domain events are referenced by hashes, not copied into alternate business records.
create function sec_private.bridge_audit() returns trigger language plpgsql security definer set search_path='' as $$declare v jsonb;b jsonb:=null;begin
 v:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_op in('UPDATE','DELETE') then b:=jsonb_build_object('sha256',encode(extensions.digest(to_jsonb(old)::text,'sha256'),'hex'));end if;
 perform sec_private.log(coalesce(v->>'action',v->>'command',tg_op),tg_table_schema||'.'||tg_table_name,coalesce(v->>'id',v->>'order_id',v->>'track_id','record'),b,case when tg_op='DELETE' then null else jsonb_build_object('sha256',encode(extensions.digest(v::text,'sha256'),'hex'),'reference',coalesce(v->>'request_id',v->>'id'),'recordAction',v->>'action','recordActor',coalesce(v->>'actor_id',v->>'reviewer_id')) end,left(coalesce(v->>'reason',v->>'note',v#>>'{metadata,note}','Existing domain command'),2000),coalesce(v->>'request_id',v->>'id'));return case when tg_op='DELETE' then old else new end;
end$$;
do $$declare t text;begin foreach t in array array['rights_private.events','catalog_private.events','licensing_private.lifecycle_events','commerce_private.delivery_operator_events','finance_private.payout_events','finance_private.payee_bindings','finance_private.policy_actions','finance_private.provider_operator_actions','finance_private.journals','public.track_audit_log','public.review_notes'] loop
 if to_regclass(t) is not null then execute format('create trigger sec_domain_audit after insert on %s for each row execute function sec_private.bridge_audit()',t);end if;
 end loop;end$$;
revoke all on all functions in schema sec_private from public,anon,authenticated,service_role;
revoke all on function licensing_private.assert_purchase_before_system11(uuid,boolean),commerce_private.broker_can_deliver_before_system11(uuid,uuid),catalog_private.visible_before_system11(uuid),submission_media.require_actor_before_system11(text),rights_private.actor_before_system11(boolean),catalog_private.actor_before_system11(boolean) from public,anon,authenticated,service_role;
revoke all on function public.sec_bind_founder(uuid,text) from public,anon,authenticated;
grant execute on function public.sec_bind_founder(uuid,text) to service_role;
revoke all on function public.sec_account_allowed(),public.sec_has_capability(text),public.sec_context(),public.sec_command(text,uuid,bigint,uuid,text,jsonb,text,text),public.sec_customer_command(text,uuid,bigint,uuid,text,jsonb),public.sec_read(text,integer,text,text,text),public.sec_dashboard() from public,anon,service_role;
grant execute on function public.sec_account_allowed(),public.sec_has_capability(text),public.sec_context(),public.sec_command(text,uuid,bigint,uuid,text,jsonb,text,text),public.sec_customer_command(text,uuid,bigint,uuid,text,jsonb),public.sec_read(text,integer,text,text,text),public.sec_dashboard() to authenticated;
create function public.sec_record_denial(p_module text,p_request uuid,p_code text) returns void language plpgsql security definer set search_path='' as $$begin
 if auth.role()<>'authenticated' or auth.uid() is null or not exists(select 1 from auth.sessions where user_id=auth.uid() and id::text=auth.jwt()->>'session_id') then raise exception 'Authenticated denial evidence required' using errcode='42501';end if;
 if p_module not in('users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents','audit','dashboard','context') or p_code not in('42501','40001','22023','P0001') then return;end if;
 if (select count(*) from sec_private.audit where actor_id=auth.uid() and outcome='reported_denial' and recorded_at>statement_timestamp()-interval '1 minute')>=30 then return;end if;
 perform sec_private.log('request_denied',p_module,'redacted',null,null,'Authenticated rejection report; prior denial is not independently verified',p_request::text,'reported_denial');
end$$;
revoke all on function public.sec_record_denial(text,uuid,text) from public,anon,service_role;
grant execute on function public.sec_record_denial(text,uuid,text) to authenticated;
-- Operational admission is mutable; all business decisions and audit evidence remain append-only.
create table sec_private.admission(user_id uuid not null,window_start timestamptz not null,attempts integer not null,primary key(user_id,window_start));
alter table sec_private.admission enable row level security;alter table sec_private.admission force row level security;
create policy trusted_owner on sec_private.admission to postgres using(true) with check(true);
revoke all on sec_private.admission from public,anon,authenticated,service_role;
create function public.sec_admit() returns boolean language plpgsql security definer set search_path='' as $$declare n int;w timestamptz:=date_trunc('minute',statement_timestamp());begin
 if auth.role()<>'authenticated' or not public.auth_session_is_active() then return false;end if;
 insert into sec_private.admission values(auth.uid(),w,1) on conflict(user_id,window_start) do update set attempts=least(sec_private.admission.attempts+1,121) returning attempts into n;return n<=120;
end$$;
revoke all on function public.sec_admit() from public,anon,service_role;grant execute on function public.sec_admit() to authenticated;
create function public.sec_audit_manifest(p_after bigint default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$declare rows jsonb;begin
 if not sec_private.can('audit') then raise exception 'SEC audit permission required' using errcode='42501';end if;
 if p_after is null or p_after<0 then raise exception 'Bounded audit cursor required';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'digest',x.digest,'verified',x.digest=encode(extensions.digest(jsonb_build_object('actor',x.actor_id,'action',x.action,'module',x.entity_type,'id',x.entity_id,'before',x.before_state,'after',x.after_state,'authorization',x.auth_evidence,'reason',x.reason,'request',x.request_id,'outcome',x.outcome,'at',x.recorded_at)::text,'sha256'),'hex')) order by x.id),'[]') into rows from(select * from sec_private.audit where id>p_after order by id limit 100)x;
 return jsonb_build_object('records',rows,'through',(select coalesce(max(id),0) from sec_private.audit),'count',(select count(*) from sec_private.audit),'externalAnchorVerified',false);
end$$;
revoke all on function public.sec_audit_manifest(bigint) from public,anon,service_role;grant execute on function public.sec_audit_manifest(bigint) to authenticated;
-- Narrow public health-of-registration predicate contains no identity or configuration payload.
create function public.sec_registration_open() returns boolean language sql security definer set search_path='' as $$select not sec_private.pause('signup_pause')$$;
revoke all on function public.sec_registration_open() from public;grant execute on function public.sec_registration_open() to anon,authenticated,service_role;
create function sec_private.guard_issuance() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='generated' and (tg_op='INSERT' or old.status<>'generated') and sec_private.pause('issuance_pause') then raise exception 'License issuance paused' using errcode='42501';end if;return new;end$$;
create trigger sec_issuance_pause before insert or update on public.generated_licenses for each row execute function sec_private.guard_issuance();
create function sec_private.guard_publication() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.state='published' and old.state<>'published' and sec_private.pause('catalog_publication_pause') then raise exception 'Catalog publication paused' using errcode='42501';end if;return new;end$$;
create trigger sec_publication_pause before update on catalog_private.cases for each row execute function sec_private.guard_publication();
revoke all on function sec_private.guard_issuance(),sec_private.guard_publication() from public,anon,authenticated,service_role;
create function sec_private.assignee_allowed(p_user uuid,p_cap text) returns boolean language sql stable security definer set search_path='' as $$
 select sec_private.account_allowed(p_user) and exists(select 1 from public.user_profiles where id=p_user and role='admin') and (
 exists(select 1 from sec_private.founder where user_id=p_user) or
 (not exists(select 1 from sec_private.founder) and sec_private.latest('permissions',p_user) is null) or
 ((sec_private.latest('permissions',p_user)->>'status')='active' and (sec_private.latest('permissions',p_user)->>'expiresAt')::timestamptz>statement_timestamp() and ((sec_private.latest('permissions',p_user)->'capabilities') ? p_cap or (sec_private.latest('permissions',p_user)->'capabilities') ? 'full_admin')))
$$;
revoke all on function sec_private.assignee_allowed(uuid,text) from public,anon,authenticated,service_role;
-- Legacy UI mutations now retain the verified SSR actor. Capture their business mutation atomically as well as their explanatory records.
create trigger sec_track_mutation_audit after update on public.tracks for each row when(old is distinct from new) execute function sec_private.bridge_audit();
create trigger sec_flag_mutation_audit after insert or update on public.admin_flags for each row execute function sec_private.bridge_audit();
create trigger sec_legacy_track_audit_changes after update or delete on public.track_audit_log for each row execute function sec_private.bridge_audit();
create trigger sec_legacy_note_changes after update or delete on public.review_notes for each row execute function sec_private.bridge_audit();
-- Audit the existing trusted financial replay adapter without creating another financial posting path.
create function public.sec_financial_recovery_evidence(p_order uuid,p_request uuid,p_phase text) returns jsonb language plpgsql security definer set search_path='' as $$declare prior sec_private.audit;v jsonb;begin
 if not sec_private.can('full_admin') then raise exception 'Canonical full Admin required' using errcode='42501';end if;
 if p_request is null or p_phase not in('requested','observed') or not exists(select 1 from public.orders where id=p_order) then raise exception 'Canonical recovery request required';end if;
 perform pg_advisory_xact_lock(hashtextextended('sec-recovery:'||auth.uid()::text||p_request::text,0));
 select * into prior from sec_private.audit where actor_id=auth.uid() and request_id=p_request::text and entity_type='financial_recovery' order by id limit 1;
 if found and prior.entity_id<>p_order::text then raise exception 'Conflicting recovery request' using errcode='40001';end if;
 if p_phase='observed' and prior.id is null then raise exception 'Original requested recovery required';end if;
 if exists(select 1 from sec_private.audit where actor_id=auth.uid() and request_id=p_request::text and entity_type='financial_recovery' and action=p_phase) then return jsonb_build_object('recorded',true);end if;
 select jsonb_build_object('journalCount',count(*),'journalManifestSha256',encode(extensions.digest(coalesce(string_agg(id::text||':'||economic_key,',' order by id),''),'sha256'),'hex'),'paymentOrFulfillmentInferred',false) into v from finance_private.journals where order_id=p_order;
 perform sec_private.log(p_phase,'financial_recovery',p_order::text,null,v,'Explicit replay of retained verified financial evidence',p_request::text,'evidence_observed');return jsonb_build_object('recorded',true);
end$$;
revoke all on function public.sec_financial_recovery_evidence(uuid,uuid,text) from public,anon,service_role;grant execute on function public.sec_financial_recovery_evidence(uuid,uuid,text) to authenticated;
revoke all on function public.guard_user_profile_write() from public,anon,authenticated,service_role;
commit;
