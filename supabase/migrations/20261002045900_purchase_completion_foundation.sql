-- Phase 2A. Additive, dormant, TEST-only foundation. No historical backfill.
-- Apply once through the migration ledger; a duplicate application fails closed.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if to_regclass('public.generated_licenses') is null
     or to_regprocedure('public.current_app_role()') is null
     or not exists (select 1 from pg_trigger where tgrelid='storage.objects'::regclass
                    and tgname='guard_referenced_media_version' and not tgisinternal) then
    raise exception 'Reviewed PR27 schema prerequisites missing';
  end if;
  if to_regnamespace('commerce_private') is not null then
    raise exception 'Commerce foundation already exists: reconcile migration ledger, do not replay';
  end if;
end $$;

create schema commerce_private;
revoke all on schema commerce_private from public, anon, authenticated;
grant usage on schema commerce_private to service_role;
alter default privileges in schema commerce_private revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema commerce_private revoke execute on functions from public, anon, authenticated, service_role;

-- Only the database deployment owner may enable capabilities or designate QA fixtures.
-- No application/admin RPC for changing these controls is provided in Phase 2A.
create table commerce_private.capabilities (
  singleton boolean primary key default true check(singleton),
  foundation_enabled boolean not null default false,
  asset_preparation_enabled boolean not null default false,
  receipt_generation_enabled boolean not null default false,
  entitlement_activation_enabled boolean not null default false,
  transaction_projection_enabled boolean not null default false
);
insert into commerce_private.capabilities(singleton) values(true);

create table commerce_private.asset_versions (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete restrict,
  asset_type text not null default 'master' check(asset_type='master'),
  source_object_id uuid not null references storage.objects(id) on delete restrict,
  source_bucket text not null check(source_bucket='track-audio'),
  source_path text not null,
  source_version text not null,
  bucket_id text not null default 'purchase-assets' check(bucket_id='purchase-assets'),
  object_path text generated always as (id::text || '/master') stored,
  object_id uuid unique references storage.objects(id) on delete restrict,
  object_version text,
  sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint check(byte_size between 1 and 52428800),
  mime_type text check(mime_type in ('audio/mpeg','audio/wav','audio/x-wav','audio/aiff','audio/flac')),
  state text not null default 'pending' check(state in ('pending','ready','failed')),
  approval_state text not null default 'pending' check(approval_state in ('pending','approved','rejected')),
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  unique(track_id,source_object_id,source_version,asset_type),
  unique(bucket_id,object_path),
  check(state <> 'ready' or (object_id is not null and object_version is not null and sha256 is not null
                           and byte_size is not null and mime_type is not null and approval_state='approved'))
);

create table public.order_delivery_contracts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  track_id uuid not null references public.tracks(id) on delete restrict,
  license_type_id uuid not null references public.license_types(id) on delete restrict,
  track_title text not null,
  license_name text not null,
  amount_minor integer not null check(amount_minor > 0),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  payment_mode text not null check(payment_mode='test'),
  deployment_environment text not null check(deployment_environment in ('local','preview','production')),
  commercial_rights_granted boolean not null default false check(not commercial_rights_granted),
  delivery_policy_version text not null default 'beta-test-v1' check(delivery_policy_version='beta-test-v1'),
  created_at timestamptz not null default now(),
  unique(id,order_id,buyer_user_id)
);
create index commerce_asset_source_path on commerce_private.asset_versions(source_bucket,source_path);

-- Private snapshot deliberately includes rights identities; no public JSON catch-all.
create table commerce_private.contract_context (
  contract_id uuid primary key references public.order_delivery_contracts(id) on delete restrict,
  provider_account text not null check(provider_account ~ '^acct_[A-Za-z0-9]+$'),
  rights_snapshot jsonb not null check(jsonb_typeof(rights_snapshot)='array'),
  license_snapshot jsonb not null check(jsonb_typeof(license_snapshot)='object'),
  created_at timestamptz not null default now()
);
create table commerce_private.qa_fixture_designations (
  asset_version_id uuid not null references commerce_private.asset_versions(id) on delete restrict,
  buyer_user_id uuid not null references auth.users(id) on delete restrict,
  approval_reference text not null check(length(approval_reference) between 1 and 200),
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(asset_version_id,buyer_user_id)
);

create table commerce_private.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'stripe' check(provider='stripe'),
  provider_account text not null check(provider_account ~ '^acct_[A-Za-z0-9]+$'),
  provider_event_id text not null check(provider_event_id ~ '^evt_[A-Za-z0-9]+$'),
  payment_mode text not null check(payment_mode='test'),
  livemode boolean not null check(not livemode),
  contract_id uuid not null references public.order_delivery_contracts(id) on delete restrict,
  checkout_session_id text not null check(checkout_session_id ~ '^cs_test_[A-Za-z0-9]+$'),
  payment_intent_id text not null check(payment_intent_id ~ '^pi_[A-Za-z0-9]+$'),
  event_type text not null check(event_type in ('checkout.session.completed','checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed','charge.refunded','charge.dispute.created')),
  payment_state text not null check(payment_state in ('PAID','REFUNDED','PARTIALLY_REFUNDED','DISPUTED','PAYMENT_FAILED')),
  amount_minor integer not null check(amount_minor > 0),
  refunded_minor integer not null default 0 check(refunded_minor between 0 and amount_minor),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  evidence_sha256 text not null check(evidence_sha256 ~ '^[a-f0-9]{64}$'),
  verification_method text not null check(verification_method='stripe_signature'),
  provider_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz not null default now(),
  unique(provider,provider_account,payment_mode,provider_event_id)
);
create index commerce_events_contract on commerce_private.payment_events(contract_id,received_at);
create table commerce_private.order_states (
  contract_id uuid primary key references public.order_delivery_contracts(id) on delete restrict,
  state text not null default 'PENDING' check(state in ('PENDING','PAID','FULFILLED','REFUNDED','PARTIALLY_REFUNDED','DISPUTED','PAYMENT_FAILED','SECURITY_HOLD')),
  event_id uuid references commerce_private.payment_events(id) on delete restrict,
  -- First verified PAID fact is independent of current delivery authorization.
  payment_received_event_id uuid references commerce_private.payment_events(id) on delete restrict,
  refunded_minor integer not null default 0 check(refunded_minor >= 0),
  revision integer not null default 0 check(revision >= 0),
  updated_at timestamptz not null default now()
);
create table commerce_private.state_history (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.order_delivery_contracts(id) on delete restrict,
  state text not null,
  reason_code text not null check(reason_code ~ '^[a-z0-9_]{1,80}$'),
  event_id uuid references commerce_private.payment_events(id) on delete restrict,
  revision integer not null,
  refunded_minor integer not null default 0 check(refunded_minor >= 0),
  created_at timestamptz not null default now(),
  unique(contract_id,revision)
);

create table public.order_asset_entitlements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  order_id uuid not null,
  buyer_user_id uuid not null,
  asset_version_id uuid not null references commerce_private.asset_versions(id) on delete restrict,
  asset_type text not null default 'master' check(asset_type='master'),
  state text not null default 'pending' check(state in ('pending','active','suspended','revoked','failed')),
  reason_code text not null default 'awaiting_verification' check(reason_code ~ '^[a-z0-9_]{1,80}$'),
  commercial_rights_granted boolean not null default false check(not commercial_rights_granted),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  foreign key(contract_id,order_id,buyer_user_id) references public.order_delivery_contracts(id,order_id,buyer_user_id) on delete restrict,
  unique(contract_id,asset_version_id),
  unique(contract_id,asset_type)
);
create index commerce_entitlement_buyer on public.order_asset_entitlements(buyer_user_id,created_at);
create index commerce_entitlement_asset on public.order_asset_entitlements(asset_version_id,buyer_user_id);

create table commerce_private.fulfillment_jobs (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.order_delivery_contracts(id) on delete restrict,
  task text not null check(task in ('asset_preparation','receipt_generation','entitlement_activation','transaction_projection')),
  revision integer not null check(revision > 0),
  event_id uuid not null references commerce_private.payment_events(id) on delete restrict,
  state text not null default 'pending' check(state in ('pending','processing','complete','failed')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  retryable boolean not null default true,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  error_code text check(error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(contract_id,task,revision),
  check((state='processing') = (lease_token is not null and lease_until is not null))
);
create index commerce_job_claim on commerce_private.fulfillment_jobs(task,available_at) where state in ('pending','processing','failed');

create table public.order_receipts (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null,
  order_id uuid not null,
  buyer_user_id uuid not null,
  revision integer not null check(revision > 0),
  document_kind text not null check(document_kind in ('test_receipt','test_adjustment')),
  track_title text not null,
  license_name text not null,
  amount_minor integer not null check(amount_minor > 0),
  refunded_minor integer not null check(refunded_minor between 0 and amount_minor),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  payment_mode text not null default 'test' check(payment_mode='test'),
  commercial_rights_granted boolean not null default false check(not commercial_rights_granted),
  payment_state text not null,
  payment_date timestamptz not null,
  state text not null default 'pending' check(state in ('pending','ready','failed','superseded')),
  created_at timestamptz not null default now(),
  foreign key(contract_id,order_id,buyer_user_id) references public.order_delivery_contracts(id,order_id,buyer_user_id) on delete restrict,
  unique(contract_id,revision)
);
create table commerce_private.receipt_artifacts (
  receipt_id uuid primary key references public.order_receipts(id) on delete restrict,
  event_id uuid not null references commerce_private.payment_events(id) on delete restrict,
  bucket_id text not null default 'order-receipts' check(bucket_id='order-receipts'),
  object_path text generated always as (receipt_id::text || '/receipt.pdf') stored,
  object_id uuid unique references storage.objects(id) on delete restrict,
  object_version text,
  sha256 text check(sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint check(byte_size between 1 and 20971520),
  unique(bucket_id,object_path),
  check(object_id is null or (object_version is not null and sha256 is not null and byte_size is not null))
);
create table public.artist_transaction_records (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.order_delivery_contracts(id) on delete restrict,
  seller_user_id uuid not null references auth.users(id) on delete restrict,
  revision integer not null check(revision > 0),
  track_title text not null,
  license_name text not null,
  amount_minor integer not null check(amount_minor > 0),
  refunded_minor integer not null check(refunded_minor between 0 and amount_minor),
  currency text not null check(currency ~ '^[A-Z]{3}$'),
  payment_state text not null,
  payment_mode text not null default 'test' check(payment_mode='test'),
  payable_earnings_calculated boolean not null default false check(not payable_earnings_calculated),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(contract_id,revision)
);
create index commerce_contract_buyer on public.order_delivery_contracts(buyer_user_id,created_at);
create index commerce_receipt_buyer on public.order_receipts(buyer_user_id,created_at);
create index commerce_transaction_seller on public.artist_transaction_records(seller_user_id,created_at);

-- Explicit grants override Supabase's permissive public-schema default grants.
do $$ declare t text; begin
  foreach t in array array['order_delivery_contracts','order_asset_entitlements','order_receipts','artist_transaction_records'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on public.%I to authenticated,service_role',t);
  end loop;
  for t in select tablename from pg_tables where schemaname='commerce_private' loop
    execute format('alter table commerce_private.%I enable row level security',t);
    execute format('revoke all on commerce_private.%I from public,anon,authenticated,service_role',t);
    execute format('grant select on commerce_private.%I to service_role',t);
  end loop;
end $$;
create policy commerce_buyer_contract_read on public.order_delivery_contracts for select to authenticated
  using ((select public.current_app_role())='buyer' and buyer_user_id=(select auth.uid()));
create policy commerce_buyer_entitlement_read on public.order_asset_entitlements for select to authenticated
  using ((select public.current_app_role())='buyer' and buyer_user_id=(select auth.uid()));
create policy commerce_buyer_receipt_read on public.order_receipts for select to authenticated
  using ((select public.current_app_role())='buyer' and buyer_user_id=(select auth.uid()));
create policy commerce_artist_transaction_read on public.artist_transaction_records for select to authenticated
  using ((select public.current_app_role())='artist' and seller_user_id=(select auth.uid()));

-- Restrictive policies cannot grant access; they deny these new buckets even if a
-- later permissive policy accidentally grants broad storage.objects access.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('purchase-assets','purchase-assets',false,52428800,array['audio/mpeg','audio/wav','audio/x-wav','audio/aiff','audio/flac']),
 ('order-receipts','order-receipts',false,20971520,array['application/pdf']);
create policy commerce_private_objects on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id not in ('purchase-assets','order-receipts'))
 with check(bucket_id not in ('purchase-assets','order-receipts'));
create function commerce_private.guard_bucket_privacy() returns trigger
language plpgsql set search_path='' as $$ begin
 if old.id in ('purchase-assets','order-receipts') and
   (tg_op='DELETE' or new.id is distinct from old.id or new.public is distinct from false) then
   raise exception 'Commerce buckets must remain private and retained';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger guard_commerce_bucket_privacy before update or delete on storage.buckets
 for each row execute function commerce_private.guard_bucket_privacy();

create function commerce_private.assert_enabled(capability text default 'foundation') returns void
language plpgsql security definer set search_path='' as $$
declare c commerce_private.capabilities;
begin
 select * into strict c from commerce_private.capabilities where singleton;
 if not c.foundation_enabled or not (case capability
   when 'foundation' then true when 'asset_preparation' then c.asset_preparation_enabled
   when 'receipt_generation' then c.receipt_generation_enabled
   when 'entitlement_activation' then c.entitlement_activation_enabled
   when 'transaction_projection' then c.transaction_projection_enabled else false end) then
   raise exception 'Commerce capability disabled' using errcode='42501';
 end if;
end $$;

create function commerce_private.immutable_row() returns trigger
language plpgsql set search_path='' as $$ begin
 raise exception 'Immutable commerce record: append a new version' using errcode='23514';
end $$;
do $$ declare t text; begin
 foreach t in array array['contract_context','payment_events','state_history'] loop
   execute format('create trigger immutable_commerce before update or delete on commerce_private.%I for each row execute function commerce_private.immutable_row()',t);
 end loop;
 foreach t in array array['order_delivery_contracts','artist_transaction_records'] loop
   execute format('create trigger immutable_commerce before update or delete on public.%I for each row execute function commerce_private.immutable_row()',t);
 end loop;
end $$;

create function commerce_private.guard_asset_version() returns trigger
language plpgsql security definer set search_path='' as $$ begin
 if tg_op='DELETE' then raise exception 'Asset versions are retained'; end if;
 if (to_jsonb(new)-array['object_path','state','approval_state','retired_at','object_id','object_version','sha256','byte_size','mime_type'])
    is distinct from (to_jsonb(old)-array['object_path','state','approval_state','retired_at','object_id','object_version','sha256','byte_size','mime_type'])
    or (old.state='ready' and (to_jsonb(new)-array['retired_at','object_path']) is distinct from (to_jsonb(old)-array['retired_at','object_path']))
    or (old.retired_at is not null and new.retired_at is distinct from old.retired_at) then
   raise exception 'Immutable asset version';
 end if;
 return new;
end $$;
create trigger immutable_asset_version before update or delete on commerce_private.asset_versions
 for each row execute function commerce_private.guard_asset_version();

create function commerce_private.guard_storage_version() returns trigger
language plpgsql security definer set search_path='' as $$
declare referenced boolean;
begin
 select exists(select 1 from commerce_private.asset_versions a where
   (a.source_bucket=old.bucket_id and a.source_path=old.name) or (a.bucket_id=old.bucket_id and a.object_path=old.name))
   or exists(select 1 from commerce_private.receipt_artifacts r where r.bucket_id=old.bucket_id and r.object_path=old.name)
 into referenced;
 if referenced and (tg_op='DELETE' or new.id is distinct from old.id or new.bucket_id is distinct from old.bucket_id
   or new.name is distinct from old.name or new.version is distinct from old.version or new.metadata is distinct from old.metadata) then
   raise exception 'Commerce artifact is immutable';
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
create trigger guard_commerce_storage_version before update or delete on storage.objects
 for each row execute function commerce_private.guard_storage_version();

-- No path argument: source is locked and derived from the approved catalog.
create function commerce_private.reserve_asset(p_track uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare t public.tracks; o storage.objects; result uuid;
begin
 perform commerce_private.assert_enabled('asset_preparation');
 select * into strict t from public.tracks where id=p_track for share;
 if t.status <> 'approved' or t.audio_file_path is null then raise exception 'Track not eligible'; end if;
 select * into strict o from storage.objects where bucket_id='track-audio' and name=t.audio_file_path for share;
 if o.version is null then raise exception 'Source version unavailable'; end if;
 insert into commerce_private.asset_versions(track_id,source_object_id,source_bucket,source_path,source_version)
 values(t.id,o.id,o.bucket_id,o.name,o.version) on conflict(track_id,source_object_id,source_version,asset_type) do nothing
 returning id into result;
 if result is null then select id into result from commerce_private.asset_versions where track_id=t.id and source_object_id=o.id and source_version=o.version; end if;
 return result;
end $$;

create function commerce_private.seal_asset(p_asset uuid,p_sha256 text,p_size bigint,p_mime text) returns void
language plpgsql security definer set search_path='' as $$
declare a commerce_private.asset_versions; o storage.objects;
begin
 perform commerce_private.assert_enabled('asset_preparation');
 select * into strict a from commerce_private.asset_versions where id=p_asset for update;
 select * into strict o from storage.objects where bucket_id=a.bucket_id and name=a.object_path for share;
 if o.version is null or (o.metadata->>'size')::bigint is distinct from p_size
   or o.metadata->>'mimetype' is distinct from p_mime then raise exception 'Artifact metadata mismatch'; end if;
 if a.state='ready' then
   if a.object_id=o.id and a.object_version=o.version and a.sha256=p_sha256 and a.byte_size=p_size and a.mime_type=p_mime then return; end if;
   raise exception 'Sealed asset mismatch';
 end if;
 update commerce_private.asset_versions set object_id=o.id,object_version=o.version,sha256=p_sha256,byte_size=p_size,
 mime_type=p_mime,state='ready',approval_state='approved' where id=a.id;
end $$;

-- Capture BEFORE creating the provider session. No legacy/paid order path exists.
create function commerce_private.freeze_contract(p_order uuid,p_environment text,p_account text) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders; t public.tracks; l public.license_types; price integer; result uuid; rights jsonb;
begin
 perform commerce_private.assert_enabled();
 select * into strict o from public.orders where id=p_order for update;
 select id into result from public.order_delivery_contracts where order_id=o.id;
 if result is not null then
   if exists(select 1 from public.order_delivery_contracts c join commerce_private.contract_context x on x.contract_id=c.id
     where c.id=result and c.deployment_environment=p_environment and x.provider_account=p_account) then return result; end if;
   raise exception 'Existing contract context mismatch';
 end if;
 if o.status <> 'pending' or o.paid_at is not null or o.stripe_checkout_session_id is not null then
   raise exception 'Contract must precede checkout; historical orders require separate review';
 end if;
 if not exists(select 1 from public.user_profiles where id=o.buyer_user_id and role='buyer') then raise exception 'Canonical buyer required'; end if;
 select * into strict t from public.tracks where id=o.track_id for share;
 select * into strict l from public.license_types where id=o.license_type_id for share;
 select coalesce(price_cents,l.default_price_cents) into strict price from public.track_license_options where track_id=t.id and license_type_id=l.id and active for share;
 if t.status <> 'approved' or not l.active or price is null or price<=0 or o.amount_cents is distinct from price or o.currency <> 'USD' then raise exception 'Trusted catalog price/eligibility mismatch'; end if;
 select jsonb_agg(jsonb_build_object('id',id,'name',name,'email',email,'role',role_type,'ownershipPercent',ownership_percent) order by id)
 into rights from public.rights_holders where track_id=t.id;
 if rights is null or (select sum(ownership_percent) from public.rights_holders where track_id=t.id) <> 100 then raise exception 'Rights snapshot incomplete'; end if;
 insert into public.order_delivery_contracts(order_id,buyer_user_id,seller_user_id,track_id,license_type_id,track_title,license_name,amount_minor,currency,payment_mode,deployment_environment)
 values(o.id,o.buyer_user_id,t.artist_user_id,t.id,l.id,t.title,l.name,o.amount_cents,o.currency,'test',p_environment) returning id into result;
 insert into commerce_private.contract_context(contract_id,provider_account,rights_snapshot,license_snapshot) values(result,p_account,rights,to_jsonb(l));
 insert into commerce_private.order_states(contract_id) values(result);
 return result;
end $$;

-- A fixture designation is a separate, explicit deployment-owner approval. It
-- never follows an email suffix, title, price, metadata role or checkout input.
create function commerce_private.reserve_entitlement(p_contract uuid,p_asset uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.order_delivery_contracts; a commerce_private.asset_versions; result uuid; o public.orders;
begin
 perform commerce_private.assert_enabled('entitlement_activation');
 select * into strict c from public.order_delivery_contracts where id=p_contract;
 select * into strict o from public.orders where id=c.order_id for update;
 select * into strict a from commerce_private.asset_versions where id=p_asset for share;
 if a.track_id <> c.track_id or a.retired_at is not null or not exists(select 1 from commerce_private.qa_fixture_designations
    where asset_version_id=a.id and buyer_user_id=c.buyer_user_id and revoked_at is null) then
   raise exception 'TEST master requires explicit synthetic asset AND buyer approval' using errcode='42501';
 end if;
 select id into result from public.order_asset_entitlements where contract_id=c.id and asset_version_id=a.id;
 if result is not null then return result; end if;
 if o.status<>'pending' or o.paid_at is not null or o.stripe_checkout_session_id is not null then
   raise exception 'Exact asset must be reserved before checkout';
 end if;
 insert into public.order_asset_entitlements(contract_id,order_id,buyer_user_id,asset_version_id)
 values(c.id,c.order_id,c.buyer_user_id,a.id) on conflict(contract_id,asset_version_id) do nothing returning id into result;
 if result is null then select id into result from public.order_asset_entitlements where contract_id=c.id and asset_version_id=a.id; end if;
 return result;
end $$;

create function commerce_private.guard_entitlement() returns trigger
language plpgsql security definer set search_path='' as $$
declare c public.order_delivery_contracts; a commerce_private.asset_versions;
begin
 if tg_op='DELETE' then raise exception 'Entitlements are retained'; end if;
 if tg_op='UPDATE' and ((to_jsonb(new)-array['state','reason_code','updated_at','activated_at']) is distinct from
 (to_jsonb(old)-array['state','reason_code','updated_at','activated_at']) or (old.state='revoked' and new.state <> 'revoked')) then
   raise exception 'Entitlement identity/revocation is immutable'; end if;
 select * into strict c from public.order_delivery_contracts where id=new.contract_id;
 select * into strict a from commerce_private.asset_versions where id=new.asset_version_id;
 if a.track_id <> c.track_id then raise exception 'Wrong contract asset'; end if;
 if new.state in ('pending','active') and not exists(select 1 from commerce_private.qa_fixture_designations where
 asset_version_id=a.id and buyer_user_id=c.buyer_user_id and revoked_at is null) then raise exception 'Real-catalog TEST master denied'; end if;
 if new.state='active' then
   perform commerce_private.assert_enabled('entitlement_activation');
   if a.state <> 'ready' or a.approval_state <> 'approved' or a.retired_at is not null
      or not exists(select 1 from commerce_private.order_states s join commerce_private.payment_events e on e.id=s.event_id
        where s.contract_id=c.id and s.state in ('PAID','FULFILLED') and e.payment_state='PAID' and e.contract_id=c.id)
      or not exists(select 1 from public.generated_licenses g where g.order_id=c.order_id and g.buyer_id=c.buyer_user_id
        and g.track_id=c.track_id and g.license_type_id=c.license_type_id and g.status='generated' and g.pdf_storage_path is not null
        and g.terms_snapshot_json->'payment'->>'paymentMode'='test'
        and g.terms_snapshot_json->'payment'->>'commercialRightsGranted'='false'
        and g.terms_snapshot_json->'license'->>'pricePaidCents'=c.amount_minor::text
        and g.terms_snapshot_json->'license'->>'currency'=c.currency)
   then raise exception 'Activation prerequisites missing'; end if;
 end if;
 return new;
end $$;
create trigger guard_commerce_entitlement before insert or update or delete on public.order_asset_entitlements
 for each row execute function commerce_private.guard_entitlement();

-- Trusted adapter must verify Stripe's raw-body signature BEFORE invoking this
-- private function. The database verifies binding, classification and dedupe;
-- a boolean supplied by a browser is never accepted as payment evidence.
create function commerce_private.record_payment_event(p_contract uuid,p_account text,p_event text,p_session text,p_intent text,
 p_type text,p_state text,p_amount integer,p_refunded integer,p_currency text,p_hash text,p_occurred timestamptz) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.order_delivery_contracts; o public.orders; s commerce_private.order_states;
 existing commerce_private.payment_events; result uuid; next_state text; next_revision integer; payment_received_while_held boolean;
begin
 perform commerce_private.assert_enabled();
 select * into strict c from public.order_delivery_contracts where id=p_contract;
 select * into strict o from public.orders where id=c.order_id for share;
 select * into strict s from commerce_private.order_states where contract_id=c.id for update;
 select * into existing from commerce_private.payment_events where provider='stripe' and provider_account=p_account and payment_mode='test' and provider_event_id=p_event;
 if found then
   if existing.contract_id=c.id and existing.checkout_session_id=p_session and existing.payment_intent_id=p_intent
      and existing.event_type=p_type and existing.payment_state=p_state and existing.amount_minor=p_amount
      and existing.refunded_minor=p_refunded and existing.currency=p_currency and existing.evidence_sha256=p_hash
      and existing.provider_created_at=p_occurred then return existing.id; end if;
   raise exception 'Conflicting duplicate payment evidence';
 end if;
 if not exists(select 1 from commerce_private.contract_context where contract_id=c.id and provider_account=p_account)
    or o.stripe_checkout_session_id is distinct from p_session or o.stripe_payment_intent_id is distinct from p_intent
    or o.buyer_user_id <> c.buyer_user_id or o.track_id <> c.track_id or o.license_type_id <> c.license_type_id
    or p_amount <> c.amount_minor or p_currency <> c.currency or o.amount_cents <> c.amount_minor or o.currency <> c.currency then
   raise exception 'Verified event/order relationship mismatch'; end if;
 if not ((p_state='PAID' and p_type in ('checkout.session.completed','checkout.session.async_payment_succeeded') and p_refunded=0)
   or (p_state='PAYMENT_FAILED' and p_type='checkout.session.async_payment_failed' and p_refunded=0)
   or (p_state='REFUNDED' and p_type='charge.refunded' and p_refunded=p_amount)
   or (p_state='PARTIALLY_REFUNDED' and p_type='charge.refunded' and p_refunded>0 and p_refunded<p_amount)
   or (p_state='DISPUTED' and p_type='charge.dispute.created')) then raise exception 'Incompatible payment event'; end if;
 insert into commerce_private.payment_events(provider_account,provider_event_id,payment_mode,livemode,contract_id,checkout_session_id,payment_intent_id,
 event_type,payment_state,amount_minor,refunded_minor,currency,evidence_sha256,verification_method,provider_created_at)
 values(p_account,p_event,'test',false,c.id,p_session,p_intent,p_type,p_state,p_amount,p_refunded,p_currency,p_hash,'stripe_signature',p_occurred) returning id into result;
 -- Conservative monotone holds: no stale paid event or dispute-close event may restore access.
 next_state := case when s.state='SECURITY_HOLD' then s.state when p_state='REFUNDED' or s.state='REFUNDED' then 'REFUNDED'
   when p_state='DISPUTED' or s.state='DISPUTED' then 'DISPUTED'
   when p_state='PARTIALLY_REFUNDED' or s.state='PARTIALLY_REFUNDED' then 'PARTIALLY_REFUNDED'
   when p_state='PAYMENT_FAILED' or s.state='PAYMENT_FAILED' then 'PAYMENT_FAILED'
   when s.state='FULFILLED' then 'FULFILLED' else p_state end;
 -- Different Stripe events for the same logical payment do not duplicate jobs,
 -- receipts or projections. Evidence is retained, including late/stale events.
 payment_received_while_held:=s.state='SECURITY_HOLD' and p_state='PAID' and s.payment_received_event_id is null;
 if next_state=s.state and p_refunded<=s.refunded_minor and not payment_received_while_held then return result; end if;
 next_revision:=s.revision+1;
 update commerce_private.order_states set state=next_state,event_id=case when next_state=p_state then result else event_id end,
 payment_received_event_id=case when p_state='PAID' then coalesce(payment_received_event_id,result) else payment_received_event_id end,
 refunded_minor=greatest(refunded_minor,p_refunded),revision=next_revision,updated_at=now() where contract_id=c.id;
 insert into commerce_private.state_history(contract_id,state,reason_code,event_id,revision,refunded_minor)
 values(c.id,next_state,case when payment_received_while_held then 'payment_received_while_held' else 'verified_provider_event' end,
 result,next_revision,greatest(s.refunded_minor,p_refunded));
 update public.order_asset_entitlements set state=case when next_state='REFUNDED' then 'revoked' else 'suspended' end,
 reason_code=lower(next_state),updated_at=now() where contract_id=c.id and state <> 'revoked' and next_state not in ('PAID','FULFILLED');
 insert into commerce_private.fulfillment_jobs(contract_id,task,revision,event_id)
 select c.id,task,next_revision,result from unnest(case when next_state='PAYMENT_FAILED' then array['transaction_projection']
   when next_state in ('PAID','FULFILLED') and exists(select 1 from public.order_asset_entitlements where contract_id=c.id)
   then array['asset_preparation','receipt_generation','entitlement_activation','transaction_projection']
   else array['receipt_generation','transaction_projection'] end) task on conflict do nothing;
 return result;
end $$;

create function commerce_private.security_hold(p_contract uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
 declare n integer;
begin
 -- Holds remain available when fulfillment capabilities are OFF.
 update commerce_private.order_states set state='SECURITY_HOLD',revision=revision+1,updated_at=now()
 where contract_id=p_contract returning revision into n;
 if n is null then raise exception 'Contract missing'; end if;
 insert into commerce_private.state_history(contract_id,state,reason_code,revision,event_id,refunded_minor)
 select p_contract,'SECURITY_HOLD',p_reason,n,event_id,refunded_minor from commerce_private.order_states where contract_id=p_contract;
 insert into commerce_private.fulfillment_jobs(contract_id,task,revision,event_id)
 select p_contract,'transaction_projection',n,event_id from commerce_private.order_states where contract_id=p_contract and event_id is not null;
 update public.order_asset_entitlements set state='suspended',reason_code=p_reason,updated_at=now()
 where contract_id=p_contract and state <> 'revoked';
end $$;

create function commerce_private.claim_job(p_task text) returns setof commerce_private.fulfillment_jobs
language plpgsql security definer set search_path='' as $$
begin
 perform commerce_private.assert_enabled(p_task);
 -- Exhausted leases become terminal; a recovery run cannot spin indefinitely.
 update commerce_private.fulfillment_jobs set state='failed',retryable=false,lease_token=null,lease_until=null,error_code='attempts_exhausted'
 where task=p_task and state='processing' and lease_until<now() and attempts>=5;
 return query with candidate as (
 select id from commerce_private.fulfillment_jobs where task=p_task and attempts<5 and available_at<=now()
 and (state='pending' or (state='failed' and retryable) or (state='processing' and lease_until<now()))
 order by available_at,id for update skip locked limit 1)
 update commerce_private.fulfillment_jobs j set state='processing',attempts=attempts+1,lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',error_code=null
 from candidate where j.id=candidate.id returning j.*;
end $$;
create function commerce_private.assert_lease(p_job uuid,p_token uuid) returns commerce_private.fulfillment_jobs
language plpgsql security definer set search_path='' as $$ declare j commerce_private.fulfillment_jobs; begin
 select * into strict j from commerce_private.fulfillment_jobs where id=p_job for update;
 perform commerce_private.assert_enabled(j.task);
 if j.state<>'processing' or j.lease_token is distinct from p_token or j.lease_until<=now() then raise exception 'Stale worker lease'; end if;
 return j;
end $$;

-- Snapshot creation is database-derived from immutable payment/contract facts.
create function commerce_private.prepare_receipt(p_job uuid,p_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare j commerce_private.fulfillment_jobs; c public.order_delivery_contracts; e commerce_private.payment_events; result uuid;
begin
 j:=commerce_private.assert_lease(p_job,p_token);
 if j.task<>'receipt_generation' then raise exception 'Wrong task'; end if;
 select * into strict c from public.order_delivery_contracts where id=j.contract_id;
 select * into strict e from commerce_private.payment_events where id=j.event_id;
 if e.payment_state='PAYMENT_FAILED' then raise exception 'Unpaid event has no payment receipt'; end if;
 insert into public.order_receipts(contract_id,order_id,buyer_user_id,revision,document_kind,track_title,license_name,amount_minor,refunded_minor,currency,payment_state,payment_date)
 values(c.id,c.order_id,c.buyer_user_id,j.revision,case when e.payment_state='PAID' then 'test_receipt' else 'test_adjustment' end,
 c.track_title,c.license_name,c.amount_minor,e.refunded_minor,c.currency,e.payment_state,e.provider_created_at)
 on conflict(contract_id,revision) do nothing returning id into result;
 if result is null then select id into result from public.order_receipts where contract_id=c.id and revision=j.revision; end if;
 insert into commerce_private.receipt_artifacts(receipt_id,event_id) values(result,e.id) on conflict do nothing;
 return result;
end $$;

create function commerce_private.guard_receipt() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' then raise exception 'Receipt history is retained'; end if;
 if (to_jsonb(new)-'state') is distinct from (to_jsonb(old)-'state')
 or (old.state='ready' and new.state not in ('ready','superseded'))
 or (old.state='superseded' and new.state<>'superseded') then raise exception 'Receipt facts are immutable'; end if;
 return new;
end $$;
create trigger immutable_receipt before update or delete on public.order_receipts for each row execute function commerce_private.guard_receipt();
create function commerce_private.guard_receipt_artifact() returns trigger
language plpgsql set search_path='' as $$ begin
 if tg_op='DELETE' or old.object_id is not null or new.receipt_id<>old.receipt_id or new.event_id<>old.event_id
 or new.bucket_id<>old.bucket_id then raise exception 'Receipt artifact immutable'; end if;
 return new;
end $$;
create trigger immutable_receipt_artifact before update or delete on commerce_private.receipt_artifacts for each row execute function commerce_private.guard_receipt_artifact();

create function commerce_private.seal_receipt(p_job uuid,p_token uuid,p_sha256 text,p_size bigint) returns void
language plpgsql security definer set search_path='' as $$
declare j commerce_private.fulfillment_jobs; r public.order_receipts; a commerce_private.receipt_artifacts; o storage.objects;
begin
 j:=commerce_private.assert_lease(p_job,p_token);
 if j.task<>'receipt_generation' then raise exception 'Wrong task'; end if;
 select * into strict r from public.order_receipts where contract_id=j.contract_id and revision=j.revision for update;
 select * into strict a from commerce_private.receipt_artifacts where receipt_id=r.id for update;
 select * into strict o from storage.objects where bucket_id=a.bucket_id and name=a.object_path for share;
 if o.version is null or (o.metadata->>'size')::bigint is distinct from p_size or o.metadata->>'mimetype' is distinct from 'application/pdf' then raise exception 'Receipt artifact mismatch'; end if;
 if a.object_id is not null then
   if a.object_id=o.id and a.object_version=o.version and a.sha256=p_sha256 and a.byte_size=p_size then return; end if;
   raise exception 'Sealed receipt mismatch';
 end if;
 update commerce_private.receipt_artifacts set object_id=o.id,object_version=o.version,sha256=p_sha256,byte_size=p_size where receipt_id=r.id;
 update public.order_receipts set state='ready' where id=r.id;
end $$;

-- Completion fences stale workers and materializes database-only results atomically.
create function commerce_private.finish_job(p_job uuid,p_token uuid,p_success boolean,p_retryable boolean default false,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare j commerce_private.fulfillment_jobs; c public.order_delivery_contracts; e commerce_private.payment_events; next_revision integer;
begin
 j:=commerce_private.assert_lease(p_job,p_token);
 if not p_success and j.task='receipt_generation' then
   update public.order_receipts set state='failed' where contract_id=j.contract_id and revision=j.revision and state='pending';
 end if;
 if p_success then
   select * into strict c from public.order_delivery_contracts where id=j.contract_id;
   select * into strict e from commerce_private.payment_events where id=j.event_id;
   perform 1 from commerce_private.order_states where contract_id=c.id for update;
   if j.task='transaction_projection' then
     insert into public.artist_transaction_records(contract_id,seller_user_id,revision,track_title,license_name,amount_minor,refunded_minor,currency,payment_state,occurred_at)
     select c.id,c.seller_user_id,j.revision,c.track_title,c.license_name,c.amount_minor,h.refunded_minor,c.currency,h.state,e.provider_created_at
     from commerce_private.state_history h where h.contract_id=c.id and h.revision=j.revision
     on conflict(contract_id,revision) do nothing;
   elsif j.task='receipt_generation' then
     if not exists(select 1 from public.order_receipts where contract_id=c.id and revision=j.revision and state='ready') then raise exception 'Receipt not ready'; end if;
   elsif j.task='asset_preparation' then
     if not exists(select 1 from public.order_asset_entitlements n join commerce_private.asset_versions a on a.id=n.asset_version_id
       where n.contract_id=c.id and a.state='ready' and a.retired_at is null) then raise exception 'No entitled prepared fixture'; end if;
   elsif j.task='entitlement_activation' then
     if not exists(select 1 from public.order_asset_entitlements where contract_id=c.id) then raise exception 'No designated QA entitlement'; end if;
     update public.order_asset_entitlements set state='active',reason_code='verified_synthetic_qa',activated_at=coalesce(activated_at,now()),updated_at=now()
       where contract_id=c.id and state in ('pending','active');
     if not exists(select 1 from public.order_asset_entitlements where contract_id=c.id and state='active') then raise exception 'Activation blocked'; end if;
     -- Existing orders.fulfilled retains its original agreement-only meaning.
     update commerce_private.order_states set state='FULFILLED',revision=revision+1,updated_at=now()
       where contract_id=c.id and state='PAID' returning revision into next_revision;
     if next_revision is not null then
       insert into commerce_private.state_history(contract_id,state,reason_code,event_id,revision,refunded_minor)
       select c.id,'FULFILLED','entitlements_activated',event_id,next_revision,refunded_minor
       from commerce_private.order_states where contract_id=c.id;
     end if;
   end if;
 end if;
 update commerce_private.fulfillment_jobs set state=case when p_success then 'complete' else 'failed' end,
 retryable=not p_success and p_retryable and attempts<5,available_at=now()+interval '1 minute',
 lease_token=null,lease_until=null,error_code=case when p_success then null else coalesce(p_error,'worker_failed') end,
 completed_at=case when p_success then now() else null end where id=j.id;
end $$;

-- Foundation predicate only: no URL generation and no public RPC. A later server
-- download adapter must supply the authenticated canonical buyer, never browser
-- claims, and re-check this predicate immediately before short-lived delivery.
create function commerce_private.can_deliver(p_entitlement uuid,p_buyer uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.order_asset_entitlements n
 join public.order_delivery_contracts c on c.id=n.contract_id
 join commerce_private.asset_versions a on a.id=n.asset_version_id
 join commerce_private.order_states s on s.contract_id=c.id
 join commerce_private.payment_events e on e.id=s.event_id and e.contract_id=c.id
 join commerce_private.qa_fixture_designations q on q.asset_version_id=a.id and q.buyer_user_id=c.buyer_user_id
 join public.user_profiles u on u.id=c.buyer_user_id and u.role='buyer'
 join public.generated_licenses g on g.order_id=c.order_id and g.buyer_id=c.buyer_user_id
   and g.track_id=c.track_id and g.license_type_id=c.license_type_id and g.status='generated' and g.pdf_storage_path is not null
 cross join commerce_private.capabilities f
 where n.id=p_entitlement and n.buyer_user_id=p_buyer and n.state='active'
 and f.foundation_enabled and f.entitlement_activation_enabled
 and s.state in ('PAID','FULFILLED') and e.payment_state='PAID'
 and a.state='ready' and a.approval_state='approved' and a.retired_at is null and q.revoked_at is null
 and not c.commercial_rights_granted and c.payment_mode='test'
 and g.terms_snapshot_json->'payment'->>'paymentMode'='test'
 and g.terms_snapshot_json->'payment'->>'commercialRightsGranted'='false'
 and g.terms_snapshot_json->'license'->>'pricePaidCents'=c.amount_minor::text
 and g.terms_snapshot_json->'license'->>'currency'=c.currency);
$$;

create function commerce_private.suspend_retired_fixture() returns trigger
language plpgsql security definer set search_path='' as $$ declare c uuid; begin
 if tg_table_name='qa_fixture_designations' then
   if tg_op='DELETE' then raise exception 'QA approval history is retained'; end if;
   if (to_jsonb(new)-'revoked_at') is distinct from (to_jsonb(old)-'revoked_at') or
      (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then raise exception 'QA approval immutable'; end if;
   if new.revoked_at is null then return new; end if;
   for c in select distinct contract_id from public.order_asset_entitlements where asset_version_id=new.asset_version_id and buyer_user_id=new.buyer_user_id loop
     perform commerce_private.security_hold(c,'qa_designation_revoked');
   end loop;
 else
   if new.retired_at is null or old.retired_at is not null then return new; end if;
   for c in select distinct contract_id from public.order_asset_entitlements where asset_version_id=new.id loop
     perform commerce_private.security_hold(c,'asset_retired');
   end loop;
 end if;
 return new;
end $$;
create trigger revoke_qa_fixture before update or delete on commerce_private.qa_fixture_designations
 for each row execute function commerce_private.suspend_retired_fixture();
create trigger retire_qa_asset after update on commerce_private.asset_versions
 for each row execute function commerce_private.suspend_retired_fixture();

-- New private functions are not PostgREST-exposed. A future reviewed server
-- adapter must call them through a trusted database boundary. No adapter ships here.
revoke all on all functions in schema commerce_private from public,anon,authenticated,service_role;
grant execute on function commerce_private.reserve_asset(uuid),commerce_private.seal_asset(uuid,text,bigint,text),
 commerce_private.freeze_contract(uuid,text,text),commerce_private.reserve_entitlement(uuid,uuid),
 commerce_private.record_payment_event(uuid,text,text,text,text,text,text,integer,integer,text,text,timestamptz),
 commerce_private.security_hold(uuid,text),commerce_private.claim_job(text),
 commerce_private.prepare_receipt(uuid,uuid),commerce_private.seal_receipt(uuid,uuid,text,bigint),
 commerce_private.finish_job(uuid,uuid,boolean,boolean,text),commerce_private.can_deliver(uuid,uuid) to service_role;
comment on schema commerce_private is 'Phase 2A dormant TEST-only commerce foundation. Never add to exposed PostgREST schemas.';
comment on table public.artist_transaction_records is 'Transaction facts only. TEST. No payable earnings, payouts or buyer billing data.';
comment on table public.order_receipts is 'Immutable TEST receipt facts; not a tax invoice. Private artifacts have no client Storage policy.';
commit;
