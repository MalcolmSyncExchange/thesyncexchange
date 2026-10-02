-- Phase 2B. TEST-only payment-to-foundation adapters. No historical backfill.
-- All new execution paths remain dormant until the deployment owner enables the
-- internal adapter flag. Buyer delivery and worker capabilities remain separate.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if to_regnamespace('commerce_private') is null
     or to_regprocedure('commerce_private.freeze_contract(uuid,text,text)') is null
     or to_regprocedure('commerce_private.record_payment_event(uuid,text,text,text,text,text,text,integer,integer,text,text,timestamp with time zone)') is null
     or to_regclass('public.order_delivery_contracts') is null then
    raise exception 'Reviewed Phase 2A purchase-completion foundation is missing';
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='commerce_private' and table_name='capabilities'
      and column_name='payment_adapter_enabled'
  ) then
    raise exception 'Phase 2B payment adapter already exists: reconcile migration ledger, do not replay';
  end if;
end $$;

alter table commerce_private.capabilities
  add column payment_adapter_enabled boolean not null default false;

create function commerce_private.assert_payment_adapter_enabled() returns void
language plpgsql security definer set search_path='' as $$
declare enabled boolean;
begin
  select foundation_enabled and payment_adapter_enabled into strict enabled
  from commerce_private.capabilities where singleton;
  if not enabled then
    raise exception 'Commerce payment adapter disabled' using errcode='42501';
  end if;
end $$;

create function commerce_private.require_service_role() returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
end $$;

-- Pending entitlement reservation is deliberately separate from activation.
-- It resolves only an already-approved, immutable QA asset/buyer designation.
create function commerce_private.reserve_pending_qa_entitlement(p_contract uuid,p_asset uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.order_delivery_contracts; a commerce_private.asset_versions; result uuid; o public.orders;
begin
  perform commerce_private.assert_payment_adapter_enabled();
  select * into strict c from public.order_delivery_contracts where id=p_contract;
  select * into strict o from public.orders where id=c.order_id for update;
  select * into strict a from commerce_private.asset_versions where id=p_asset for share;
  if a.track_id <> c.track_id or a.state <> 'ready' or a.approval_state <> 'approved' or a.retired_at is not null
     or a.sha256 is null or a.object_id is null or a.object_version is null
     or not exists (
       select 1 from commerce_private.qa_fixture_designations
       where asset_version_id=a.id and buyer_user_id=c.buyer_user_id and revoked_at is null
     ) then
    raise exception 'TEST master requires exact approved synthetic asset and buyer designation' using errcode='42501';
  end if;
  if o.status<>'pending' or o.paid_at is not null or o.stripe_checkout_session_id is not null then
    raise exception 'Exact asset must be reserved before checkout';
  end if;
  insert into public.order_asset_entitlements(contract_id,order_id,buyer_user_id,asset_version_id)
  values(c.id,c.order_id,c.buyer_user_id,a.id)
  on conflict(contract_id,asset_version_id) do nothing returning id into result;
  if result is null then
    select id into strict result from public.order_asset_entitlements
    where contract_id=c.id and asset_version_id=a.id;
  end if;
  return result;
end $$;

create function public.prepare_purchase_completion_checkout(
  p_order uuid,
  p_environment text,
  p_provider_account text
) returns table(contract_id uuid,entitlement_id uuid,asset_version_id uuid,synthetic_qa boolean)
language plpgsql security definer set search_path='' as $$
declare resolved_contract uuid; resolved_asset uuid; resolved_entitlement uuid; asset_count integer;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.assert_payment_adapter_enabled();
  if p_environment not in ('local','preview','production') or p_provider_account !~ '^acct_[A-Za-z0-9]+$' then
    raise exception 'Invalid purchase-completion adapter context';
  end if;
  resolved_contract:=commerce_private.freeze_contract(p_order,p_environment,p_provider_account);
  select count(*),(array_agg(a.id order by a.id))[1] into asset_count,resolved_asset
  from commerce_private.asset_versions a
  join public.order_delivery_contracts c on c.id=resolved_contract and c.track_id=a.track_id
  join commerce_private.qa_fixture_designations q on q.asset_version_id=a.id
    and q.buyer_user_id=c.buyer_user_id and q.revoked_at is null
  where a.asset_type='master' and a.state='ready' and a.approval_state='approved'
    and a.retired_at is null and a.sha256 is not null and a.object_id is not null and a.object_version is not null;
  if asset_count>1 then
    raise exception 'Multiple approved synthetic QA assets require deployment-owner reconciliation';
  end if;
  if asset_count=1 then
    resolved_entitlement:=commerce_private.reserve_pending_qa_entitlement(resolved_contract,resolved_asset);
  else
    resolved_asset:=null;
  end if;
  return query select resolved_contract,resolved_entitlement,resolved_asset,(resolved_entitlement is not null);
end $$;

create function public.record_purchase_completion_event(
  p_order uuid,
  p_provider_account text,
  p_provider_event text,
  p_checkout_session text,
  p_payment_intent text,
  p_event_type text,
  p_payment_state text,
  p_amount_minor integer,
  p_refunded_minor integer,
  p_currency text,
  p_evidence_sha256 text,
  p_provider_created_at timestamptz
) returns uuid
language plpgsql security definer set search_path='' as $$
declare contract uuid; stored_session text; stored_intent text; resolved_session text;
  contract_amount integer; contract_currency text; resolved_amount integer;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.assert_payment_adapter_enabled();
  select c.id,o.stripe_checkout_session_id,o.stripe_payment_intent_id,c.amount_minor,c.currency
    into strict contract,stored_session,stored_intent,contract_amount,contract_currency
  from public.order_delivery_contracts c join public.orders o on o.id=c.order_id
  where c.order_id=p_order;
  if stored_intent is distinct from p_payment_intent then
    raise exception 'Verified event/order PaymentIntent mismatch';
  end if;
  if p_event_type in ('charge.refunded','charge.dispute.created') then
    if p_checkout_session is not null and p_checkout_session<>'' and p_checkout_session is distinct from stored_session then
      raise exception 'Verified event/order Checkout Session mismatch';
    end if;
    resolved_session:=stored_session;
  else
    resolved_session:=p_checkout_session;
  end if;
  -- Stripe Dispute.amount is the disputed portion, which may be smaller than
  -- the original charge. Validate that signed value against the immutable
  -- contract, then use the immutable purchase amount for the foundation's
  -- payment-amount binding. The signed body digest retains event provenance.
  if p_event_type='charge.dispute.created' then
    if p_amount_minor<=0 or p_amount_minor>contract_amount or upper(p_currency) is distinct from contract_currency then
      raise exception 'Verified dispute amount/currency mismatch';
    end if;
    resolved_amount:=contract_amount;
  else
    resolved_amount:=p_amount_minor;
  end if;
  return commerce_private.record_payment_event(contract,p_provider_account,p_provider_event,resolved_session,
    p_payment_intent,p_event_type,p_payment_state,resolved_amount,p_refunded_minor,upper(p_currency),
    p_evidence_sha256,p_provider_created_at);
end $$;

create function public.hold_purchase_completion(p_order uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare contract uuid;
begin
  perform commerce_private.require_service_role();
  perform commerce_private.assert_payment_adapter_enabled();
  if p_reason !~ '^[a-z0-9_]{1,80}$' then raise exception 'Invalid hold reason'; end if;
  select id into strict contract from public.order_delivery_contracts where order_id=p_order;
  perform commerce_private.security_hold(contract,p_reason);
end $$;

-- Service-only worker boundary. These functions expose no buyer artifact URL and
-- retain the Phase 2A lease, fencing and per-task capability checks.
create function public.claim_purchase_completion_job(p_task text)
returns table(id uuid,contract_id uuid,task text,revision integer,event_id uuid,lease_token uuid,lease_until timestamptz)
language plpgsql security definer set search_path='' as $$
begin
  perform commerce_private.require_service_role();
  if p_task not in ('asset_preparation','receipt_generation','entitlement_activation','transaction_projection') then
    raise exception 'Invalid fulfillment task';
  end if;
  return query select j.id,j.contract_id,j.task,j.revision,j.event_id,j.lease_token,j.lease_until
    from commerce_private.claim_job(p_task) j;
end $$;

create function public.prepare_purchase_completion_receipt(p_job uuid,p_lease_token uuid) returns uuid
language plpgsql security definer set search_path='' as $$
begin
  perform commerce_private.require_service_role();
  return commerce_private.prepare_receipt(p_job,p_lease_token);
end $$;

create function public.seal_purchase_completion_receipt(p_job uuid,p_lease_token uuid,p_sha256 text,p_size bigint) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform commerce_private.require_service_role();
  perform commerce_private.seal_receipt(p_job,p_lease_token,p_sha256,p_size);
end $$;

create function public.finish_purchase_completion_job(
  p_job uuid,p_lease_token uuid,p_success boolean,p_retryable boolean default false,p_error text default null
) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform commerce_private.require_service_role();
  perform commerce_private.finish_job(p_job,p_lease_token,p_success,p_retryable,p_error);
end $$;

revoke all on function public.prepare_purchase_completion_checkout(uuid,text,text),
 public.record_purchase_completion_event(uuid,text,text,text,text,text,text,integer,integer,text,text,timestamptz),
 public.hold_purchase_completion(uuid,text),public.claim_purchase_completion_job(text),
 public.prepare_purchase_completion_receipt(uuid,uuid),public.seal_purchase_completion_receipt(uuid,uuid,text,bigint),
 public.finish_purchase_completion_job(uuid,uuid,boolean,boolean,text)
 from public,anon,authenticated;
grant execute on function public.prepare_purchase_completion_checkout(uuid,text,text),
 public.record_purchase_completion_event(uuid,text,text,text,text,text,text,integer,integer,text,text,timestamptz),
 public.hold_purchase_completion(uuid,text),public.claim_purchase_completion_job(text),
 public.prepare_purchase_completion_receipt(uuid,uuid),public.seal_purchase_completion_receipt(uuid,uuid,text,bigint),
 public.finish_purchase_completion_job(uuid,uuid,boolean,boolean,text)
 to service_role;

revoke all on function commerce_private.assert_payment_adapter_enabled(),commerce_private.require_service_role(),
 commerce_private.reserve_pending_qa_entitlement(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function commerce_private.assert_payment_adapter_enabled(),commerce_private.require_service_role(),
 commerce_private.reserve_pending_qa_entitlement(uuid,uuid) to service_role;

comment on function public.prepare_purchase_completion_checkout(uuid,text,text) is
  'Service-role TEST adapter. Freezes trusted facts before Stripe session creation; real-catalog purchases receive no master entitlement.';
comment on function public.record_purchase_completion_event(uuid,text,text,text,text,text,text,integer,integer,text,text,timestamptz) is
  'Service-role TEST adapter. Call only after raw-body Stripe signature and livemode verification.';

commit;
