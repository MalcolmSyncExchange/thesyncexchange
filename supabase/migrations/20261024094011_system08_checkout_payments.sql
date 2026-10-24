-- System 08: evidence-driven payment visibility, refund observations and fenced operator recovery.
-- No provider calls, hosted configuration, financial activation or evidence backfill.
begin;
-- Out-of-order dispute updates are adverse until explicit investigation.
do $$declare definition text;signature text;needle text;begin
 foreach signature in array array['public.record_checkout_adverse_event(text,jsonb)','public.record_verified_checkout_payment(uuid,text,jsonb)'] loop
  select pg_get_functiondef(signature::regprocedure) into definition;
  needle:=case when signature like '%record_checkout_adverse%' then 'p_evidence->>''eventType''=''charge.dispute.created''' else 'kind=''charge.dispute.created''' end;
  if position(needle in definition)=0 then raise exception 'Dispute evidence contract drift';end if;
  execute replace(definition,needle,case when signature like '%record_checkout_adverse%' then 'p_evidence->>''eventType''' else 'kind' end||' in (''charge.dispute.created'',''charge.dispute.updated'',''charge.dispute.closed'',''charge.dispute.funds_withdrawn'',''charge.dispute.funds_reinstated'')');
 end loop;
end$$;
create table checkout_recovery.refund_observations(
 scope text not null check(scope ~ '^[a-f0-9]{64}:test$'),event_id text not null,
 intent_id text not null,evidence jsonb not null,received_at timestamptz not null default clock_timestamp(),primary key(scope,event_id)
);
create index refund_observation_intent on checkout_recovery.refund_observations(intent_id,received_at);
alter table checkout_recovery.refund_observations enable row level security;
alter table checkout_recovery.refund_observations force row level security;
create policy trusted_owner on checkout_recovery.refund_observations to postgres using(true) with check(true);
create trigger immutable_refund_observations before update or delete on checkout_recovery.refund_observations for each row execute function checkout_recovery.reject_event_rewrite();
create function public.record_checkout_refund_observation(p_scope text,p_evidence jsonb) returns void language plpgsql security definer set search_path='' as $$
declare old checkout_recovery.refund_observations;o public.orders;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 if p_scope is null or p_scope !~ '^[a-f0-9]{64}:test$' or p_evidence->'livemode' is distinct from 'false'::jsonb
 or coalesce(p_evidence->>'providerEventId','')!~'^evt_[A-Za-z0-9]+$' or coalesce(p_evidence->>'paymentIntentId','')!~'^pi_[A-Za-z0-9]+$'
 or coalesce(p_evidence->>'refundId','')!~'^re_[A-Za-z0-9]+$' or coalesce(p_evidence->>'evidenceSha256','')!~'^[a-f0-9]{64}$'
 or coalesce(p_evidence->>'eventType','') not in('refund.created','refund.updated','refund.failed')
 or coalesce(p_evidence->>'status','') not in('pending','requires_action','succeeded','failed','canceled')
 or (p_evidence->>'eventType'='refund.failed' and p_evidence->>'status'<>'failed')
 or coalesce(p_evidence->>'amountMinor','')!~'^[0-9]{1,9}$' or (p_evidence->>'amountMinor')::bigint<1
 or coalesce(p_evidence->>'currency','')<>'USD' or p_evidence->>'providerCreatedAt' is null
 or (p_evidence->>'providerCreatedAt')::timestamptz>clock_timestamp()+interval '5 minutes'
 or octet_length(p_evidence::text)>3000 then raise exception 'Invalid refund observation' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_scope||':'||(p_evidence->>'paymentIntentId'),1));
 select * into old from checkout_recovery.refund_observations where scope=p_scope and event_id=p_evidence->>'providerEventId';
 if found then if old.evidence<>p_evidence then raise exception 'Conflicting refund observation' using errcode='40001';end if;return;end if;
 select * into o from public.orders where stripe_payment_intent_id=p_evidence->>'paymentIntentId' for update;
 if found and ((p_evidence->>'amountMinor')::bigint>o.amount_cents or o.currency<>p_evidence->>'currency'
 or exists(select 1 from checkout_recovery.attempts a where a.order_id=o.id and a.scope<>p_scope)) then raise exception 'Refund binding mismatch' using errcode='22023';end if;
 -- Unmapped evidence is retained and associated by the canonical intent later.
 insert into checkout_recovery.refund_observations values(p_scope,p_evidence->>'providerEventId',p_evidence->>'paymentIntentId',p_evidence,clock_timestamp());
 if o.id is not null then insert into public.order_activity_log(order_id,source,event_type,message,metadata) values(o.id,'stripe_webhook','refund_observed','Authenticated refund status retained; no financial reversal inferred.',jsonb_build_object('eventId',p_evidence->>'providerEventId','status',p_evidence->>'status'));end if;
end$$;
create function checkout_recovery.order_projection(p_order uuid,p_admin boolean) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders;a checkout_recovery.attempts;l jsonb;payment text;verified boolean;recovery text;refunds jsonb;begin
 select * into strict o from public.orders where id=p_order;select * into a from checkout_recovery.attempts where order_id=p_order;l:=licensing_private.lifecycle(p_order);
 verified:=exists(select 1 from checkout_recovery.verified_events e where e.order_id=p_order and e.evidence->>'paymentState'='PAID'
 and e.evidence->>'checkoutSessionId'=o.stripe_checkout_session_id and e.evidence->>'paymentIntentId'=o.stripe_payment_intent_id)
 or exists(select 1 from commerce_private.payment_events e join public.order_delivery_contracts c on c.id=e.contract_id where c.order_id=p_order and e.payment_state='PAID'
 and e.checkout_session_id=o.stripe_checkout_session_id and e.payment_intent_id=o.stripe_payment_intent_id);
 payment:=case when l->>'paymentState' in('REFUNDED','PARTIALLY_REFUNDED','DISPUTED','PAYMENT_FAILED','SECURITY_HOLD') then l->>'paymentState'
 when o.checkout_hold then 'SECURITY_HOLD' when verified then 'PAID' when o.checkout_closed_at is not null then 'EXPIRED' else 'PENDING' end;
 recovery:=case when o.checkout_hold then 'support' when verified and l->>'issuanceState'='issued' then 'complete' when verified then 'fulfillment_pending'
 when o.checkout_closed_at is not null then 'closed' when a.session_id is not null then 'resume'
 when a.order_id is not null and clock_timestamp()>=a.started_at+interval '23 hours' then 'reconcile'
 when a.lease_until>clock_timestamp() then 'processing' else 'resume' end;
 select coalesce(jsonb_agg(jsonb_build_object('refundId',evidence->>'refundId','eventId',event_id,'status',evidence->>'status','amountCents',(evidence->>'amountMinor')::bigint,'providerCreatedAt',evidence->>'providerCreatedAt','recordedAt',received_at) order by (evidence->>'providerCreatedAt')::timestamptz,received_at,event_id),'[]') into refunds from checkout_recovery.refund_observations where intent_id=o.stripe_payment_intent_id;
 return jsonb_build_object('orderId',o.id,'amountCents',o.amount_cents,'currency',o.currency,'createdAt',o.created_at,'paidAt',o.paid_at,'paymentState',payment,'verifiedPayment',verified,'paymentHold',o.checkout_hold,
 'recovery',recovery,'issuanceState',l->>'issuanceState','contractualState',l->>'contractualState','testOnly',l->'testOnly','refunds',refunds,
 'history',coalesce((select jsonb_agg(jsonb_build_object('event',event_type,'at',created_at) order by created_at,id) from (select * from public.order_activity_log where order_id=o.id order by created_at desc,id desc limit 100) events),'[]'),
 'providerEvidence',case when p_admin then coalesce((select jsonb_agg(jsonb_build_object('eventId',event_id,'type',evidence->>'eventType','state',evidence->>'paymentState','amountCents',evidence->'amountMinor','refundedCents',evidence->'refundedMinor','sha256',evidence->>'evidenceSha256','createdAt',evidence->>'providerCreatedAt') order by recorded_at,event_id) from checkout_recovery.verified_events where order_id=o.id),'[]') else null end,
 'attempt',case when p_admin and a.order_id is not null then jsonb_build_object('state',a.state,'startedAt',a.started_at,'leaseUntil',a.lease_until,'requiresReconciliation',recovery='reconcile') else null end);
end$$;
create function public.checkout_order_state(p_order uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare r text;begin
 r:=licensing_private.record_actor();if r='artist' or not licensing_private.record_visible(p_order,r) then raise exception 'Order unavailable' using errcode='42501';end if;
 return checkout_recovery.order_projection(p_order,r='admin');end$$;
create function public.checkout_operations(p_page int default 1,p_size int default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if licensing_private.record_actor()<>'admin' then raise exception 'MFA Admin required' using errcode='42501';end if;
 if p_page is null or p_page not between 1 and 10000 or p_size is null or p_size not between 1 and 50 then raise exception 'Bounded page required' using errcode='22023';end if;
 select coalesce(jsonb_agg(checkout_recovery.order_projection(id,true)),'[]') into result from (select id from public.orders order by created_at desc,id desc limit p_size offset(p_page-1)*p_size) orders;
 return jsonb_build_object('items',result,'page',p_page,'size',p_size,'total',(select count(*) from public.orders));end$$;
create table checkout_recovery.operator_requests(
 id uuid primary key,order_id uuid not null references public.orders(id) on delete restrict,actor uuid not null references public.user_profiles(id),
 action text not null check(action in('annotate','retry_fulfillment')),reason text not null,reference text not null,
 created_at timestamptz not null default clock_timestamp(),lease_token uuid,lease_until timestamptz,outcome text not null check(outcome in('pending','complete','retry'))
);
alter table checkout_recovery.operator_requests enable row level security;alter table checkout_recovery.operator_requests force row level security;
create policy trusted_owner on checkout_recovery.operator_requests to postgres using(true) with check(true);
create function checkout_recovery.guard_operator_request() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='DELETE' or (new.id,new.order_id,new.actor,new.action,new.reason,new.reference,new.created_at) is distinct from(old.id,old.order_id,old.actor,old.action,old.reason,old.reference,old.created_at)
 then raise exception 'Operator evidence is immutable';end if;return new;end$$;
create trigger immutable_operator_request before update or delete on checkout_recovery.operator_requests for each row execute function checkout_recovery.guard_operator_request();
create function public.request_checkout_operation(p_order uuid,p_request uuid,p_action text,p_reason text,p_reference text) returns jsonb language plpgsql security definer set search_path='' as $$
declare e checkout_recovery.operator_requests;t uuid;begin
 if licensing_private.record_actor()<>'admin' then raise exception 'MFA Admin required' using errcode='42501';end if;
 if p_request is null or p_action is null or p_action not in('annotate','retry_fulfillment') or length(btrim(coalesce(p_reason,''))) not between 5 and 2000 or length(btrim(coalesce(p_reference,''))) not between 5 and 500 then raise exception 'Explicit review evidence required' using errcode='22023';end if;
 perform 1 from public.orders where id=p_order for update;if not found then raise exception 'Order unavailable' using errcode='42501';end if;
 select * into e from checkout_recovery.operator_requests where id=p_request for update;
 if found then
  if (e.order_id,e.actor,e.action,e.reason,e.reference) is distinct from(p_order,auth.uid(),p_action,p_reason,p_reference) then raise exception 'Conflicting operator request' using errcode='40001';end if;
  if e.outcome='complete' then return jsonb_build_object('outcome','complete');end if;
  if e.lease_until>clock_timestamp() then return jsonb_build_object('outcome','processing');end if;
 end if;
 if p_action='retry_fulfillment' then
  perform licensing_private.assert_purchase(p_order,true);
 end if;
 t:=gen_random_uuid();
 if e.id is null then insert into checkout_recovery.operator_requests(id,order_id,actor,action,reason,reference,lease_token,lease_until,outcome)
 values(p_request,p_order,auth.uid(),p_action,p_reason,p_reference,t,clock_timestamp()+interval '5 minutes',case when p_action='annotate' then 'complete' else 'pending' end);
 else update checkout_recovery.operator_requests set lease_token=t,lease_until=clock_timestamp()+interval '5 minutes',outcome='pending' where id=p_request;end if;
 insert into public.order_activity_log(order_id,actor_id,source,event_type,message,metadata) values(p_order,auth.uid(),'admin','checkout_operator_'||p_action,'Authorized checkout review recorded.',jsonb_build_object('requestId',p_request,'reason',p_reason,'reference',p_reference));
 return jsonb_build_object('outcome',case when p_action='annotate' then 'complete' else 'execute' end,'token',case when p_action='retry_fulfillment' then t else null end);end$$;
create function public.finish_checkout_operation(p_request uuid,p_token uuid,p_success boolean) returns void language plpgsql security definer set search_path='' as $$declare e checkout_recovery.operator_requests;begin
 if auth.role() is distinct from 'service_role' then raise exception 'Service role required' using errcode='42501';end if;
 select * into strict e from checkout_recovery.operator_requests where id=p_request for update;
 if e.lease_token is distinct from p_token or p_token is null or e.lease_until<=clock_timestamp() or e.action<>'retry_fulfillment' or e.outcome='complete' then raise exception 'Operator lease lost' using errcode='40001';end if;
 update checkout_recovery.operator_requests set outcome=case when p_success is true then 'complete' else 'retry' end,lease_token=null,lease_until=null where id=p_request;
 insert into public.order_activity_log(order_id,actor_id,source,event_type,message,metadata) values(e.order_id,e.actor,'system','checkout_operator_outcome','Fenced recovery outcome retained.',jsonb_build_object('requestId',p_request,'success',p_success is true));end$$;
revoke all on all tables in schema checkout_recovery from public,anon,authenticated,service_role;
revoke all on function checkout_recovery.order_projection(uuid,boolean),checkout_recovery.guard_operator_request() from public,anon,authenticated,service_role;
revoke all on function public.record_checkout_refund_observation(text,jsonb),public.finish_checkout_operation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.record_checkout_refund_observation(text,jsonb),public.finish_checkout_operation(uuid,uuid,boolean) to service_role;
revoke all on function public.checkout_order_state(uuid),public.checkout_operations(integer,integer),public.request_checkout_operation(uuid,uuid,text,text,text) from public,anon,service_role;
grant execute on function public.checkout_order_state(uuid),public.checkout_operations(integer,integer),public.request_checkout_operation(uuid,uuid,text,text,text) to authenticated;
commit;
