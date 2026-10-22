-- Local-reviewed candidate only. No capability is enabled. Hosted application
-- requires an approved migration/preflight window; missing RPCs fail closed.
begin;
create schema checkout_recovery;
revoke all on schema checkout_recovery from public,anon,authenticated;
create table checkout_recovery.baseline(installed_at timestamptz not null);
insert into checkout_recovery.baseline values(clock_timestamp());
alter table checkout_recovery.baseline enable row level security;
alter table public.orders add column checkout_closed_at timestamptz;
create table checkout_recovery.attempts (
 order_id uuid primary key references public.orders(id) on delete restrict,
 scope text not null, request_json jsonb not null,
 idempotency_key uuid not null unique default gen_random_uuid(),
 started_at timestamptz not null default clock_timestamp(),
 lease_token uuid, lease_until timestamptz,
 session_id text unique, state text not null default 'uncertain'
   check(state in ('uncertain','bound','expired','failed'))
);
alter table checkout_recovery.attempts enable row level security;
revoke all on all tables in schema checkout_recovery from public,anon,authenticated,service_role;

create function public.reserve_recoverable_checkout(p_buyer uuid,p_track uuid,p_license uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; n integer; price integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if not exists(select 1 from public.user_profiles where id=p_buyer and role='buyer') then raise exception 'Buyer required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_buyer::text||':'||p_track::text||':'||p_license::text,0));
 if exists(select 1 from commerce_private.acceptance_grants g join public.orders x on x.id=g.order_id
 where x.buyer_user_id=p_buyer and x.track_id=p_track and x.license_type_id=p_license and x.status='pending') then
 raise exception 'Dedicated acceptance checkout required'; end if;
 if exists(select 1 from public.orders where buyer_user_id=p_buyer and track_id=p_track and license_type_id=p_license and status in ('paid','fulfilled','refunded')) then
  raise exception 'Existing purchase requires review before repeat licensing'; end if;
 select count(*) into n from public.orders where buyer_user_id=p_buyer and track_id=p_track and license_type_id=p_license and status='pending' and checkout_closed_at is null;
 if n>1 then raise exception 'Multiple legacy pending orders require reconciliation'; end if;
 select coalesce(tlo.price_cents,lt.default_price_cents) into price
 from public.track_license_options tlo join public.license_types lt on lt.id=tlo.license_type_id
 join public.tracks t on t.id=tlo.track_id
 where t.id=p_track and lt.id=p_license and t.status='approved' and tlo.active is true and lt.active is true;
 if price is null or price<=0 then raise exception 'Eligible priced license required'; end if;
 select * into o from public.orders where buyer_user_id=p_buyer and track_id=p_track and license_type_id=p_license and status='pending' and checkout_closed_at is null;
 if found then return to_jsonb(o)||jsonb_build_object('created_new',false); end if;
 insert into public.orders(buyer_user_id,track_id,license_type_id,amount_cents,currency,status)
 values(p_buyer,p_track,p_license,price,'USD','pending') returning * into o;
 return to_jsonb(o)||jsonb_build_object('created_new',true);
end $$;

create function public.claim_checkout_attempt(p_order uuid,p_scope text,p_request jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; a checkout_recovery.attempts; token uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_scope is null or p_scope !~ '^[a-f0-9]{64}:test$' then raise exception 'TEST credential scope required'; end if;
 select * into strict o from public.orders where id=p_order for update;
 if exists(select 1 from commerce_private.acceptance_grants where order_id=p_order) then raise exception 'Dedicated acceptance checkout required'; end if;
 if o.status<>'pending' or o.checkout_closed_at is not null then raise exception 'Order is not open for checkout'; end if;
 if p_request->>'mode' is distinct from 'payment' or jsonb_array_length(p_request->'line_items')<>1
 or p_request#>>'{line_items,0,quantity}' is distinct from '1'
 or p_request->>'client_reference_id' is distinct from o.id::text
 or p_request#>>'{metadata,buyerUserId}' is distinct from o.buyer_user_id::text
 or p_request#>>'{metadata,trackId}' is distinct from o.track_id::text
 or p_request#>>'{metadata,licenseTypeId}' is distinct from o.license_type_id::text
 or p_request#>>'{metadata,paymentMode}' is distinct from 'test'
 or p_request#>>'{line_items,0,price_data,currency}' is distinct from lower(o.currency)
 or (p_request#>>'{line_items,0,price_data,unit_amount}')::bigint is distinct from o.amount_cents::bigint
 then raise exception 'Request does not match trusted order'; end if;
 select * into a from checkout_recovery.attempts where order_id=p_order for update;
 if not found then
  -- Never manufacture a new provider attempt for an old ambiguous legacy order.
  if o.stripe_checkout_session_id is null and o.created_at <
    (select installed_at from checkout_recovery.baseline)
  then return jsonb_build_object('outcome','reconcile'); end if;
  -- A frozen provider deadline rejects a very late dispatch by a suspended
  -- process even after provider idempotency retention has elapsed.
  if o.stripe_checkout_session_id is null then
   p_request:=p_request||jsonb_build_object('expires_at',floor(extract(epoch from clock_timestamp()+interval '23 hours 30 minutes'))::bigint);
  end if;
  insert into checkout_recovery.attempts(order_id,scope,request_json,session_id,state)
  values(p_order,p_scope,p_request,o.stripe_checkout_session_id,case when o.stripe_checkout_session_id is null then 'uncertain' else 'bound' end) returning * into a;
 end if;
 if a.scope<>p_scope then raise exception 'Provider credential scope changed'; end if;
 if a.state in ('expired','failed') then return jsonb_build_object('outcome','closed'); end if;
 if a.session_id is not null then return jsonb_build_object('outcome','retrieve','session_id',a.session_id,'request',a.request_json); end if;
 if clock_timestamp()>=a.started_at+interval '23 hours' then return jsonb_build_object('outcome','reconcile'); end if;
 if a.lease_until>clock_timestamp() then return jsonb_build_object('outcome','busy'); end if;
 token:=gen_random_uuid();
 update checkout_recovery.attempts set lease_token=token,lease_until=clock_timestamp()+interval '2 minutes' where order_id=p_order;
 insert into public.order_activity_log(order_id,source,event_type,message,metadata)
 values(p_order,'system','checkout_attempt_claimed','Durable TEST checkout attempt claimed.',jsonb_build_object('recovery',true,'commercialRightsGranted',false));
 return jsonb_build_object('outcome','create','request',a.request_json,'key',a.idempotency_key,'token',token);
end $$;

create function public.checkout_has_frozen_attempt(p_order uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if exists(select 1 from commerce_private.acceptance_grants where order_id=p_order) then raise exception 'Dedicated acceptance checkout required'; end if;
 return exists(select 1 from checkout_recovery.attempts where order_id=p_order);
end $$;
revoke all on function public.checkout_has_frozen_attempt(uuid) from public,anon,authenticated;
grant execute on function public.checkout_has_frozen_attempt(uuid) to service_role;

create function public.finish_checkout_attempt(p_order uuid,p_token uuid,p_session text,p_outcome text)
returns void language plpgsql security definer set search_path='' as $$
declare a checkout_recovery.attempts; o public.orders;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into strict o from public.orders where id=p_order for update;
 select * into strict a from checkout_recovery.attempts where order_id=p_order for update;
 if p_outcome not in ('bound','uncertain','expired','failed') then raise exception 'Invalid checkout outcome'; end if;
 if p_outcome in ('expired','failed') and a.state=p_outcome and a.session_id=p_session then return; end if;
 if p_outcome in ('bound','uncertain') and (p_token is null or a.lease_token is distinct from p_token or a.lease_until<=clock_timestamp()) then raise exception 'Checkout lease lost'; end if;
 if p_outcome='bound' then
  if p_session is null or p_session !~ '^cs_test_[A-Za-z0-9]+$' or (o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id<>p_session) then raise exception 'Session binding mismatch'; end if;
  update public.orders set stripe_checkout_session_id=p_session,checkout_created_at=coalesce(checkout_created_at,clock_timestamp()) where id=p_order;
 elsif p_outcome in ('expired','failed') then
  if a.session_id is null or a.session_id is distinct from p_session then raise exception 'Known session required'; end if;
  if o.status<>'pending' or o.paid_at is not null then raise exception 'Cannot close a paid order'; end if;
  update public.orders set checkout_closed_at=coalesce(checkout_closed_at,clock_timestamp()) where id=p_order;
 end if;
 update checkout_recovery.attempts set session_id=coalesce(p_session,session_id),state=p_outcome,lease_token=null,lease_until=null where order_id=p_order;
 insert into public.order_activity_log(order_id,source,event_type,message,metadata)
 values(p_order,'system','checkout_'||p_outcome,'TEST checkout recovery transition.',jsonb_build_object('commercialRightsGranted',false));
end $$;

create function checkout_recovery.guard_order() returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Concurrent/stale paid events cannot regress fulfillment or refunds.
 if old.status='refunded' then new.status:='refunded';
 elsif old.status='fulfilled' and new.status='paid' then new.status:='fulfilled'; end if;
 if old.checkout_hold and not new.checkout_hold then raise exception 'Checkout hold requires explicit reconciliation'; end if;
 if exists(select 1 from checkout_recovery.attempts where order_id=old.id) and
 (new.buyer_user_id,new.track_id,new.license_type_id,new.amount_cents,new.currency) is distinct from
 (old.buyer_user_id,old.track_id,old.license_type_id,old.amount_cents,old.currency)
 then raise exception 'Checkout facts are frozen'; end if;
 if exists(select 1 from checkout_recovery.attempts where order_id=old.id) and
 ((old.stripe_checkout_session_id is not null and new.stripe_checkout_session_id is distinct from old.stripe_checkout_session_id)
 or (old.stripe_payment_intent_id is not null and new.stripe_payment_intent_id is distinct from old.stripe_payment_intent_id))
 then raise exception 'Checkout provider binding is frozen'; end if;
 return new;
end $$;
create trigger freeze_checkout_facts before update on public.orders for each row execute function checkout_recovery.guard_order();
create function checkout_recovery.guard_acceptance_reservation() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.orders where id=new.order_id for update;
 if exists(select 1 from checkout_recovery.attempts where order_id=new.order_id) then raise exception 'Ordinary checkout attempt already exists'; end if;
 return new;
end $$;
create trigger checkout_recovery_isolation before insert on commerce_private.acceptance_grants
for each row execute function checkout_recovery.guard_acceptance_reservation();
revoke all on function checkout_recovery.guard_acceptance_reservation() from public,anon,authenticated,service_role;
revoke all on function public.reserve_recoverable_checkout(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_checkout_attempt(uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.finish_checkout_attempt(uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function checkout_recovery.guard_order() from public,anon,authenticated,service_role;
grant execute on function public.reserve_recoverable_checkout(uuid,uuid,uuid),public.claim_checkout_attempt(uuid,text,jsonb),public.finish_checkout_attempt(uuid,uuid,text,text) to service_role;
alter table public.orders add column checkout_hold boolean not null default false;
create table checkout_recovery.agreement_jobs (
 order_id uuid primary key references public.orders(id) on delete restrict,
 token uuid not null, lease_until timestamptz not null, done boolean not null default false
);
create table checkout_recovery.verified_events (
 scope text not null, event_id text not null, order_id uuid not null references public.orders(id) on delete restrict,
 evidence jsonb not null, recorded_at timestamptz not null default clock_timestamp(), primary key(scope,event_id)
);
alter table checkout_recovery.verified_events enable row level security;
revoke all on checkout_recovery.verified_events from public,anon,authenticated,service_role;
create function checkout_recovery.reject_event_rewrite() returns trigger language plpgsql security definer set search_path='' as $$
begin raise exception 'Verified events are append only'; end $$;
create trigger immutable_verified_checkout_event before update or delete on checkout_recovery.verified_events
for each row execute function checkout_recovery.reject_event_rewrite();
revoke all on function checkout_recovery.reject_event_rewrite() from public,anon,authenticated,service_role;
alter table checkout_recovery.agreement_jobs enable row level security;
revoke all on checkout_recovery.agreement_jobs from public,anon,authenticated,service_role;

create function public.hold_checkout_order(p_order uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; c record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_reason not in ('payment_failed','refund','refund_full','dispute') then raise exception 'Invalid hold'; end if;
 select * into strict o from public.orders where id=p_order for update;
 if not o.checkout_hold then
  for c in select id from public.order_delivery_contracts where order_id=p_order loop
   perform commerce_private.security_hold(c.id,'checkout_'||p_reason);
  end loop;
 end if;
 if p_reason='refund_full' then
  update public.order_asset_entitlements set state='revoked',reason_code='refund_full',updated_at=now() where order_id=p_order and state<>'revoked';
 end if;
 update public.orders set checkout_hold=true,
 checkout_closed_at=case when p_reason='payment_failed' and status='pending' then coalesce(checkout_closed_at,clock_timestamp()) else checkout_closed_at end where id=p_order;
 insert into public.order_activity_log(order_id,source,event_type,message,metadata)
 values(p_order,'stripe_webhook','checkout_hold','Adverse payment evidence requires reconciliation.',jsonb_build_object('reason',p_reason));
end $$;

create function public.record_verified_checkout_payment(p_order uuid,p_scope text,p_evidence jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; prior checkout_recovery.verified_events; state text; kind text; amount bigint; refunded bigint;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 if p_scope is null or p_scope !~ '^[a-f0-9]{64}:test$' then raise exception 'TEST credential scope required'; end if;
 select * into strict o from public.orders where id=p_order for update;
 if exists(select 1 from checkout_recovery.attempts where order_id=p_order and scope<>p_scope) then raise exception 'Provider scope mismatch'; end if;
 state:=p_evidence->>'paymentState'; kind:=p_evidence->>'eventType';
 amount:=(p_evidence->>'amountMinor')::bigint;refunded:=(p_evidence->>'refundedMinor')::bigint;
 if p_evidence->>'livemode' is distinct from 'false' or p_evidence->>'providerEventId' is null or p_evidence->>'providerEventId' !~ '^evt_[A-Za-z0-9]+$'
 or p_evidence->>'evidenceSha256' is null or p_evidence->>'evidenceSha256' !~ '^[a-f0-9]{64}$'
 or p_evidence->>'providerCreatedAt' is null or (p_evidence->>'providerCreatedAt')::timestamptz>clock_timestamp()+interval '5 minutes'
 or p_evidence->>'paymentIntentId' is null or p_evidence->>'paymentIntentId' !~ '^pi_[A-Za-z0-9]+$'
 or upper(p_evidence->>'currency') is distinct from o.currency or amount is null or amount<=0 or refunded is null or refunded<0
 or amount>o.amount_cents or (state<>'DISPUTED' and amount<>o.amount_cents) or refunded>amount
 then raise exception 'Invalid verified payment evidence'; end if;
 if not coalesce((state='PAID' and kind in ('checkout.session.completed','checkout.session.async_payment_succeeded') and refunded=0)
 or (state='PAYMENT_FAILED' and kind='checkout.session.async_payment_failed' and refunded=0)
 or (state='REFUNDED' and kind='charge.refunded' and refunded=amount)
 or (state='PARTIALLY_REFUNDED' and kind='charge.refunded' and refunded>0 and refunded<amount)
 or (state='DISPUTED' and kind='charge.dispute.created' and refunded=0),false) then raise exception 'Incompatible event state'; end if;
 if state in ('PAID','PAYMENT_FAILED') then
  if p_evidence->>'checkoutSessionId' is null or p_evidence->>'checkoutSessionId' !~ '^cs_test_[A-Za-z0-9]+$'
  or (o.stripe_checkout_session_id is not null and o.stripe_checkout_session_id is distinct from p_evidence->>'checkoutSessionId') then raise exception 'Session mismatch'; end if;
 end if;
 if o.stripe_payment_intent_id is not null and o.stripe_payment_intent_id is distinct from p_evidence->>'paymentIntentId' then raise exception 'PaymentIntent mismatch'; end if;
 select * into prior from checkout_recovery.verified_events where scope=p_scope and event_id=p_evidence->>'providerEventId';
 if found then
  if prior.order_id<>p_order or prior.evidence<>p_evidence then raise exception 'Conflicting duplicate evidence'; end if;
  return;
 end if;
 insert into checkout_recovery.verified_events(scope,event_id,order_id,evidence) values(p_scope,p_evidence->>'providerEventId',p_order,p_evidence);
 update public.orders set stripe_payment_intent_id=coalesce(stripe_payment_intent_id,p_evidence->>'paymentIntentId'),
 stripe_checkout_session_id=coalesce(stripe_checkout_session_id,p_evidence->>'checkoutSessionId') where id=p_order;
 if state<>'PAID' then perform public.hold_checkout_order(p_order,case state when 'PAYMENT_FAILED' then 'payment_failed' when 'REFUNDED' then 'refund_full' when 'PARTIALLY_REFUNDED' then 'refund' else 'dispute' end); end if;
 insert into public.order_activity_log(order_id,source,event_type,message,metadata)
 values(p_order,'stripe_webhook','verified_checkout_event','Signature-verified TEST payment evidence retained.',jsonb_build_object('eventId',p_evidence->>'providerEventId','state',state,'commercialRightsGranted',false));
end $$;

create function public.claim_order_agreement_job(p_order uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.orders; j checkout_recovery.agreement_jobs; t uuid;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into strict o from public.orders where id=p_order for update;
 if o.status not in ('paid','fulfilled') or o.paid_at is null or o.stripe_payment_intent_id is null
 or o.stripe_checkout_session_id is null or o.stripe_checkout_session_id not like 'cs_test_%' or o.checkout_hold or o.checkout_closed_at is not null then raise exception 'Paid unheld order required'; end if;
 if not exists(select 1 from checkout_recovery.verified_events where order_id=p_order and evidence->>'paymentState'='PAID'
 and evidence->>'checkoutSessionId'=o.stripe_checkout_session_id and evidence->>'paymentIntentId'=o.stripe_payment_intent_id) then raise exception 'Retained verified payment required'; end if;
 if exists(select 1 from public.generated_licenses where order_id=p_order and status='generated') then raise exception 'Existing agreement is immutable'; end if;
 select * into j from checkout_recovery.agreement_jobs where order_id=p_order for update;
 if found and (j.done or j.lease_until>clock_timestamp()) then raise exception 'Agreement job busy or complete'; end if;
 t:=gen_random_uuid();
 insert into checkout_recovery.agreement_jobs(order_id,token,lease_until) values(p_order,t,clock_timestamp()+interval '2 minutes')
 on conflict(order_id) do update set token=excluded.token,lease_until=excluded.lease_until;
 return t;
end $$;

create function public.finish_order_agreement_job(p_order uuid,p_token uuid,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; j checkout_recovery.agreement_jobs; g public.generated_licenses;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required'; end if;
 select * into strict o from public.orders where id=p_order for update;
 select * into strict j from checkout_recovery.agreement_jobs where order_id=p_order for update;
 if j.token is distinct from p_token or j.lease_until<=clock_timestamp() or j.done then raise exception 'Stale agreement job'; end if;
 if p_payload is null then
  update checkout_recovery.agreement_jobs set lease_until=clock_timestamp() where order_id=p_order;
  insert into public.order_activity_log(order_id,source,event_type,message) values(p_order,'system','agreement_job_retryable','Agreement generation interrupted; payment evidence retained.');
  return null;
 end if;
 if o.status not in ('paid','fulfilled') or o.checkout_hold or o.checkout_closed_at is not null or o.paid_at is null then raise exception 'Paid unheld order required'; end if;
 if p_payload->>'order_id' is distinct from p_order::text or p_payload->>'buyer_id' is distinct from o.buyer_user_id::text
 or p_payload->>'track_id' is distinct from o.track_id::text or p_payload->>'license_type_id' is distinct from o.license_type_id::text
 or p_payload->>'status' is distinct from 'generated'
 or p_payload->>'pdf_storage_path' is distinct from o.buyer_user_id::text||'/'||p_order::text||'/'||p_token::text||'.pdf'
 then raise exception 'Agreement payload mismatch'; end if;
 g:=jsonb_populate_record(null::public.generated_licenses,p_payload);
 insert into public.generated_licenses(id,order_id,buyer_id,track_id,license_type_id,agreement_number,status,terms_snapshot_json,pdf_storage_path,pdf_content_type,pdf_size_bytes,html_snapshot,generation_error,generated_at)
 values(g.id,g.order_id,g.buyer_id,g.track_id,g.license_type_id,g.agreement_number,'generated',g.terms_snapshot_json,g.pdf_storage_path,g.pdf_content_type,g.pdf_size_bytes,g.html_snapshot,null,g.generated_at)
 on conflict(order_id) do update set id=excluded.id,agreement_number=excluded.agreement_number,status='generated',terms_snapshot_json=excluded.terms_snapshot_json,
 pdf_storage_path=excluded.pdf_storage_path,pdf_content_type=excluded.pdf_content_type,pdf_size_bytes=excluded.pdf_size_bytes,html_snapshot=excluded.html_snapshot,generation_error=null,generated_at=excluded.generated_at
 where public.generated_licenses.status<>'generated' returning * into g;
 if g.id is null then raise exception 'Existing agreement is immutable'; end if;
 update public.orders set status='fulfilled',agreement_path=g.pdf_storage_path,agreement_generated_at=g.generated_at,fulfilled_at=coalesce(fulfilled_at,clock_timestamp()),
 agreement_url='/api/orders/'||p_order::text||'/agreement',agreement_content_type=g.pdf_content_type,agreement_size_bytes=g.pdf_size_bytes,agreement_generation_error=null where id=p_order;
 update checkout_recovery.agreement_jobs set done=true where order_id=p_order;
 insert into public.order_activity_log(order_id,source,event_type,message,metadata)
 values(p_order,'system','agreement_job_completed','One agreement artifact committed.',jsonb_build_object('licenseId',g.id));
 return to_jsonb(g);
end $$;
revoke all on function public.hold_checkout_order(uuid,text),public.claim_order_agreement_job(uuid),public.finish_order_agreement_job(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hold_checkout_order(uuid,text),public.claim_order_agreement_job(uuid),public.finish_order_agreement_job(uuid,uuid,jsonb) to service_role;
revoke all on function public.record_verified_checkout_payment(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.record_verified_checkout_payment(uuid,text,jsonb) to service_role;
commit;
