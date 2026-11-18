-- System 09: local-only delivery lifecycle. Existing capabilities remain OFF.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

create function commerce_private.delivery_session_active(p_buyer uuid,p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select p_session is not null and exists(select 1 from auth.sessions s join public.user_profiles u on u.id=s.user_id
 where s.id=p_session and s.user_id=p_buyer and u.role='buyer'
 and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>statement_timestamp()))
$$;
create or replace function public.verify_asset_download_session() returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not public.auth_session_is_active() or not exists(select 1 from public.user_profiles where id=auth.uid() and role='buyer')
 then raise exception 'Current canonical buyer session required' using errcode='42501';end if;
 return (auth.jwt()->>'session_id')::uuid;
end$$;
-- Preserve public RPC OIDs and grants; fail atomically if the expected contracts drift.
do $$declare f text;old text;new text;definition text;begin
 foreach f in array array['public.begin_asset_download(uuid,uuid,uuid,uuid,uuid)','public.finish_asset_download(uuid,uuid,text)','public.redeem_asset_delivery_ticket(text)','public.create_asset_delivery_ticket(uuid,uuid,text)'] loop
  select pg_get_functiondef(f::regprocedure) into definition;
  if f like 'public.begin%' then
   old:='p_session is null or not exists(select 1 from auth.sessions where id=p_session and user_id=p_buyer)';
   new:='not commerce_private.delivery_session_active(p_buyer,p_session)';
  elsif f like 'public.create%' then
   old:='d.decision<>''allowed'' or d.expires_at<=clock_timestamp()';
   new:='d.decision<>''allowed'' or not commerce_private.delivery_session_active(p_buyer,d.session_id) or d.expires_at<=clock_timestamp()';
  elsif f like 'public.finish%' then
   old:='(d.session_id is not null and not exists(select 1 from auth.sessions where id=d.session_id and user_id=p_buyer))';
   new:='not commerce_private.delivery_session_active(p_buyer,d.session_id)';
  else
   old:='(d.session_id is not null and not exists(select 1 from auth.sessions where id=d.session_id and user_id=d.actor_id))';
   new:='not commerce_private.delivery_session_active(d.actor_id,d.session_id)';
  end if;
  if position(old in definition)=0 then raise exception 'System09 delivery contract drift: %',f;end if;
  execute replace(definition,old,new);
 end loop;
end$$;

create table commerce_private.delivery_transfer_events (
 authorization_id uuid not null references commerce_private.delivery_authorizations(id) on delete restrict,
 phase text not null check(phase in ('started','finished')),
 outcome text not null check(outcome in ('started','stream_exhausted','interrupted','revoked','expired','storage_failed')),
 bytes_observed bigint not null check(bytes_observed between 0 and 250000000),
 client_receipt_confirmed boolean not null default false check(not client_receipt_confirmed),
 created_at timestamptz not null default clock_timestamp(),
 primary key(authorization_id,phase),
 check((phase='started' and outcome='started' and bytes_observed=0) or (phase='finished' and outcome<>'started'))
);
alter table commerce_private.delivery_transfer_events enable row level security;
alter table commerce_private.delivery_transfer_events force row level security;
create policy trusted_owner on commerce_private.delivery_transfer_events to postgres using(true) with check(true);
create trigger retain_delivery_transfer before update or delete on commerce_private.delivery_transfer_events for each row execute function commerce_private.immutable_row();
revoke all on commerce_private.delivery_transfer_events from public,anon,authenticated,service_role;

create function public.check_asset_transfer(p_buyer uuid,p_authorization uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare d commerce_private.delivery_authorizations;begin
 perform commerce_private.require_service_role();
 select * into d from commerce_private.delivery_authorizations where id=p_authorization and actor_id=p_buyer;
 return coalesce(d.decision='allowed' and d.expires_at>clock_timestamp()
 and commerce_private.delivery_session_active(p_buyer,d.session_id)
 and exists(select 1 from commerce_private.delivery_outcomes where authorization_id=d.id and outcome='bytes_prepared')
 and not exists(select 1 from commerce_private.delivery_transfer_events where authorization_id=d.id and phase='finished')
 and commerce_private.broker_can_deliver(d.requested_entitlement,p_buyer),false);
end$$;
create function public.record_asset_transfer(p_buyer uuid,p_authorization uuid,p_outcome text,p_bytes bigint) returns boolean
language plpgsql security definer set search_path='' as $$
declare d commerce_private.delivery_authorizations;v commerce_private.delivery_transfer_events;v_phase text;size bigint;outcome text;begin
 perform commerce_private.require_service_role();
 select * into strict d from commerce_private.delivery_authorizations where id=p_authorization and actor_id=p_buyer for update;
 select byte_size into strict size from commerce_private.asset_versions where id=d.asset_version_id;
 if p_outcome not in ('started','stream_exhausted','interrupted','revoked','expired','storage_failed') or p_bytes is null or p_bytes<0 or p_bytes>size
 or (p_outcome='started' and p_bytes<>0) or (p_outcome='stream_exhausted' and p_bytes<>size) then raise exception 'Invalid transfer evidence';end if;
 v_phase:=case when p_outcome='started' then 'started' else 'finished' end;
 select * into v from commerce_private.delivery_transfer_events e where e.authorization_id=d.id and e.phase=v_phase;
 if found then
  if v.outcome<>p_outcome or v.bytes_observed<>p_bytes then raise exception 'Conflicting transfer evidence';end if;
  return false;
 end if;
 if v_phase='started' then
  if not public.check_asset_transfer(p_buyer,d.id) then return false;end if;
 elsif not exists(select 1 from commerce_private.delivery_transfer_events where authorization_id=d.id and phase='started') then raise exception 'Transfer start evidence required';end if;
 outcome:=p_outcome;
 -- A final success record never hides a payment/rights/session change during transfer.
 if p_outcome='stream_exhausted' then
  if d.expires_at<=clock_timestamp() then outcome:='expired';
  elsif not public.check_asset_transfer(p_buyer,d.id) then outcome:='revoked';end if;
 end if;
 insert into commerce_private.delivery_transfer_events(authorization_id,phase,outcome,bytes_observed) values(d.id,v_phase,outcome,p_bytes);
 return outcome=p_outcome;
end$$;

-- Keep purchased files visible as unavailable when a source disappears. Never
-- replace its manifest or substitute newer bytes to make recovery succeed.
create or replace function public.read_order_assets(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid;begin
 buyer:=licensing_private.buyer();
 if not exists(select 1 from public.orders where id=p_order and buyer_user_id=buyer) then raise exception 'Order unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',m->>'kind','label',m->>'label','byteSize',(m->>'byteSize')::bigint,
 'state',n.state,'available',commerce_private.broker_can_deliver(n.id,buyer),
 'availabilityReason',case when commerce_private.broker_can_deliver(n.id,buyer) then 'available' when n.state in ('revoked','suspended','failed') then n.state
 when not commerce_private.manifest_matches(n.id) then 'source_unavailable' when n.state='pending' then 'not_ready' else 'review_required' end) order by n.id)
 from public.order_asset_entitlements n join commerce_private.contract_context x on x.contract_id=n.contract_id
 cross join lateral jsonb_array_elements(x.delivery_manifest) m where n.order_id=p_order and n.buyer_user_id=buyer and m->>'assetVersionId'=n.asset_version_id::text),'[]'::jsonb);
end$$;

create table commerce_private.delivery_operator_events (
 id uuid primary key,
 order_id uuid not null references public.orders(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 command text not null check(command in ('record_review','close_expired_attempts','restrict_access')),
 reason text not null check(length(reason) between 5 and 2000),
 reference text not null check(length(reference) between 5 and 500),
 result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
create index delivery_operator_order_time on commerce_private.delivery_operator_events(order_id,created_at desc);
alter table commerce_private.delivery_operator_events enable row level security;
alter table commerce_private.delivery_operator_events force row level security;
create policy trusted_owner on commerce_private.delivery_operator_events to postgres using(true) with check(true);
create trigger retain_delivery_operator before update or delete on commerce_private.delivery_operator_events for each row execute function commerce_private.immutable_row();
revoke all on commerce_private.delivery_operator_events from public,anon,authenticated,service_role;

create function public.delivery_order_status(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;is_admin boolean:=public.is_admin();begin
 if not is_admin and (auth.uid() is null or not public.auth_session_is_active() or public.current_app_role() is distinct from 'buyer') then raise exception 'Access denied' using errcode='42501';end if;
 select * into o from public.orders where id=p_order and (is_admin or buyer_user_id=auth.uid());
 if o.id is null then raise exception 'Order unavailable' using errcode='42501';end if;
 return jsonb_build_object('orderId',o.id,'payment',public.checkout_order_state(o.id),
 'assets',case when is_admin then coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',m->>'kind','label',m->>'label','byteSize',(m->>'byteSize')::bigint,'state',n.state,'available',commerce_private.broker_can_deliver(n.id,o.buyer_user_id),'availabilityReason',n.reason_code) order by n.id)
 from public.order_asset_entitlements n join commerce_private.contract_context x on x.contract_id=n.contract_id cross join lateral jsonb_array_elements(x.delivery_manifest) m where n.order_id=o.id and m->>'assetVersionId'=n.asset_version_id::text),'[]'::jsonb) else public.read_order_assets(o.id) end,
 'history',coalesce((select jsonb_agg(to_jsonb(t)) from (select d.id,d.requested_entitlement as entitlement_id,d.decision,d.reason,d.authorized_at,d.expires_at,z.outcome as preparation,
 case when z.outcome is null and d.expires_at<=clock_timestamp() then 'expired' else z.outcome end as preparation_state,
 e.outcome as transfer,e.bytes_observed,e.created_at as transfer_at,false as client_receipt_confirmed
 from commerce_private.delivery_authorizations d left join commerce_private.delivery_outcomes z on z.authorization_id=d.id
 left join commerce_private.delivery_transfer_events e on e.authorization_id=d.id and e.phase='finished'
 where d.requested_order=o.id and (is_admin or d.actor_id=auth.uid()) order by d.authorized_at desc,d.id desc limit 100)t),'[]'::jsonb),
 'restricted',exists(select 1 from commerce_private.delivery_restrictions where order_id=o.id),
 'operations',case when is_admin then coalesce((select jsonb_agg(to_jsonb(t)) from (select id,actor_id,command,reason,reference,result,created_at from commerce_private.delivery_operator_events where order_id=o.id order by created_at desc,id desc limit 100)t),'[]'::jsonb) else '[]'::jsonb end);
end$$;
create function public.delivery_operations(p_page integer,p_size integer) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if not public.is_admin() then raise exception 'Canonical MFA Admin required' using errcode='42501';end if;
 if p_page is null or p_size is null or p_page not between 1 and 10000 or p_size not between 1 and 50 then raise exception 'Bounded page required';end if;
 return coalesce((select jsonb_agg(public.delivery_order_status(t.id)) from (select id from public.orders order by created_at desc,id desc offset (p_page-1)*p_size limit p_size)t),'[]'::jsonb);
end$$;
create function public.delivery_admin_action(p_order uuid,p_request uuid,p_command text,p_reason text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare previous commerce_private.delivery_operator_events;d commerce_private.delivery_authorizations;count integer:=0;result jsonb;begin
 if not public.is_admin() then raise exception 'Canonical MFA Admin required' using errcode='42501';end if;
 if p_request is null or p_command not in ('record_review','close_expired_attempts','restrict_access') or length(p_reason) not between 5 and 2000 or length(p_reference) not between 5 and 500 then raise exception 'Bounded audit evidence required';end if;
 perform 1 from public.orders where id=p_order for update;if not found then raise exception 'Order unavailable' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,909));
 select * into previous from commerce_private.delivery_operator_events where id=p_request;
 if found then
  if (previous.order_id,previous.actor_id,previous.command,previous.reason,previous.reference) is distinct from (p_order,auth.uid(),p_command,p_reason,p_reference) then raise exception 'Conflicting delivery operation' using errcode='40001';end if;return previous.result;
 end if;
 if p_command='restrict_access' then
  insert into commerce_private.delivery_restrictions(order_id,actor_id,reason) values(p_order,auth.uid(),p_reason) on conflict(order_id) do nothing;
  update public.order_asset_entitlements set state='suspended',reason_code='administrative_restriction',updated_at=clock_timestamp() where order_id=p_order and state not in ('revoked','failed','suspended');
 elsif p_command='close_expired_attempts' then
  for d in select a.* from commerce_private.delivery_authorizations a where requested_order=p_order and decision='allowed' and expires_at<=clock_timestamp() order by a.id for update skip locked loop
   insert into commerce_private.delivery_outcomes(authorization_id,outcome) values(d.id,'expired') on conflict(authorization_id) do nothing;
   if found then count:=count+1;end if;
   if exists(select 1 from commerce_private.delivery_transfer_events where authorization_id=d.id and phase='started') then
    insert into commerce_private.delivery_transfer_events(authorization_id,phase,outcome,bytes_observed) values(d.id,'finished','expired',0) on conflict(authorization_id,phase) do nothing;
   end if;
  end loop;
 end if;
 result:=jsonb_build_object('outcome','recorded','closedAttempts',count);
 insert into commerce_private.delivery_operator_events(id,order_id,actor_id,command,reason,reference,result) values(p_request,p_order,auth.uid(),p_command,p_reason,p_reference,result);
 return result;
end$$;
revoke all on function commerce_private.delivery_session_active(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.check_asset_transfer(uuid,uuid),public.record_asset_transfer(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.check_asset_transfer(uuid,uuid),public.record_asset_transfer(uuid,uuid,text,bigint) to service_role;
revoke all on function public.delivery_order_status(uuid),public.delivery_operations(integer,integer),public.delivery_admin_action(uuid,uuid,text,text,text) from public,anon,service_role;
grant execute on function public.delivery_order_status(uuid),public.delivery_operations(integer,integer),public.delivery_admin_action(uuid,uuid,text,text,text) to authenticated;
commit;
