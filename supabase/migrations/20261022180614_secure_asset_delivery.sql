-- PK08. Local candidate only. No capability is enabled and no existing purchase
-- is backfilled. Reuse the media versions, legal receipt and commerce contract.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

alter table commerce_private.capabilities add column delivery_enabled boolean not null default false;
alter table commerce_private.asset_versions drop constraint asset_versions_asset_type_check;
alter table commerce_private.asset_versions add check(asset_type in ('master','instrumental','clean','stems','alternate','supporting'));
alter table commerce_private.asset_versions drop constraint asset_versions_mime_type_check;
alter table commerce_private.asset_versions add check(mime_type in ('audio/mpeg','audio/wav','audio/x-wav','audio/aiff','audio/flac','application/zip','application/pdf'));
-- Match the separately owned media source ceiling. Hosted bucket limits remain
-- unchanged; a supported Storage API change needs its own approved window.
alter table commerce_private.asset_versions drop constraint asset_versions_byte_size_check;
alter table commerce_private.asset_versions add check(byte_size between 1 and 250000000);
alter table public.order_asset_entitlements drop constraint order_asset_entitlements_asset_type_check;
alter table public.order_asset_entitlements add check(asset_type in ('master','instrumental','clean','stems','alternate','supporting'));
-- A license can include several individually reviewed stems or alternate mixes.
alter table public.order_asset_entitlements drop constraint order_asset_entitlements_contract_id_asset_type_key;

create table commerce_private.license_delivery_sets (
 offer_id uuid primary key references licensing_private.offers(id) on delete restrict,
 manifest jsonb not null check(jsonb_typeof(manifest)='array' and jsonb_array_length(manifest)<=32),
 reviewed_by uuid not null references auth.users(id) on delete restrict,
 review_reference text not null check(length(review_reference) between 5 and 200),
 created_at timestamptz not null default now()
);
alter table commerce_private.contract_context add column purchase_hash text check(purchase_hash ~ '^[a-f0-9]{64}$');
alter table commerce_private.contract_context add column delivery_manifest jsonb not null default '[]' check(jsonb_typeof(delivery_manifest)='array');

create table commerce_private.delivery_authorizations (
 id uuid primary key default gen_random_uuid(),
 actor_id uuid not null references auth.users(id) on delete restrict,
 session_id uuid,
 requested_order uuid not null,
 requested_entitlement uuid not null,
 request_id uuid not null,
 asset_version_id uuid references commerce_private.asset_versions(id) on delete restrict,
 purchase_hash text,
 decision text not null check(decision in ('allowed','denied')),
 check(decision='denied' or session_id is not null),
 reason text not null check(reason ~ '^[a-z0-9_]{1,80}$'),
 authorized_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '60 seconds',
 unique(actor_id,request_id)
);
create index delivery_actor_time on commerce_private.delivery_authorizations(actor_id,authorized_at);
create index delivery_order_time on commerce_private.delivery_authorizations(requested_order,authorized_at);
create table commerce_private.delivery_tickets (
 authorization_id uuid primary key references commerce_private.delivery_authorizations(id) on delete restrict,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp()
);
create table commerce_private.delivery_ticket_redemptions (
 authorization_id uuid primary key references commerce_private.delivery_tickets(authorization_id) on delete restrict,
 redeemed_at timestamptz not null default clock_timestamp()
);
create table commerce_private.delivery_outcomes (
 authorization_id uuid primary key references commerce_private.delivery_authorizations(id) on delete restrict,
 outcome text not null check(outcome in ('bytes_prepared','storage_failed','integrity_failed','expired','revoked','aborted')),
 -- This is a verified server preparation, never a claim of client receipt.
 transfer_completion_observed boolean not null default false check(not transfer_completion_observed),
 created_at timestamptz not null default clock_timestamp()
);
create table commerce_private.delivery_restrictions (
 order_id uuid primary key references public.orders(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 reason text not null check(length(reason) between 5 and 500),
 created_at timestamptz not null default clock_timestamp()
);
create table commerce_private.delivery_revocations (
 id bigint generated always as identity primary key,
 order_id uuid not null references public.orders(id) on delete restrict,
 entitlement_id uuid not null references public.order_asset_entitlements(id) on delete restrict,
 asset_version_id uuid not null references commerce_private.asset_versions(id) on delete restrict,
 state text not null,
 reason text not null,
 created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text; begin
 foreach t in array array['license_delivery_sets','delivery_authorizations','delivery_outcomes','delivery_restrictions','delivery_revocations','delivery_tickets','delivery_ticket_redemptions'] loop
  execute format('alter table commerce_private.%I enable row level security',t);
  execute format('revoke all on commerce_private.%I from public,anon,authenticated,service_role',t);
  execute format('create trigger retain_delivery before update or delete on commerce_private.%I for each row execute function commerce_private.immutable_row()',t);
 end loop;
end $$;

-- Exact reviewed variants use the existing media-version model and private
-- purchase-assets destination. Never accept a buyer-controlled Storage path.
create function public.reserve_delivery_variant(p_actor uuid,p_track uuid,p_source uuid,p_kind text) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.tracks; s storage.objects; result uuid;
begin
 perform licensing_private.require_admin(p_actor);
 perform commerce_private.assert_enabled('asset_preparation');
 select * into strict t from public.tracks where id=p_track for share;
 select * into strict s from storage.objects where id=p_source for share;
 if t.status<>'approved' or p_kind not in ('master','instrumental','clean','stems','alternate','supporting')
 or s.bucket_id<>'track-audio' or split_part(s.name,'/',1)<>t.artist_user_id::text or s.version is null
 or s.name ~ '(^/|%|\\|(^|/)\.\.?(/|$))'
 or not exists(select 1 from storage.buckets where id=s.bucket_id and not public)
 then raise exception 'Approved privately owned variant required'; end if;
 insert into commerce_private.asset_versions(track_id,asset_type,source_object_id,source_bucket,source_path,source_version)
 values(t.id,p_kind,s.id,s.bucket_id,s.name,s.version) on conflict(track_id,source_object_id,source_version,asset_type) do nothing returning id into result;
 if result is null then select id into strict result from commerce_private.asset_versions where track_id=t.id and source_object_id=s.id and source_version=s.version and asset_type=p_kind;end if;
 return result;
end $$;

create function public.review_license_deliverables(p_actor uuid,p_offer uuid,p_assets jsonb,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o licensing_private.offers; a commerce_private.asset_versions; s storage.objects; item jsonb; manifest jsonb:='[]'; seen uuid[]:='{}';
begin
 perform licensing_private.require_admin(p_actor);
 select * into strict o from licensing_private.offers where id=p_offer for update;
 if jsonb_typeof(p_assets) is distinct from 'array' or jsonb_array_length(p_assets)>32 or length(p_reference) not between 5 and 200 then raise exception 'Bounded reviewed deliverables required';end if;
 if exists(select 1 from licensing_private.quotes where offer_id=p_offer) then raise exception 'Deliverables must precede every quote; publish a new reviewed offer';end if;
 for item in select value from jsonb_array_elements(p_assets) loop
  if item-array['assetVersionId','label']<>'{}' or length(coalesce(item->>'label','')) not between 1 and 120 then raise exception 'Explicit asset and label required';end if;
  select * into strict a from commerce_private.asset_versions where id=(item->>'assetVersionId')::uuid for share;
  select * into strict s from storage.objects where id=a.object_id for share;
  if a.id=any(seen) or a.track_id<>o.track_id or a.state<>'ready' or a.approval_state<>'approved' or a.retired_at is not null
  or s.bucket_id<>a.bucket_id or s.name<>a.object_path or s.version is distinct from a.object_version
  or (s.metadata->>'size')::bigint is distinct from a.byte_size or s.metadata->>'mimetype' is distinct from a.mime_type
  or not exists(select 1 from storage.buckets where id=s.bucket_id and not public)
  then raise exception 'Exact sealed private track asset required';end if;
  seen:=array_append(seen,a.id);
  manifest:=manifest||jsonb_build_array(jsonb_build_object('assetVersionId',a.id,'kind',a.asset_type,'label',item->>'label',
   'objectVersion',a.object_version,'sha256',a.sha256,'byteSize',a.byte_size,'mimeType',a.mime_type));
 end loop;
 insert into commerce_private.license_delivery_sets(offer_id,manifest,reviewed_by,review_reference) values(p_offer,manifest,p_actor,p_reference);
 return manifest;
end $$;

-- Add the exact deliverables BEFORE the quote is hashed, presented and accepted.
-- Missing review means no included assets, never implicit access to a master.
create function commerce_private.freeze_quote_deliverables() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb;
begin
 perform 1 from licensing_private.offers where id=new.offer_id for share;
 select manifest into m from commerce_private.license_delivery_sets where offer_id=new.offer_id;
 new.schedule:=new.schedule||jsonb_build_object('deliveryManifest',coalesce(m,'[]'::jsonb));
 new.schedule_hash:=licensing_private.hash_json(new.schedule);
 return new;
end $$;
create trigger freeze_delivery_quote before insert on licensing_private.quotes for each row execute function commerce_private.freeze_quote_deliverables();
create function commerce_private.freeze_delivery_context() returns trigger language plpgsql security definer set search_path='' as $$
declare a licensing_private.acceptances;
begin
 select x.* into a from licensing_private.acceptances x join public.order_delivery_contracts c on c.order_id=x.order_id where c.id=new.contract_id;
 -- Legacy contexts remain non-deliverable; never fabricate historical assent.
 new.purchase_hash:=a.snapshot_hash;
 new.delivery_manifest:=coalesce(a.snapshot->'deliveryManifest','[]'::jsonb);
 return new;
end $$;
create trigger freeze_delivery_context before insert on commerce_private.contract_context for each row execute function commerce_private.freeze_delivery_context();

create function commerce_private.manifest_matches(p_entitlement uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.order_asset_entitlements n
 join public.order_delivery_contracts c on c.id=n.contract_id
 join commerce_private.contract_context x on x.contract_id=c.id
 join licensing_private.acceptances p on p.order_id=n.order_id and p.buyer_id=n.buyer_user_id and p.snapshot_hash=x.purchase_hash
 join commerce_private.asset_versions a on a.id=n.asset_version_id and a.track_id=c.track_id and a.asset_type=n.asset_type
 join storage.objects s on s.id=a.object_id and s.bucket_id=a.bucket_id and s.name=a.object_path and s.version=a.object_version
 join storage.buckets b on b.id=s.bucket_id and not b.public
 cross join lateral jsonb_array_elements(x.delivery_manifest) m
 where n.id=p_entitlement and x.delivery_manifest=p.snapshot->'deliveryManifest'
 and m->>'assetVersionId'=a.id::text and m->>'kind'=a.asset_type and m->>'objectVersion'=a.object_version
 and m->>'sha256'=a.sha256 and (m->>'byteSize')::bigint=a.byte_size and m->>'mimeType'=a.mime_type
 and (s.metadata->>'size')::bigint=a.byte_size and s.metadata->>'mimetype'=a.mime_type);
$$;
create function commerce_private.broker_can_deliver(p_entitlement uuid,p_buyer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select commerce_private.can_deliver(p_entitlement,p_buyer) and commerce_private.manifest_matches(p_entitlement)
 and exists(select 1 from commerce_private.capabilities where delivery_enabled)
 and not exists(select 1 from commerce_private.delivery_restrictions r join public.order_asset_entitlements n on n.order_id=r.order_id where n.id=p_entitlement);
$$;

-- The new checkout adapter reserves only what the buyer actually accepted.
-- Keep the legacy adapter for old, non-deliverable synthetic test harnesses;
-- neither that adapter nor its RLS predicate can grant broker access.
create function public.prepare_licensed_asset_entitlements(p_order uuid) returns integer language plpgsql security definer set search_path='' as $$
declare c public.order_delivery_contracts; x commerce_private.contract_context; m jsonb; a commerce_private.asset_versions; result integer:=0;
begin
 perform commerce_private.require_service_role();
 select * into strict c from public.order_delivery_contracts where order_id=p_order;
 perform 1 from public.orders where id=p_order for update;
 select * into strict x from commerce_private.contract_context where contract_id=c.id;
 perform licensing_private.assert_purchase(p_order,false);
 if not exists(select 1 from public.orders where id=p_order and status='pending' and paid_at is null and stripe_checkout_session_id is null)
 then
  if exists(select 1 from public.order_asset_entitlements n where n.contract_id=c.id and not commerce_private.manifest_matches(n.id)) then raise exception 'Frozen entitlement mismatch';end if;
  return (select count(*)::integer from public.order_asset_entitlements where contract_id=c.id);
 end if;
 for m in select value from jsonb_array_elements(x.delivery_manifest) loop
  select * into strict a from commerce_private.asset_versions where id=(m->>'assetVersionId')::uuid for share;
  if not exists(select 1 from commerce_private.qa_fixture_designations where asset_version_id=a.id and buyer_user_id=c.buyer_user_id and revoked_at is null)
  then raise exception 'TEST asset requires explicit synthetic asset AND buyer approval';end if;
  insert into public.order_asset_entitlements(contract_id,order_id,buyer_user_id,asset_version_id,asset_type)
  values(c.id,c.order_id,c.buyer_user_id,a.id,a.asset_type) on conflict(contract_id,asset_version_id) do nothing;
 end loop;
 for m in select jsonb_build_object('id',id) from public.order_asset_entitlements where contract_id=c.id loop
  if not commerce_private.manifest_matches((m->>'id')::uuid) then raise exception 'Frozen entitlement mismatch';end if;
  result:=result+1;
 end loop;
 return result;
end $$;

create function public.read_order_assets(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare buyer uuid;
begin
 buyer:=licensing_private.buyer();
 if not exists(select 1 from public.orders where id=p_order and buyer_user_id=buyer) then raise exception 'Order unavailable' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',a.asset_type,'label',m->>'label','byteSize',a.byte_size,
  'state',n.state,'available',commerce_private.broker_can_deliver(n.id,buyer)) order by n.id)
 from public.order_asset_entitlements n join commerce_private.asset_versions a on a.id=n.asset_version_id
 join commerce_private.contract_context x on x.contract_id=n.contract_id cross join lateral jsonb_array_elements(x.delivery_manifest) m
 where n.order_id=p_order and n.buyer_user_id=buyer and m->>'assetVersionId'=a.id::text and commerce_private.manifest_matches(n.id)),'[]'::jsonb);
end $$;

-- Preserve the explicit legacy fixture adapter without treating its old
-- single-master selection as an accepted manifest for a new transaction.
alter function public.prepare_purchase_completion_checkout(uuid,text,text) rename to prepare_purchase_completion_checkout_legacy;
alter function public.prepare_purchase_completion_checkout_legacy(uuid,text,text) set schema commerce_private;
revoke all on function commerce_private.prepare_purchase_completion_checkout_legacy(uuid,text,text) from public,anon,authenticated,service_role;
create function public.prepare_purchase_completion_checkout(p_order uuid,p_environment text,p_provider_account text)
returns table(contract_id uuid,entitlement_id uuid,asset_version_id uuid,synthetic_qa boolean)
language plpgsql security definer set search_path='' as $$
declare c uuid; first_n public.order_asset_entitlements;
begin
 perform commerce_private.require_service_role();perform commerce_private.assert_payment_adapter_enabled();
 if not exists(select 1 from licensing_private.acceptances where order_id=p_order and snapshot ? 'deliveryManifest') then
  return query select * from commerce_private.prepare_purchase_completion_checkout_legacy(p_order,p_environment,p_provider_account);return;
 end if;
 if p_environment not in ('local','preview','production') or p_provider_account !~ '^acct_[A-Za-z0-9]+$' then raise exception 'Invalid purchase-completion adapter context';end if;
 c:=commerce_private.freeze_contract(p_order,p_environment,p_provider_account);
 perform public.prepare_licensed_asset_entitlements(p_order);
 select n.* into first_n from public.order_asset_entitlements n where n.contract_id=c order by n.id limit 1;
 return query select c,first_n.id,first_n.asset_version_id,first_n.id is not null;
end $$;
revoke all on function public.prepare_purchase_completion_checkout(uuid,text,text) from public,anon,authenticated;
grant execute on function public.prepare_purchase_completion_checkout(uuid,text,text) to service_role;

create function commerce_private.guard_manifest_entitlement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state in ('pending','active') and exists(select 1 from commerce_private.contract_context where contract_id=new.contract_id and purchase_hash is not null)
 and not commerce_private.manifest_matches(new.id) then
  raise exception 'Entitlement must match immutable accepted delivery manifest';end if;return new;
end $$;
-- AFTER INSERT allows the shared predicate to inspect the actual identity;
-- an exception rolls back the unlisted entitlement and its whole transaction.
create trigger accepted_delivery_entitlement after insert or update on public.order_asset_entitlements for each row execute function commerce_private.guard_manifest_entitlement();

create function public.verify_asset_download_session() returns uuid language plpgsql security definer set search_path='' as $$
declare session uuid:=(auth.jwt()->>'session_id')::uuid;
begin
 if auth.uid() is null or session is null or not exists(select 1 from auth.sessions where id=session and user_id=auth.uid())
 then raise exception 'Current authenticated session required' using errcode='42501';end if;
 return session;
end $$;
create function public.begin_asset_download(p_buyer uuid,p_order uuid,p_entitlement uuid,p_request uuid,p_session uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare n public.order_asset_entitlements; a commerce_private.asset_versions; x commerce_private.contract_context;
 d commerce_private.delivery_authorizations; why text:='unavailable'; m jsonb;
begin
 perform commerce_private.require_service_role();
 if not exists(select 1 from public.user_profiles where id=p_buyer and role='buyer') then raise exception 'Canonical buyer required';end if;
 if p_session is null or not exists(select 1 from auth.sessions where id=p_session and user_id=p_buyer) then raise exception 'Current buyer session required';end if;
 -- This serializes duplicate requests and bounds concurrent Storage fetches.
 perform pg_advisory_xact_lock(hashtextextended(p_buyer::text,808));
 if exists(select 1 from commerce_private.delivery_authorizations where actor_id=p_buyer and request_id=p_request) then
  return jsonb_build_object('allowed',false,'reason','duplicate_request');end if;
 -- Bound audit growth under abuse; the last persisted daily event is the quota
 -- denial. Additional requests fail closed and belong in redacted edge counters.
 if (select count(*) from commerce_private.delivery_authorizations where actor_id=p_buyer and authorized_at>clock_timestamp()-interval '1 day')>=1000
 then return jsonb_build_object('allowed',false,'reason','rate_limited');end if;
 perform 1 from public.orders where id=p_order and buyer_user_id=p_buyer for share;
 if found then
  select * into n from public.order_asset_entitlements where id=p_entitlement and order_id=p_order and buyer_user_id=p_buyer for share;
  if n.id is not null then
   select * into a from commerce_private.asset_versions where id=n.asset_version_id for share;
   select * into x from commerce_private.contract_context where contract_id=n.contract_id;
   if commerce_private.broker_can_deliver(n.id,p_buyer) then why:='authorized';end if;
  end if;
 end if;
 if (select count(*) from commerce_private.delivery_authorizations where actor_id=p_buyer and authorized_at>clock_timestamp()-interval '1 minute')>=20
 or (select count(*) from commerce_private.delivery_authorizations where actor_id=p_buyer and authorized_at>clock_timestamp()-interval '1 day')>=999
 or (select count(*) from commerce_private.delivery_authorizations pending where pending.actor_id=p_buyer and pending.decision='allowed' and pending.expires_at>clock_timestamp()
 and not exists(select 1 from commerce_private.delivery_outcomes z where z.authorization_id=pending.id))>=2
 then why:='rate_limited';end if;
 insert into commerce_private.delivery_authorizations(actor_id,session_id,requested_order,requested_entitlement,request_id,asset_version_id,purchase_hash,decision,reason)
 values(p_buyer,p_session,p_order,p_entitlement,p_request,a.id,x.purchase_hash,case when why='authorized' then 'allowed' else 'denied' end,why) returning * into d;
 if d.decision<>'allowed' then return jsonb_build_object('allowed',false,'reason',why);end if;
 select value into strict m from jsonb_array_elements(x.delivery_manifest) where value->>'assetVersionId'=a.id::text;
 return jsonb_build_object('allowed',true,'authorizationId',d.id,'expiresAt',d.expires_at,'bucket',a.bucket_id,'path',a.object_path,
 'sha256',a.sha256,'byteSize',a.byte_size,'mimeType',a.mime_type,'kind',a.asset_type,'assetVersionId',a.id,'label',m->>'label');
end $$;

-- Record authenticated perimeter denials without obtaining a privileged client
-- or revealing whether the requested order/asset exists. Bound attacker writes.
create function public.record_asset_access_denial(p_order uuid,p_entitlement uuid,p_request uuid) returns void
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();
begin
 if actor is null or not exists(select 1 from public.user_profiles where id=actor) then raise exception 'Authenticated account required';end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,808));
 if (select count(*) from commerce_private.delivery_authorizations where actor_id=actor and authorized_at>clock_timestamp()-interval '1 minute')>=20
 or (select count(*) from commerce_private.delivery_authorizations where actor_id=actor and authorized_at>clock_timestamp()-interval '1 day')>=1000 then return;end if;
 insert into commerce_private.delivery_authorizations(actor_id,requested_order,requested_entitlement,request_id,decision,reason)
 values(actor,p_order,p_entitlement,p_request,'denied','perimeter_denial') on conflict(actor_id,request_id) do nothing;
end $$;

create function public.finish_asset_download(p_buyer uuid,p_authorization uuid,p_outcome text) returns boolean
language plpgsql security definer set search_path='' as $$
declare d commerce_private.delivery_authorizations; outcome text;
begin
 perform commerce_private.require_service_role();
 select * into strict d from commerce_private.delivery_authorizations where id=p_authorization and actor_id=p_buyer for update;
 if d.decision<>'allowed' or exists(select 1 from commerce_private.delivery_outcomes where authorization_id=d.id) then return false;end if;
 if p_outcome not in ('bytes_prepared','storage_failed','integrity_failed','aborted') then raise exception 'Invalid preparation result';end if;
 perform 1 from public.orders where id=d.requested_order and buyer_user_id=p_buyer for share;
 perform 1 from public.order_asset_entitlements where id=d.requested_entitlement for share;
 perform 1 from commerce_private.asset_versions where id=d.asset_version_id for share;
 outcome:=case when d.expires_at<=clock_timestamp() then 'expired'
  when (d.session_id is not null and not exists(select 1 from auth.sessions where id=d.session_id and user_id=p_buyer))
  or not commerce_private.broker_can_deliver(d.requested_entitlement,p_buyer) then 'revoked' else p_outcome end;
 insert into commerce_private.delivery_outcomes(authorization_id,outcome) values(d.id,outcome);
 return outcome='bytes_prepared';
end $$;

create function public.create_asset_delivery_ticket(p_buyer uuid,p_authorization uuid,p_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare d commerce_private.delivery_authorizations;
begin
 perform commerce_private.require_service_role();
 select * into strict d from commerce_private.delivery_authorizations where id=p_authorization and actor_id=p_buyer for update;
 if d.decision<>'allowed' or d.expires_at<=clock_timestamp() or not commerce_private.broker_can_deliver(d.requested_entitlement,p_buyer)
 or exists(select 1 from commerce_private.delivery_outcomes where authorization_id=d.id) then raise exception 'Delivery authorization unavailable';end if;
 insert into commerce_private.delivery_tickets(authorization_id,token_hash) values(d.id,p_hash);
end $$;
create function public.redeem_asset_delivery_ticket(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d commerce_private.delivery_authorizations; a commerce_private.asset_versions;
begin
 perform commerce_private.require_service_role();
 select x.* into d from commerce_private.delivery_authorizations x join commerce_private.delivery_tickets t on t.authorization_id=x.id where t.token_hash=p_hash for update of x;
 if d.id is null then return jsonb_build_object('allowed',false);end if;
 if exists(select 1 from commerce_private.delivery_ticket_redemptions where authorization_id=d.id)
 or exists(select 1 from commerce_private.delivery_outcomes where authorization_id=d.id) then return jsonb_build_object('allowed',false);end if;
 if d.expires_at<=clock_timestamp() or (d.session_id is not null and not exists(select 1 from auth.sessions where id=d.session_id and user_id=d.actor_id))
 or not commerce_private.broker_can_deliver(d.requested_entitlement,d.actor_id) then
  perform public.finish_asset_download(d.actor_id,d.id,'aborted');return jsonb_build_object('allowed',false);end if;
 insert into commerce_private.delivery_ticket_redemptions(authorization_id) values(d.id);
 select * into strict a from commerce_private.asset_versions where id=d.asset_version_id;
 return jsonb_build_object('allowed',true,'authorizationId',d.id,'buyerId',d.actor_id,'expiresAt',d.expires_at,'bucket',a.bucket_id,'path',a.object_path,
 'sha256',a.sha256,'byteSize',a.byte_size,'mimeType',a.mime_type,'kind',a.asset_type,'assetVersionId',a.id);
end $$;

create function commerce_private.audit_entitlement_revocation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.state in ('suspended','revoked','failed') and (new.state,new.reason_code) is distinct from (old.state,old.reason_code) then
 insert into commerce_private.delivery_revocations(order_id,entitlement_id,asset_version_id,state,reason)
 values(new.order_id,new.id,new.asset_version_id,new.state,new.reason_code);end if;return new;
end $$;
create trigger audit_delivery_revocation after update on public.order_asset_entitlements for each row execute function commerce_private.audit_entitlement_revocation();
create function public.restrict_order_delivery(p_actor uuid,p_order uuid,p_reason text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform licensing_private.require_admin(p_actor);
 perform 1 from public.orders where id=p_order for update;
 if not found then raise exception 'Order unavailable';end if;
 insert into commerce_private.delivery_restrictions(order_id,actor_id,reason) values(p_order,p_actor,p_reason);
 update public.order_asset_entitlements set state='suspended',reason_code='administrative_restriction',updated_at=clock_timestamp()
 where order_id=p_order and state not in ('revoked','failed','suspended');
end $$;
create function public.read_order_delivery_audit(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles where id=auth.uid() and role='admin') then raise exception 'Canonical admin required' using errcode='42501';end if;
 return jsonb_build_object('attempts',coalesce((select jsonb_agg(to_jsonb(t)) from (
 select d.id,d.actor_id,d.requested_entitlement as entitlement_id,d.asset_version_id,d.purchase_hash,d.decision,d.reason,d.authorized_at,d.expires_at,
 z.outcome,z.transfer_completion_observed,z.created_at as outcome_at from commerce_private.delivery_authorizations d
 left join commerce_private.delivery_outcomes z on z.authorization_id=d.id where d.requested_order=p_order order by d.authorized_at desc limit 100) t),'[]'::jsonb),
 'revocations',coalesce((select jsonb_agg(to_jsonb(t)) from (select * from commerce_private.delivery_revocations where order_id=p_order order by id desc limit 100)t),'[]'::jsonb),
 'restriction',(select jsonb_build_object('actorId',actor_id,'reason',reason,'createdAt',created_at) from commerce_private.delivery_restrictions where order_id=p_order));
end $$;

revoke all on all functions in schema commerce_private from public,anon,authenticated;
-- Do not expand grants to private helpers. The existing worker grants survive.
revoke all on function public.reserve_delivery_variant(uuid,uuid,uuid,text),public.review_license_deliverables(uuid,uuid,jsonb,text),
 public.prepare_licensed_asset_entitlements(uuid),public.begin_asset_download(uuid,uuid,uuid,uuid,uuid),public.finish_asset_download(uuid,uuid,text),
 public.restrict_order_delivery(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.create_asset_delivery_ticket(uuid,uuid,text),public.redeem_asset_delivery_ticket(text) from public,anon,authenticated;
grant execute on function public.create_asset_delivery_ticket(uuid,uuid,text),public.redeem_asset_delivery_ticket(text) to service_role;
grant execute on function public.reserve_delivery_variant(uuid,uuid,uuid,text),public.review_license_deliverables(uuid,uuid,jsonb,text),
 public.prepare_licensed_asset_entitlements(uuid),public.begin_asset_download(uuid,uuid,uuid,uuid,uuid),public.finish_asset_download(uuid,uuid,text),
 public.restrict_order_delivery(uuid,uuid,text) to service_role;
revoke all on function public.read_order_assets(uuid),public.read_order_delivery_audit(uuid),public.record_asset_access_denial(uuid,uuid,uuid),public.verify_asset_download_session() from public,anon,service_role;
grant execute on function public.read_order_assets(uuid),public.read_order_delivery_audit(uuid),public.record_asset_access_denial(uuid,uuid,uuid),public.verify_asset_download_session() to authenticated;
revoke all on all sequences in schema commerce_private from public,anon,authenticated,service_role;
commit;
