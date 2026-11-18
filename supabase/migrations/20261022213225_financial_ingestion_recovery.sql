-- PK09-R: immutable authenticated evidence, fenced TEST-only posting/recovery.
-- No endpoint registration, backfill, flag activation, hosted SQL or schedules.
begin;
set local lock_timeout='5s';
do $$ begin
 if current_user<>'postgres' or to_regclass('finance_private.books') is null then raise exception 'Reviewed PK09 and postgres installer required';end if;
end $$;
alter table finance_private.capabilities add column ingestion_enabled boolean not null default false,add column worker_enabled boolean not null default false;
create table finance_private.provider_endpoints(
 id uuid primary key,account text not null check(account ~ '^acct_[A-Za-z0-9]+$'),
 credential_scope text not null check(credential_scope ~ '^[a-f0-9]{64}$'),signing_scope text not null check(signing_scope ~ '^[a-f0-9]{64}$'),
 enabled boolean not null default false,created_at timestamptz not null default clock_timestamp(),unique(id,account)
);
create table finance_private.provider_events(
 id uuid primary key default gen_random_uuid(),endpoint_id uuid not null references finance_private.provider_endpoints(id) on delete restrict,
 account text not null,event_id text not null check(event_id ~ '^evt_[A-Za-z0-9]+$'),event_type text not null,
 summary jsonb not null,raw_body text not null check(octet_length(raw_body)<=262144),raw_hash text not null,
 verification_method text not null default 'stripe_signature_v1' check(verification_method='stripe_signature_v1'),
 received_at timestamptz not null default clock_timestamp(),unique(account,event_id),foreign key(endpoint_id,account) references finance_private.provider_endpoints(id,account) on delete restrict
);
create table finance_private.provider_conflicts(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references finance_private.provider_events(id) on delete restrict,
 raw_body text not null check(octet_length(raw_body)<=262144),raw_hash text not null,summary jsonb not null,
 received_at timestamptz not null default clock_timestamp(),unique(event_id,raw_hash)
);
create table finance_private.provider_deliveries(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references finance_private.provider_events(id) on delete restrict,
 raw_body text not null check(octet_length(raw_body)<=262144),raw_hash text not null,
 received_at timestamptz not null default clock_timestamp(),unique(event_id,raw_hash)
);
create table finance_private.provider_jobs(
 id uuid primary key default gen_random_uuid(),event_id uuid not null unique references finance_private.provider_events(id) on delete restrict,
 order_id uuid references public.orders(id) on delete restrict,state text not null check(state in ('pending','leased','retry','posted','dead','conflict','unsupported')),
 attempt integer not null default 0 check(attempt between 0 and 8),generation integer not null default 0,
 next_at timestamptz not null default clock_timestamp(),token uuid,lease_until timestamptz,last_code text,
 updated_at timestamptz not null default clock_timestamp(),check((state='leased')=(token is not null and lease_until is not null))
);
create index provider_job_due on finance_private.provider_jobs(next_at,id) where state in ('pending','retry','leased');
create table finance_private.provider_attempts(
 id bigint generated always as identity primary key,job_id uuid not null references finance_private.provider_jobs(id) on delete restrict,
 generation integer not null,attempt integer not null,outcome text not null,code text,created_at timestamptz not null default clock_timestamp()
);
create table finance_private.provider_fetches(
 id uuid primary key default gen_random_uuid(),event_id uuid not null references finance_private.provider_events(id) on delete restrict,
 order_id uuid not null references finance_private.books(order_id) on delete restrict,proof jsonb not null,proof_hash text not null,
 fetched_at timestamptz not null default clock_timestamp()
);
create table finance_private.provider_balances(
 account text not null,balance_id text not null check(balance_id ~ '^txn_[A-Za-z0-9]+$'),order_id uuid not null references finance_private.books(order_id) on delete restrict,
 economic jsonb not null,economic_hash text not null,first_fetch uuid not null references finance_private.provider_fetches(id) on delete restrict,
 primary key(account,balance_id)
);
create table finance_private.provider_effects(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references finance_private.books(order_id) on delete restrict,
 effect_key text not null,kind text not null check(kind in ('processor_fee','fee_return','dispute_debit','dispute_return','chargeback_loss')),
 amount_minor bigint not null check(amount_minor>0),fetch_id uuid not null references finance_private.provider_fetches(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),unique(order_id,effect_key)
);
create table finance_private.provider_reconciliations(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references finance_private.provider_jobs(id) on delete restrict,
 order_id uuid not null references finance_private.books(order_id) on delete restrict,
 provider_projection jsonb not null,result jsonb not null,fetch_id uuid not null references finance_private.provider_fetches(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
create index provider_reconciliation_order on finance_private.provider_reconciliations(order_id,created_at desc,id);
create table finance_private.provider_alerts(
 id uuid primary key default gen_random_uuid(),job_id uuid not null references finance_private.provider_jobs(id) on delete restrict,
 code text not null,detail jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
create table finance_private.provider_operator_actions(
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,job_id uuid not null references finance_private.provider_jobs(id) on delete restrict,
 actor uuid not null references public.user_profiles(id) on delete restrict,action text not null check(action in ('retry','reconcile','acknowledge')),
 reason text not null check(length(reason) between 10 and 1000),reference text not null check(length(reference) between 5 and 500),
 created_at timestamptz not null default clock_timestamp()
);
create index provider_event_intent on finance_private.provider_events(account,(summary->>'paymentIntent'));
create index provider_event_session on finance_private.provider_events(account,(summary->>'session'));
create index provider_job_order on finance_private.provider_jobs(order_id,state,updated_at);
create index provider_fetch_order on finance_private.provider_fetches(order_id,fetched_at);
create index provider_balance_source on finance_private.provider_balances(account,(economic->>'source'),(economic->>'kind'));
create index provider_alert_job on finance_private.provider_alerts(job_id,created_at desc);
create index provider_alert_recent on finance_private.provider_alerts(created_at desc,id);
create index provider_operator_job on finance_private.provider_operator_actions(job_id,created_at desc);
do $$ declare t text;begin
 foreach t in array array['provider_endpoints','provider_events','provider_conflicts','provider_deliveries','provider_jobs','provider_attempts','provider_fetches','provider_balances','provider_effects','provider_reconciliations','provider_alerts','provider_operator_actions'] loop
  execute format('alter table finance_private.%I enable row level security',t);
  execute format('alter table finance_private.%I force row level security',t);
  execute format('create policy owner_only on finance_private.%I to postgres using(true) with check(true)',t);
  execute format('revoke all on finance_private.%I from public,anon,authenticated,service_role',t);
  if t not in ('provider_endpoints','provider_jobs') then execute format('create trigger retain_provider before update or delete on finance_private.%I for each row execute function licensing_private.immutable()',t);end if;
 end loop;
end $$;
create function finance_private.retain_endpoint_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'Provider endpoint identity is immutable';end if;
 if (new.id,new.account,new.credential_scope,new.signing_scope,new.created_at) is distinct from (old.id,old.account,old.credential_scope,old.signing_scope,old.created_at) then raise exception 'Provider endpoint identity is immutable';end if;
 return new;
end $$;
create trigger retain_endpoint before update or delete on finance_private.provider_endpoints for each row execute function finance_private.retain_endpoint_identity();
create view finance_private.all_effects with(security_invoker=true) as
 select order_id,kind,amount_minor,party_id,created_at from finance_private.simulation_facts
 union all select order_id,kind,amount_minor,null::text,created_at from finance_private.provider_effects;
create view finance_private.all_reconciliations with(security_invoker=true) as
 select id,order_id,provider_projection,result,actor,created_at from finance_private.reconciliations
 union all select id,order_id,provider_projection,result,null::uuid,created_at from finance_private.provider_reconciliations;
revoke all on finance_private.all_effects,finance_private.all_reconciliations from public,anon,authenticated,service_role;
-- Preserve function OIDs/guards and original semantics; only widen evidence input.
do $$ declare body text;begin
 body:=pg_get_functiondef('public.post_financial_order(uuid)'::regprocedure);
 if position('from finance_private.simulation_facts where order_id=p_order and kind=''chargeback_loss''' in body)=0 then raise exception 'PK09 posting definition drift';end if;
 execute replace(body,'from finance_private.simulation_facts where order_id=p_order and kind=''chargeback_loss''','from finance_private.all_effects where order_id=p_order and kind=''chargeback_loss''');
 body:=pg_get_functiondef('finance_private.inspect_order(uuid,jsonb)'::regprocedure);
 if position('finance_private.simulation_facts' in body)=0 then raise exception 'PK09 comparator drift';end if;
 body:=replace(body,'finance_private.simulation_facts','finance_private.all_effects');
 if position('expected:=jsonb_build_object' in body)=0 then raise exception 'PK09 comparator return drift';end if;
 execute replace(body,'expected:=jsonb_build_object','issues:=issues||finance_private.delivery_issues(p_order); expected:=jsonb_build_object');
 body:=pg_get_functiondef('public.read_financial_order(uuid)'::regprocedure);
 if position('finance_private.reconciliations' in body)=0 then raise exception 'PK09 read contract drift';end if;
 execute replace(body,'finance_private.reconciliations','finance_private.all_reconciliations');
 body:=pg_get_functiondef('public.record_finance_simulation_fact(uuid,text,text,bigint,text,text,text,text,uuid)'::regprocedure);
 if position('actor:=finance_private.require_admin();perform finance_private.assert_enabled();' in body)=0 then raise exception 'PK09 simulation function drift';end if;
 execute replace(body,'actor:=finance_private.require_admin();perform finance_private.assert_enabled();',
 'actor:=finance_private.require_admin();perform finance_private.assert_enabled(); if exists(select 1 from finance_private.provider_fetches where order_id=p_order) then raise exception ''Verified provider books cannot accept simulated facts'';end if;');
 body:=pg_get_functiondef('licensing_private.assert_purchase(uuid,boolean)'::regprocedure);
 if position('perform licensing_private.assert_source(a.snapshot,' in body)=0 then raise exception 'PK04 issuance guard drift';end if;
 execute replace(body,'perform licensing_private.assert_source(a.snapshot,','perform finance_private.assert_no_adverse_provider_evidence(p_order); perform licensing_private.assert_source(a.snapshot,');
end $$;
create function finance_private.assert_no_adverse_provider_evidence(p_order uuid) returns void language plpgsql stable security definer set search_path='' as $$
begin
 if exists(select 1 from public.orders o join finance_private.provider_events e
  on (e.summary->>'paymentIntent'=o.stripe_payment_intent_id or e.summary->>'session'=o.stripe_checkout_session_id)
  join finance_private.provider_endpoints ep on ep.id=e.endpoint_id
  where o.id=p_order and (e.event_type like 'charge.dispute.%' or e.event_type in ('charge.refunded','checkout.session.async_payment_failed')
   or exists(select 1 from finance_private.provider_conflicts c where c.event_id=e.id)
   or exists(select 1 from finance_private.provider_alerts a join finance_private.provider_jobs j on j.id=a.job_id where j.event_id=e.id and a.code in ('provider_event_conflict','provider_binding_mismatch','provider_economic_conflict')))
  and (exists(select 1 from public.order_delivery_contracts c join commerce_private.contract_context ctx on ctx.contract_id=c.id where c.order_id=o.id and ctx.provider_account=e.account)
   or exists(select 1 from checkout_recovery.verified_events v where v.order_id=o.id and v.scope=ep.credential_scope||':test')))
 then raise exception 'Authenticated adverse financial evidence requires review';end if;
end $$;
create function finance_private.delivery_issues(p_order uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare b finance_private.books;r jsonb;begin
 select * into b from finance_private.books where order_id=p_order;
 if not found or not exists(select 1 from public.generated_licenses where order_id=p_order and status='generated')
 or exists(select 1 from public.orders where id=p_order and checkout_hold)
 or exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state<>'PAID') then return '[]';end if;
 for r in select value from jsonb_array_elements(coalesce(b.snapshot->'deliveryManifest','[]')) loop
  if not exists(select 1 from public.order_asset_entitlements where order_id=p_order and contract_id=b.contract_id and asset_version_id=(r->>'assetVersionId')::uuid and state='active') then return '["delivery_entitlement_pending"]';end if;
 end loop;return '[]';
end $$;
create function finance_private.require_provider(p_endpoint uuid,p_worker boolean default false) returns finance_private.provider_endpoints language plpgsql security definer set search_path='' as $$
declare e finance_private.provider_endpoints;begin
 perform commerce_private.require_service_role();
 if not exists(select 1 from finance_private.capabilities where singleton and ingestion_enabled and (not p_worker or (worker_enabled and synthetic_posting_enabled))) then raise exception 'Financial ingestion disabled' using errcode='42501';end if;
 select * into strict e from finance_private.provider_endpoints where id=p_endpoint and enabled;return e;
end $$;
create function finance_private.provider_hold(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare c uuid;begin
 if p_order is null then return;end if;
 perform 1 from public.orders where id=p_order for update;
 update public.orders set checkout_hold=true where id=p_order;
 select id into c from public.order_delivery_contracts where order_id=p_order;
 if c is not null then perform commerce_private.security_hold(c,'financial_evidence_conflict');end if;
end $$;
create function public.ingest_financial_provider_event(p_endpoint uuid,p_credential text,p_signing text,p_raw text,p_summary jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ep finance_private.provider_endpoints;r jsonb;h text;event finance_private.provider_events;eid uuid;jid uuid;state text;oid uuid;begin
 ep:=finance_private.require_provider(p_endpoint);
 if ep.credential_scope is distinct from p_credential or ep.signing_scope is distinct from p_signing then raise exception 'Financial endpoint context mismatch' using errcode='42501';end if;
 if octet_length(p_raw)>262144 or octet_length(p_summary::text)>10000 then raise exception 'Bounded provider evidence required';end if;
 r:=p_raw::jsonb;
 if r->>'id' is distinct from p_summary->>'id' or r->>'type' is distinct from p_summary->>'type' or r->>'created' is distinct from p_summary->>'created'
 or r->>'livemode' is distinct from 'false' or p_summary->>'livemode' is distinct from 'false' or r->>'account' is not null
 or coalesce(r->>'id','') !~ '^evt_[A-Za-z0-9]+$' or length(coalesce(r->>'type','')) not between 2 and 120 then raise exception 'Malformed provider envelope';end if;
 if p_summary->>'supported'='true' and (r#>>'{data,object,id}' is distinct from p_summary->>'objectId'
 or r#>>'{data,object,livemode}' is distinct from 'false') then raise exception 'Malformed provider object';end if;
 h:=encode(extensions.digest(p_raw,'sha256'),'hex');
 insert into finance_private.provider_events(endpoint_id,account,event_id,event_type,summary,raw_body,raw_hash)
 values(ep.id,ep.account,r->>'id',r->>'type',p_summary,p_raw,h) on conflict(account,event_id) do nothing returning id into eid;
 if eid is null then
  select * into strict event from finance_private.provider_events where account=ep.account and event_id=r->>'id' for update;eid:=event.id;
  if event.summary is distinct from p_summary then
   insert into finance_private.provider_conflicts(event_id,raw_body,raw_hash,summary) values(eid,p_raw,h,p_summary) on conflict do nothing;
   update finance_private.provider_jobs set state='conflict',token=null,lease_until=null,last_code='provider_event_conflict',updated_at=clock_timestamp() where event_id=eid returning id,order_id into jid,oid;
   if oid is null then select o.id into oid from public.orders o join public.order_delivery_contracts c on c.order_id=o.id join commerce_private.contract_context ctx on ctx.contract_id=c.id
    where ctx.provider_account=ep.account and o.stripe_payment_intent_id=event.summary->>'paymentIntent';end if;
   perform finance_private.provider_hold(oid);
   insert into finance_private.provider_alerts(job_id,code) values(jid,'provider_event_conflict');return jsonb_build_object('id',eid,'state','conflict');
  end if;
  insert into finance_private.provider_deliveries(event_id,raw_body,raw_hash) values(eid,p_raw,h) on conflict do nothing;
  return jsonb_build_object('id',eid,'state',(select j.state from finance_private.provider_jobs j where event_id=eid),'duplicate',true);
 end if;
 state:=case when p_summary->>'supported'='true' then 'pending' else 'unsupported' end;
 insert into finance_private.provider_deliveries(event_id,raw_body,raw_hash) values(eid,p_raw,h);
 insert into finance_private.provider_jobs(event_id,state) values(eid,state) returning id into jid;
 if p_summary->>'supported'='true' and (r->>'type' like 'charge.dispute.%' or r->>'type' in ('charge.refunded','checkout.session.async_payment_failed')) then
  select o.id into oid from public.orders o join public.order_delivery_contracts c on c.order_id=o.id join commerce_private.contract_context ctx on ctx.contract_id=c.id
   where ctx.provider_account=ep.account and (o.stripe_payment_intent_id=p_summary->>'paymentIntent' or o.stripe_checkout_session_id=p_summary->>'session');
  if oid is not null then update finance_private.provider_jobs set order_id=oid where id=jid;perform finance_private.provider_hold(oid);end if;
 end if;
 if state='unsupported' then insert into finance_private.provider_alerts(job_id,code) values(jid,'unsupported_event');end if;
 return jsonb_build_object('id',eid,'state',state,'duplicate',false);
end $$;
create function public.claim_financial_provider_job(p_endpoint uuid,p_credential text) returns jsonb language plpgsql security definer set search_path='' as $$
declare ep finance_private.provider_endpoints;j finance_private.provider_jobs;evrow finance_private.provider_events;expired record;begin
 ep:=finance_private.require_provider(p_endpoint,true);if ep.credential_scope<>p_credential then raise exception 'Worker credential scope mismatch';end if;
 for expired in select q.id,q.generation,q.attempt from finance_private.provider_jobs q join finance_private.provider_events e on e.id=q.event_id
 where e.account=ep.account and q.state='leased' and q.lease_until<clock_timestamp() order by q.id for update of q skip locked limit 100 loop
  update finance_private.provider_jobs set state=case when attempt>=8 then 'dead' else 'retry' end,token=null,lease_until=null,next_at=clock_timestamp(),last_code='lease_expired',updated_at=clock_timestamp() where id=expired.id;
  insert into finance_private.provider_attempts(job_id,generation,attempt,outcome,code) values(expired.id,expired.generation,expired.attempt,'lease_expired','lease_expired');
  if expired.attempt>=8 then insert into finance_private.provider_alerts(job_id,code) values(expired.id,'dead_letter');end if;
 end loop;
 -- Periodic refresh revisits posted proof without changing its immutable body or
 -- economic identity, so later license/delivery changes receive reconciliation.
 update finance_private.provider_jobs q set state='pending',attempt=0,generation=generation+1,next_at=clock_timestamp(),updated_at=clock_timestamp()
 where q.id in (select q2.id from finance_private.provider_jobs q2 join finance_private.provider_events e on e.id=q2.event_id
 where e.account=ep.account and q2.state='posted' and q2.updated_at<clock_timestamp()-interval '5 minutes'
 and not exists(select 1 from finance_private.provider_jobs newer where newer.order_id=q2.order_id and newer.state in ('pending','retry','leased'))
 order by q2.updated_at,q2.id for update of q2 skip locked limit 20);
 select q.* into j from finance_private.provider_jobs q join finance_private.provider_events e on e.id=q.event_id
 where e.account=ep.account and q.state in ('pending','retry') and q.next_at<=clock_timestamp() and q.attempt<8 order by q.next_at,q.id for update of q skip locked limit 1;
 if not found then return null;end if;
 update finance_private.provider_jobs set state='leased',attempt=attempt+1,token=gen_random_uuid(),lease_until=clock_timestamp()+interval '90 seconds',updated_at=clock_timestamp() where id=j.id returning * into j;
 insert into finance_private.provider_attempts(job_id,generation,attempt,outcome) values(j.id,j.generation,j.attempt,'claimed');
 select * into strict evrow from finance_private.provider_events where id=j.event_id;
 return jsonb_build_object('id',j.id,'token',j.token,'account',evrow.account,'event',evrow.summary,'attempt',j.attempt,'generation',j.generation);
end $$;
create function finance_private.fail_provider_job(p_job uuid,p_token uuid,p_code text,p_terminal boolean) returns text language plpgsql security definer set search_path='' as $$
declare j finance_private.provider_jobs;next_state text;begin
 select * into j from finance_private.provider_jobs where id=p_job for update;
 if j.state<>'leased' or j.token is distinct from p_token or j.lease_until<clock_timestamp() then return 'stale';end if;
 next_state:=case when p_terminal or j.attempt>=8 then 'dead' else 'retry' end;
 update finance_private.provider_jobs set state=next_state,token=null,lease_until=null,last_code=p_code,
 next_at=clock_timestamp()+make_interval(secs=>least(3600,5*(2^(j.attempt-1))::int)),updated_at=clock_timestamp() where id=j.id;
 insert into finance_private.provider_attempts(job_id,generation,attempt,outcome,code) values(j.id,j.generation,j.attempt,next_state,p_code);
 if next_state='dead' or p_code in ('unbalanced_journal','provider_event_conflict','provider_binding_mismatch','provider_account_mismatch','provider_internal_mismatch') then
  insert into finance_private.provider_alerts(job_id,code) values(j.id,p_code);end if;return next_state;
end $$;
create function public.fail_financial_provider_job(p_endpoint uuid,p_job uuid,p_token uuid,p_code text,p_terminal boolean,p_rejected jsonb default '{}') returns text language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 perform finance_private.require_provider(p_endpoint,true);
 if p_code not in ('provider_account_mismatch','provider_event_conflict','provider_binding_mismatch','unsupported_provider_balance','invalid_balance_arithmetic','duplicate_balance_identity','provider_pagination_limit','malformed_evidence','provider_details_pending','provider_or_database_unavailable') then raise exception 'Unknown safe failure code';end if;
 if not exists(select 1 from finance_private.provider_jobs j join finance_private.provider_events e on e.id=j.event_id where j.id=p_job and e.account=(select account from finance_private.provider_endpoints where id=p_endpoint)) then raise exception 'Worker scope mismatch';end if;
 perform 1 from finance_private.provider_events where id=(select event_id from finance_private.provider_jobs where id=p_job) for update;
 perform 1 from finance_private.provider_jobs where id=p_job for update;
 if jsonb_typeof(p_rejected) is distinct from 'object' or octet_length(p_rejected::text)>200000 then raise exception 'Bounded rejected evidence required';end if;
 if p_rejected<>'{}' and exists(select 1 from finance_private.provider_jobs where id=p_job and state='leased' and token=p_token and lease_until>clock_timestamp()) then
  insert into finance_private.provider_alerts(job_id,code,detail) values(p_job,p_code,jsonb_build_object('rejectedProof',p_rejected,'proofHash',licensing_private.hash_json(p_rejected)));
 end if;
 if p_code in ('provider_event_conflict','provider_binding_mismatch') and exists(select 1 from finance_private.provider_jobs where id=p_job and state='leased' and token=p_token and lease_until>clock_timestamp()) then
  select o.id into oid from finance_private.provider_jobs j join finance_private.provider_events e on e.id=j.event_id
   join public.orders o on (o.stripe_payment_intent_id=e.summary->>'paymentIntent' or o.stripe_checkout_session_id=e.summary->>'session')
   join public.order_delivery_contracts c on c.order_id=o.id join commerce_private.contract_context ctx on ctx.contract_id=c.id
   where j.id=p_job and ctx.provider_account=e.account;
  if oid is not null then update finance_private.provider_jobs set order_id=oid where id=p_job;perform finance_private.provider_hold(oid);end if;
 end if;
 return finance_private.fail_provider_job(p_job,p_token,p_code,p_terminal);
end $$;
create function finance_private.verified_effect(p_order uuid,p_key text,p_kind text,p_amount bigint,p_fetch uuid) returns void language plpgsql security definer set search_path='' as $$
declare prior finance_private.provider_effects;delta bigint;refund bigint;loss bigint;gross bigint;begin
 if p_amount=0 then return;end if;
 select * into prior from finance_private.provider_effects where order_id=p_order and effect_key=p_key;
 if found then if (prior.kind,prior.amount_minor) is distinct from (p_kind,p_amount) then raise exception 'provider_economic_conflict';end if;return;end if;
 insert into finance_private.provider_effects(order_id,effect_key,kind,amount_minor,fetch_id) values(p_order,p_key,p_kind,p_amount,p_fetch);
 if p_kind='chargeback_loss' then
  select b.gross,coalesce((select max(e.refunded_minor) from commerce_private.payment_events e where e.contract_id=b.contract_id),0) into gross,refund from finance_private.books b where order_id=p_order;
  select coalesce(sum(amount_minor),0) into loss from finance_private.all_effects where order_id=p_order and kind='chargeback_loss';
  select coalesce(sum((evidence->>'economicDelta')::bigint),0) into delta from finance_private.journals where order_id=p_order and kind in ('refund','chargeback_loss');
  delta:=least(gross,refund+loss)-delta;
  perform finance_private.reverse_economics(p_order,'verified-loss:'||p_key,least(gross,refund+loss),'dispute_receivable',jsonb_build_object('providerFetch',p_fetch,'effect',p_key));
  if p_amount>delta then perform finance_private.post(p_order,'verified-loss-overlap:'||p_key,'chargeback_overlap',jsonb_build_object('providerFetch',p_fetch),jsonb_build_object('chargeback_expense',p_amount-delta,'dispute_receivable',delta-p_amount));end if;
 else
  perform finance_private.post(p_order,'verified:'||p_key,p_kind,jsonb_build_object('providerFetch',p_fetch,'effect',p_key),
   case p_kind when 'processor_fee' then jsonb_build_object('processor_fees',p_amount,'clearing',-p_amount)
   when 'fee_return' then jsonb_build_object('clearing',p_amount,'processor_fees',-p_amount)
   when 'dispute_debit' then jsonb_build_object('dispute_receivable',p_amount,'clearing',-p_amount)
   when 'dispute_return' then jsonb_build_object('clearing',p_amount,'dispute_receivable',-p_amount) end);
 end if;
end $$;
create function public.finish_financial_provider_job(p_endpoint uuid,p_job uuid,p_token uuid,p_proof jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare ep finance_private.provider_endpoints;e finance_private.provider_events;j finance_private.provider_jobs;o public.orders;b finance_private.books;
 proof_id uuid;bt jsonb;d jsonb;old finance_private.provider_balances;h text;amount bigint;fee bigint;gross bigint:=0;refund bigint:=0;fees bigint:=0;dispute_net bigint:=0;
 projection jsonb;result jsonb;code text;rid uuid;begin
 ep:=finance_private.require_provider(p_endpoint,true);
 select e1.* into strict e from finance_private.provider_events e1 join finance_private.provider_jobs j1 on j1.event_id=e1.id where j1.id=p_job and e1.account=ep.account for update of e1;
 select * into strict j from finance_private.provider_jobs where id=p_job for update;
 if j.state<>'leased' or j.token is distinct from p_token or j.lease_until<clock_timestamp() then return jsonb_build_object('state','stale');end if;
 begin
  if octet_length(p_proof::text)>200000 or p_proof->>'schemaVersion' is distinct from 'TSE-PROVIDER-1' or p_proof->>'account' is distinct from ep.account
   or p_proof->'event' is distinct from e.summary or jsonb_typeof(p_proof->'balances') is distinct from 'array' or jsonb_array_length(p_proof->'balances')>1000
   or jsonb_typeof(p_proof->'disputes') is distinct from 'array' or jsonb_array_length(p_proof->'disputes')>100 then raise exception 'provider_binding_mismatch';end if;
  -- Resolve only database-bound identities. An event metadata hint never creates
  -- or selects an otherwise unbound order.
  select * into o from public.orders where
   ((p_proof->>'paymentIntent' is not null and stripe_payment_intent_id=p_proof->>'paymentIntent')
    or (p_proof->>'paymentIntent' is null and e.summary->>'session' is not null and stripe_checkout_session_id=e.summary->>'session'))
   and (e.summary->>'session' is null or stripe_checkout_session_id=e.summary->>'session') for update;
  if not found then raise exception 'canonical_binding_pending';end if;
  if e.summary->>'orderHint' is not null and e.summary->>'orderHint'<>o.id::text then raise exception 'provider_binding_mismatch';end if;
  update finance_private.provider_jobs set order_id=o.id where id=j.id;
  if exists(select 1 from finance_private.provider_conflicts where event_id=e.id) then raise exception 'provider_event_conflict';end if;
  perform public.post_financial_order(o.id);select * into strict b from finance_private.books where order_id=o.id;
  if b.provider_account<>ep.account or e.summary->>'currency' is distinct from b.currency or
   (e.summary->>'type' not like 'charge.dispute.%' and (e.summary->>'amount')::bigint<>b.gross) then raise exception 'provider_binding_mismatch';end if;
  if exists(select 1 from finance_private.simulation_facts where order_id=o.id) then raise exception 'mixed_synthetic_provider_evidence';end if;
  if (p_proof->'charge') is distinct from 'null'::jsonb then
   if p_proof#>>'{charge,paymentIntent}' is distinct from o.stripe_payment_intent_id or p_proof#>>'{charge,currency}' is distinct from b.currency
    or (p_proof#>>'{charge,amount}')::bigint<>b.gross then raise exception 'provider_binding_mismatch';end if;
   if p_proof#>>'{charge,paid}'='true' and not exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state='PAID') then raise exception 'canonical_payment_pending';end if;
   if (p_proof#>>'{charge,refunded}')::bigint<>coalesce((select max(refunded_minor) from commerce_private.payment_events where contract_id=b.contract_id),0) then raise exception 'canonical_payment_pending';end if;
  elsif exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state='PAID') then raise exception 'provider_details_pending';end if;
  insert into finance_private.provider_fetches(event_id,order_id,proof,proof_hash) values(e.id,o.id,p_proof,licensing_private.hash_json(p_proof)) returning id into proof_id;
  -- Import actual balance-transaction economic fields once, across every webhook.
  for bt in select value from jsonb_array_elements(p_proof->'balances') order by (value->>'created')::bigint,value->>'id' loop
   if coalesce(bt->>'id','') !~ '^txn_[A-Za-z0-9]+$' or bt->>'currency' is distinct from b.currency or bt->>'kind' not in ('charge','refund','dispute') then raise exception 'unsupported_provider_balance';end if;
   if coalesce(bt->>'amount','') !~ '^-?[0-9]{1,16}$' or coalesce(bt->>'fee','') !~ '^-?[0-9]{1,16}$'
    or coalesce(bt->>'net','') !~ '^-?[0-9]{1,16}$' or coalesce(bt->>'created','') !~ '^[0-9]{1,12}$' then raise exception 'invalid_balance_arithmetic';end if;
   amount:=(bt->>'amount')::bigint;fee:=(bt->>'fee')::bigint;
   if amount-fee is distinct from (bt->>'net')::bigint or abs(amount)>b.gross or abs(fee)>b.gross then raise exception 'invalid_balance_arithmetic';end if;
   if bt->>'kind'='charge' then
    if bt->>'type'<>'charge' or bt->>'source' is distinct from p_proof#>>'{charge,id}' or amount<>b.gross then raise exception 'provider_binding_mismatch';end if;gross:=gross+amount;
   elsif bt->>'kind'='refund' then
    if bt->>'type'<>'refund' or coalesce(bt->>'source','') !~ '^re_[A-Za-z0-9]+$' or amount>=0 then raise exception 'provider_binding_mismatch';end if;refund:=refund-amount;
   else
    if bt->>'type'<>'adjustment' or not exists(select 1 from jsonb_array_elements(p_proof->'disputes') x where x->>'id'=bt->>'source') then raise exception 'provider_binding_mismatch';end if;dispute_net:=dispute_net-amount;
   end if;
   fees:=fees+fee;h:=licensing_private.hash_json(bt);
   select * into old from finance_private.provider_balances where account=ep.account and balance_id=bt->>'id';
   if exists(select 1 from finance_private.provider_balances where account=ep.account and balance_id<>bt->>'id'
    and economic->>'source'=bt->>'source' and economic->>'kind'=bt->>'kind'
    and sign((economic->>'amount')::bigint)=sign(amount)) then raise exception 'provider_economic_conflict';end if;
   if found then if old.order_id<>o.id or old.economic_hash<>h then raise exception 'provider_economic_conflict';end if;
   else insert into finance_private.provider_balances values(ep.account,bt->>'id',o.id,bt,h,proof_id);end if;
   if fee<>0 then perform finance_private.verified_effect(o.id,'fee:'||(bt->>'id'),case when fee>0 then 'processor_fee' else 'fee_return' end,abs(fee),proof_id);end if;
   if bt->>'kind'='dispute' and amount<>0 then perform finance_private.verified_effect(o.id,'dispute:'||(bt->>'id'),case when amount<0 then 'dispute_debit' else 'dispute_return' end,abs(amount),proof_id);end if;
  end loop;
  if p_proof#>>'{charge,paid}'='true' and (gross<>b.gross or refund<>(p_proof#>>'{charge,refunded}')::bigint) then raise exception 'provider_internal_mismatch';end if;
  for d in select value from jsonb_array_elements(p_proof->'disputes') loop
   if not exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state='DISPUTED') then raise exception 'canonical_payment_pending';end if;
   if coalesce(d->>'id','') !~ '^(dp|du)_[A-Za-z0-9]+$' or (d->>'amount')::bigint not between 1 and b.gross then raise exception 'provider_binding_mismatch';end if;
   if d->>'status'='lost' then
    if not exists(select 1 from finance_private.provider_balances where order_id=o.id and economic->>'source'=d->>'id' and (economic->>'amount')::bigint<0) then raise exception 'provider_details_pending';end if;
    perform finance_private.verified_effect(o.id,'loss:'||(d->>'id'),'chargeback_loss',(d->>'amount')::bigint,proof_id);
   end if;
  end loop;
  projection:=jsonb_build_object('providerAccount',ep.account,'paymentMode','test','currency',b.currency,'grossMinor',gross,'refundedMinor',refund,'processorFeeMinor',fees,'settledMinor',0,'disputeNetDebitedMinor',dispute_net);
  result:=finance_private.inspect_order(o.id,projection);
  insert into finance_private.provider_reconciliations(job_id,order_id,provider_projection,result,fetch_id) values(j.id,o.id,projection,result,proof_id) returning id into rid;
  if not (result->>'matched')::boolean then insert into finance_private.provider_alerts(job_id,code,detail) values(j.id,'reconciliation_exception',jsonb_build_object('reconciliationId',rid,'issues',result->'issues'));end if;
  set constraints finance_private.balanced_header,finance_private.balanced_lines immediate;
  set constraints finance_private.balanced_header,finance_private.balanced_lines deferred;
  update finance_private.provider_jobs set state='posted',token=null,lease_until=null,last_code=null,updated_at=clock_timestamp() where id=j.id;
  insert into finance_private.provider_attempts(job_id,generation,attempt,outcome) values(j.id,j.generation,j.attempt,'posted');
  return jsonb_build_object('state','posted','reconciliationId',rid,'matched',result->'matched');
 exception when others then
  code:=case when sqlstate='23514' then 'unbalanced_journal' when sqlerrm in ('canonical_binding_pending','canonical_payment_pending','provider_details_pending','provider_binding_mismatch','provider_event_conflict','provider_economic_conflict','invalid_balance_arithmetic','unsupported_provider_balance','mixed_synthetic_provider_evidence','provider_internal_mismatch') then sqlerrm else 'financial_posting_failed' end;
  if o.id is not null then update finance_private.provider_jobs set order_id=o.id where id=j.id;end if;
  if code in ('provider_event_conflict','provider_economic_conflict','provider_binding_mismatch') then
   perform finance_private.provider_hold(o.id);
   -- New incompatible API economic evidence survives the failed posting
   -- subtransaction in an immutable alert, never replacing original amounts.
   insert into finance_private.provider_alerts(job_id,code,detail) values(j.id,code,jsonb_build_object('rejectedProof',case when octet_length(p_proof::text)<=200000 then p_proof else jsonb_build_object('oversize',true) end,'proofHash',licensing_private.hash_json(p_proof)));
  end if;
  return jsonb_build_object('state',finance_private.fail_provider_job(j.id,p_token,code,code not in ('canonical_binding_pending','canonical_payment_pending','provider_details_pending','financial_posting_failed')),'code',code);
 end;
end $$;
create function public.act_on_financial_provider_job(p_job uuid,p_request uuid,p_action text,p_reason text,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;j finance_private.provider_jobs;old finance_private.provider_operator_actions;result uuid;begin
 actor:=finance_private.require_admin();select * into old from finance_private.provider_operator_actions where request_id=p_request;
 if found then if (old.job_id,old.actor,old.action,old.reason,old.reference) is distinct from (p_job,actor,p_action,p_reason,p_reference) then raise exception 'Conflicting operator request';end if;return old.id;end if;
 select * into strict j from finance_private.provider_jobs where id=p_job for update;
 if p_action='retry' and j.state not in ('dead','retry') or p_action='reconcile' and j.state<>'posted' then raise exception 'Job is not eligible for this action';end if;
 if p_action in ('retry','reconcile') then
  if exists(select 1 from finance_private.provider_conflicts where event_id=j.event_id) then raise exception 'Conflicting evidence requires independent investigation';end if;
  update finance_private.provider_jobs set state='pending',attempt=0,generation=generation+1,next_at=clock_timestamp(),token=null,lease_until=null,updated_at=clock_timestamp() where id=p_job;
 end if;
 insert into finance_private.provider_operator_actions(request_id,job_id,actor,action,reason,reference) values(p_request,p_job,actor,p_action,p_reason,p_reference) returning id into result;return result;
end $$;
create function public.read_financial_provider_operations() returns jsonb language plpgsql security definer set search_path='' as $$
declare jobs jsonb;attempts jsonb;alerts jsonb;counts jsonb;corrections jsonb;exceptions jsonb;begin
 perform finance_private.require_admin();
 select coalesce(jsonb_object_agg(state,n),'{}') into counts from(select state,count(*) n from finance_private.provider_jobs group by state) q;
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into jobs from(select j.id,j.order_id,e.event_id,e.event_type,j.state,j.attempt,j.generation,j.next_at,j.lease_until,j.last_code,j.updated_at from finance_private.provider_jobs j join finance_private.provider_events e on e.id=j.event_id order by case when j.state in ('dead','conflict','retry') then 0 else 1 end,j.updated_at desc,j.id limit 50) r;
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into attempts from(select job_id,generation,attempt,outcome,code,created_at from finance_private.provider_attempts order by id desc limit 50) r;
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into alerts from(select id,job_id,code,created_at,case when code='reconciliation_exception' then detail else '{}'::jsonb end detail from finance_private.provider_alerts order by created_at desc,id limit 50) r;
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into corrections from(select c.id,c.original_journal,c.proposed_by,c.reason,c.evidence_reference,c.created_at,a.approved_by from finance_private.corrections c left join finance_private.correction_approvals a on a.correction_id=c.id order by c.created_at desc limit 20) r;
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into exceptions from(select id,job_id,order_id,result->'issues' issues,created_at from(select distinct on(order_id) * from finance_private.provider_reconciliations order by order_id,created_at desc,id desc) current where not (result->>'matched')::boolean order by created_at desc limit 50) r;
 return jsonb_build_object('counts',counts,'jobs',jobs,'attempts',attempts,'alerts',alerts,'corrections',corrections,'currentExceptions',exceptions,'oldestPendingSeconds',coalesce((select floor(extract(epoch from clock_timestamp()-min(e.received_at))) from finance_private.provider_jobs j join finance_private.provider_events e on e.id=j.event_id where j.state in ('pending','retry','leased')),0),'capabilities',(select jsonb_build_object('ingestion',ingestion_enabled,'worker',worker_enabled) from finance_private.capabilities),'externalAlertDelivery','not_configured');
end $$;
revoke all on all functions in schema finance_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema finance_private from public,anon,authenticated,service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
 ('ingest_financial_provider_event','claim_financial_provider_job','finish_financial_provider_job','fail_financial_provider_job','act_on_financial_provider_job','read_financial_provider_operations') loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
  execute format('grant execute on function %s to %I',f.signature,case when f.proname in ('act_on_financial_provider_job','read_financial_provider_operations') then 'authenticated' else 'service_role' end);
 end loop;
end $$;
commit;
