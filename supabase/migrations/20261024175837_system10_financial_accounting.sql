-- System 10. Additive local candidate; no capability activation, credentials,
-- commercial rates, live disbursements or hosted resources are configured.
begin;
create table finance_private.payee_bindings(
 sequence bigint generated always as identity unique,
 id uuid primary key default gen_random_uuid(),order_id uuid not null references finance_private.books(order_id),
 party_id text not null,artist_id uuid references public.user_profiles(id),previous_id uuid references finance_private.payee_bindings(id),
 request_id uuid not null unique,actor_id uuid not null references public.user_profiles(id),
 reason text not null,reference text not null,created_at timestamptz not null default clock_timestamp()
);
create index finance_payee_binding_history on finance_private.payee_bindings(order_id,party_id,sequence desc);
create table finance_private.payout_requests(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references finance_private.books(order_id),
 party_id text not null,artist_id uuid not null references public.user_profiles(id),binding_id uuid not null references finance_private.payee_bindings(id),
 amount_minor bigint not null check(amount_minor between 1 and 9007199254740991),currency text not null,
 scheduled_for date not null,request_id uuid not null unique,actor_id uuid not null references public.user_profiles(id),
 reference text not null,created_at timestamptz not null default clock_timestamp(),
 foreign key(order_id,currency) references finance_private.books(order_id,currency)
);
create table finance_private.payout_events(
 id uuid primary key default gen_random_uuid(),payout_id uuid not null references finance_private.payout_requests(id),
 revision integer not null check(revision>0),request_id uuid not null unique,actor_id uuid not null references public.user_profiles(id),
 command text not null check(command in ('prepare','schedule','hold','fail','simulate_complete','reverse','cancel')),
 state text not null check(state in ('held','scheduled','failed','simulated_completed','reversed','canceled')),
 fact_id uuid references finance_private.simulation_facts(id),journal_id uuid references finance_private.journals(id),
 reason text not null,reference text not null,created_at timestamptz not null default clock_timestamp(),unique(payout_id,revision)
);
create index finance_payout_order on finance_private.payout_requests(order_id,party_id);
create table finance_private.policy_actions(
 request_id uuid primary key,actor_id uuid not null references public.user_profiles(id),previous_offer uuid not null references licensing_private.offers(id),
 offer_id uuid not null references licensing_private.offers(id),input jsonb not null,reference text not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin
 foreach t in array array['payee_bindings','payout_requests','payout_events','policy_actions'] loop
  execute format('alter table finance_private.%I enable row level security',t);
  execute format('alter table finance_private.%I force row level security',t);
  execute format('create policy finance_owner on finance_private.%I for all to postgres using(true) with check(true)',t);
  execute format('create trigger immutable before update or delete on finance_private.%I for each row execute function licensing_private.immutable()',t);
 end loop;
end$$;
-- A party identity is copied from accepted evidence, never from a mutable email,
-- ownership percentage, current catalog row, or caller-supplied legal name.
create function finance_private.payee_name(p_order uuid,p_party text) returns text language sql stable security definer set search_path='' as $$
 select r#>>'{party,legalName}' from finance_private.books b,
 jsonb_array_elements((b.snapshot#>'{rights,master}')||(b.snapshot#>'{rights,publishing}')) r
 where b.order_id=p_order and r#>>'{party,id}'=p_party limit 1
$$;
create function finance_private.current_binding(p_order uuid,p_party text) returns finance_private.payee_bindings language sql stable security definer set search_path='' as $$
 select b from finance_private.payee_bindings b where b.order_id=p_order and b.party_id=p_party order by b.sequence desc limit 1
$$;
create function public.accounting_bind_payee(p_order uuid,p_party text,p_artist uuid,p_expected uuid,p_request uuid,p_reason text,p_reference text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid;old finance_private.payee_bindings;prior finance_private.payee_bindings;result uuid;begin
 actor:=finance_private.require_admin();
 if p_order is null or p_party is null or p_request is null or length(btrim(coalesce(p_reason,''))) not between 5 and 1000 or length(btrim(coalesce(p_reference,''))) not between 5 and 500 then raise exception 'Bounded identity review required' using errcode='22023';end if;
 perform 1 from public.orders where id=p_order for update;
 select * into old from finance_private.payee_bindings where request_id=p_request;
 if found then
  if (old.order_id,old.party_id,old.artist_id,old.previous_id,old.reason,old.reference,old.actor_id) is distinct from (p_order,p_party,p_artist,p_expected,p_reason,p_reference,actor) then raise exception 'Conflicting binding request' using errcode='40001';end if;return old.id;
 end if;
 if not exists(select 1 from finance_private.books b,jsonb_array_elements(b.snapshot#>'{financial,allocations}') a where b.order_id=p_order and a->>'partyId'=p_party)
 or finance_private.payee_name(p_order,p_party) is null then raise exception 'Accepted legal payee required' using errcode='22023';end if;
 prior:=finance_private.current_binding(p_order,p_party);
 if prior.id is distinct from p_expected then raise exception 'Stale binding version' using errcode='40001';end if;
 if p_artist is not null and not exists(select 1 from public.user_profiles where id=p_artist and role='artist') then raise exception 'Canonical Artist payee account required' using errcode='42501';end if;
 -- Corrections preserve old bindings and hold outstanding requests dynamically.
 insert into finance_private.payee_bindings(order_id,party_id,artist_id,previous_id,request_id,actor_id,reason,reference)
 values(p_order,p_party,p_artist,prior.id,p_request,actor,p_reason,p_reference) returning id into result;return result;
end$$;
-- Returns a bounded reason code only; no raw SQL, private source or Buyer data.
create function finance_private.payout_hold(p_order uuid,p_party text,p_binding uuid default null) returns text language plpgsql security definer set search_path='' as $$
declare b finance_private.books;v finance_private.payee_bindings;pol finance_private.simulation_policies;begin
 select * into b from finance_private.books where order_id=p_order;
 if not found then return 'financial_book_missing';end if;
 if not exists(select 1 from finance_private.journals where order_id=p_order and economic_key='purchase') then return 'payment_not_posted';end if;
 v:=finance_private.current_binding(p_order,p_party);
 if v.artist_id is null or (p_binding is not null and v.id is distinct from p_binding) or not exists(select 1 from public.user_profiles where id=v.artist_id and role='artist') then return 'payee_identity_review';end if;
 if exists(select 1 from finance_private.provider_fetches where order_id=p_order) then return 'provider_payout_adapter_required';end if;
 if not (select synthetic_posting_enabled from finance_private.capabilities where singleton) then return 'simulation_disabled';end if;
 select * into pol from finance_private.simulation_policies where order_id=p_order;
 if not found then return 'payout_policy_required';end if;
 if clock_timestamp()<pol.created_at+make_interval(secs=>(pol.policy->>'maturitySeconds')::int) then return 'maturity_pending';end if;
 if exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state<>'PAID') then return 'payment_hold';end if;
 if not exists(select 1 from public.generated_licenses where order_id=p_order and status='generated') then return 'license_pending';end if;
 begin perform licensing_private.assert_purchase(p_order,true);exception when others then return 'rights_or_legal_hold';end;
 return null;
end$$;
-- Test adapter: preparing obligations is not a transfer, settlement or bank payout.
create function public.accounting_prepare_payout(p_order uuid,p_party text,p_amount bigint,p_scheduled date,p_request uuid,p_reference text) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid;b finance_private.books;v finance_private.payee_bindings;old finance_private.payout_requests;result uuid;begin
 actor:=finance_private.require_admin();perform finance_private.assert_enabled();
 if p_request is null or p_amount is null or p_amount not between 1 and 9007199254740991 or p_scheduled is null
 or length(btrim(coalesce(p_reference,''))) not between 5 and 500 then raise exception 'Explicit bounded monthly payout preparation required' using errcode='22023';end if;
 perform 1 from public.orders where id=p_order for update;
 select * into old from finance_private.payout_requests where request_id=p_request;
 if found then if (old.order_id,old.party_id,old.amount_minor,old.scheduled_for,old.reference,old.actor_id) is distinct from (p_order,p_party,p_amount,p_scheduled,p_reference,actor) then raise exception 'Conflicting payout request' using errcode='40001';end if;return old.id;end if;
 if p_scheduled<current_date or p_scheduled>current_date+366 then raise exception 'Reviewed payout date outside preparation window' using errcode='22023';end if;
 select * into strict b from finance_private.books where order_id=p_order;
 v:=finance_private.current_binding(p_order,p_party);
 if v.artist_id is null then raise exception 'Explicit payee account binding required' using errcode='22023';end if;
 if not exists(select 1 from jsonb_array_elements(b.snapshot#>'{financial,allocations}') a where a->>'partyId'=p_party and (a->>'amountCents')::bigint>=p_amount) then raise exception 'Accepted allocation exceeded' using errcode='22023';end if;
 insert into finance_private.payout_requests(order_id,party_id,artist_id,binding_id,amount_minor,currency,scheduled_for,request_id,actor_id,reference)
 values(p_order,p_party,v.artist_id,v.id,p_amount,b.currency,p_scheduled,p_request,actor,p_reference) returning id into result;
 insert into finance_private.payout_events(payout_id,revision,request_id,actor_id,command,state,reason,reference)
 values(result,1,p_request,actor,'prepare','held','Explicit preparation; schedule requires current authorization',p_reference);
 return result;
end$$;
create function public.accounting_act_payout(p_payout uuid,p_revision integer,p_command text,p_request uuid,p_reason text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;r finance_private.payout_requests;e finance_private.payout_events;old finance_private.payout_events;f uuid;j uuid;state text;h text;begin
 actor:=finance_private.require_admin();perform finance_private.assert_enabled();
 if p_revision is null or p_request is null or p_command is null or p_command not in ('schedule','hold','fail','simulate_complete','reverse','cancel') or length(btrim(coalesce(p_reason,''))) not between 5 and 1000 or length(btrim(coalesce(p_reference,''))) not between 5 and 500 then raise exception 'Bounded reviewed payout action required' using errcode='22023';end if;
 select * into strict r from finance_private.payout_requests where id=p_payout;
 -- Match the financial/order worker lock order. No lock on another order or payee.
 perform 1 from public.orders where id=r.order_id for update;
 select * into old from finance_private.payout_events where request_id=p_request;
 if found then if (old.payout_id,old.revision,old.command,old.reason,old.reference,old.actor_id) is distinct from (p_payout,p_revision+1,p_command,p_reason,p_reference,actor) then raise exception 'Conflicting payout action' using errcode='40001';end if;return jsonb_build_object('id',old.id,'state',old.state,'revision',old.revision,'actualPaidMinor','0');end if;
 select * into strict e from finance_private.payout_events where payout_id=p_payout order by revision desc limit 1;
 if e.revision<>p_revision then raise exception 'Stale payout revision' using errcode='40001';end if;
 if e.state in ('canceled','reversed') or (e.state='simulated_completed' and p_command<>'reverse') then raise exception 'Terminal payout state' using errcode='22023';end if;
 h:=finance_private.payout_hold(r.order_id,r.party_id,r.binding_id);
 if p_command in ('schedule','simulate_complete') and h is not null then raise exception 'Payout held: %',h using errcode='22023';end if;
 if p_command='schedule' then
  if e.state not in ('held','failed') then raise exception 'Payout already scheduled' using errcode='22023';end if;
  f:=public.record_finance_simulation_fact(r.order_id,'system10:'||p_request,'payout_reserve',r.amount_minor,r.currency,licensing_private.hash_json(jsonb_build_object('payout',r.id,'action',p_request)),p_reason,r.party_id,null);state:='scheduled';
 elsif p_command='simulate_complete' then
  if e.state<>'scheduled' or r.scheduled_for>current_date then raise exception 'Due scheduled reservation required' using errcode='22023';end if;
  f:=public.record_finance_simulation_fact(r.order_id,'system10:'||p_request,'payout_settle',r.amount_minor,r.currency,licensing_private.hash_json(jsonb_build_object('payout',r.id,'action',p_request)),p_reason,r.party_id,e.fact_id);state:='simulated_completed';
 elsif p_command='reverse' then
  if e.state<>'simulated_completed' or e.fact_id is null then raise exception 'Original simulated completion required' using errcode='22023';end if;
  -- Preserve provider separation even when a recovery is requested later.
  if exists(select 1 from finance_private.provider_fetches where order_id=r.order_id) then raise exception 'Verified provider book cannot accept simulation';end if;
  j:=finance_private.post(r.order_id,'payout-reversal:'||r.id,'payout_reversal',jsonb_build_object('payoutRequest',r.id,'originalFact',e.fact_id,'reason',p_reason,'reference',p_reference,'actor',actor),jsonb_build_object('payout_clearing',r.amount_minor,'payable:'||r.party_id,-r.amount_minor));state:='reversed';
 else
  if e.state='scheduled' then f:=public.record_finance_simulation_fact(r.order_id,'system10:'||p_request,'payout_release',r.amount_minor,r.currency,licensing_private.hash_json(jsonb_build_object('payout',r.id,'action',p_request)),p_reason,r.party_id,e.fact_id);end if;
  state:=case p_command when 'hold' then 'held' when 'fail' then 'failed' else 'canceled' end;
 end if;
 insert into finance_private.payout_events(payout_id,revision,request_id,actor_id,command,state,fact_id,journal_id,reason,reference)
 values(r.id,e.revision+1,p_request,actor,p_command,state,f,j,p_reason,p_reference) returning * into old;
 return jsonb_build_object('id',old.id,'state',old.state,'revision',old.revision,'actualPaidMinor','0');
end$$;
-- Extend the original per-payee comparator by the exact retained reversal only.
-- Do not replace provider verification or mask pre-existing issues.
do $$declare body text;needle text:='where order_id=p_order and kind=''payout_settle'' and party_id=v->>''partyId''),0)';begin
 body:=pg_get_functiondef('finance_private.inspect_order(uuid,jsonb)'::regprocedure);
 if position(needle in body)=0 then raise exception 'System10 reconciliation prerequisite drift';end if;
 body:=replace(body,needle,needle||' - coalesce((select sum(r.amount_minor) from finance_private.payout_events pe join finance_private.payout_requests r on r.id=pe.payout_id where r.order_id=p_order and r.party_id=v->>''partyId'' and pe.state=''reversed''),0)');
 execute body;
end$$;
-- Controlled new offers require fresh source/deliverable/catalog approval. Existing
-- accepted quotes, books, pricing evidence and payout policies remain immutable.
create function public.accounting_configure_policy(p_track uuid,p_license uuid,p_expected uuid,p_request uuid,p_policy jsonb,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;o licensing_private.offers;old finance_private.policy_actions;financial jsonb;terms jsonb;c jsonb;a jsonb;total integer:=0;n integer;newid uuid;begin
 actor:=finance_private.require_admin();
 if p_request is null or p_policy is null or jsonb_typeof(p_policy) is distinct from 'object' or octet_length(p_policy::text)>6000
 or length(btrim(coalesce(p_reference,''))) not between 5 and 500 or p_policy->>'mode' is null or p_policy->>'mode' not in ('synthetic','approved')
 or (p_policy->>'mode'='synthetic' and p_reference not like 'SYNTHETIC%')
 or length(coalesce(p_policy->>'version','')) not between 2 and 100 or length(coalesce(p_policy->>'sellerTier','')) not between 2 and 100
 or p_policy->>'currency' is distinct from 'USD' or p_policy->>'commissionBasis' is distinct from 'gross'
 or coalesce(p_policy->>'commissionBps','') !~ '^[0-9]{1,5}$' or (p_policy->>'commissionBps')::int>10000
 or jsonb_typeof(p_policy->'allocations') is distinct from 'array' or jsonb_array_length(p_policy->'allocations') not between 1 and 50
 or jsonb_typeof(p_policy->'feeOverride') is distinct from 'boolean'
 or exists(select 1 from jsonb_object_keys(p_policy) k where k not in ('version','sellerTier','currency','commissionBasis','commissionBps','allocations','mode','feeOverride')) then raise exception 'Explicit approved or synthetic gross-basis USD policy required' using errcode='22023';end if;
 perform 1 from public.tracks where id=p_track for update;
 select * into old from finance_private.policy_actions where request_id=p_request;
 if found then if (old.actor_id,old.previous_offer,old.input,old.reference) is distinct from (actor,p_expected,p_policy,p_reference) or not exists(select 1 from licensing_private.offers where id=old.offer_id and track_id=p_track and license_type_id=p_license) then raise exception 'Conflicting policy request' using errcode='40001';end if;return jsonb_build_object('offerId',old.offer_id,'reviewRequired',true);end if;
 select v.* into strict o from licensing_private.offer_heads h join licensing_private.offers v on v.id=h.offer_id where h.track_id=p_track and h.license_type_id=p_license;
 if o.id is distinct from p_expected then raise exception 'Stale offer version' using errcode='40001';end if;
 if o.financial->>'policyVersion'=p_policy->>'version' then raise exception 'New policy version required' using errcode='22023';end if;
 perform licensing_private.check_offer(o.id,clock_timestamp());
 for a in select value from jsonb_array_elements(p_policy->'allocations') loop
  if jsonb_typeof(a) is distinct from 'object' or exists(select 1 from jsonb_object_keys(a) k where k not in ('partyId','bps'))
   or coalesce(a->>'partyId','') !~ '^[A-Za-z0-9_-]{2,100}$' or coalesce(a->>'bps','') !~ '^[0-9]{1,5}$' or (a->>'bps')::int not between 1 and 10000
   or not exists(select 1 from jsonb_array_elements((o.rights->'master')||(o.rights->'publishing')) r where r#>>'{party,id}'=a->>'partyId') then raise exception 'Explicit identified payee allocation required' using errcode='22023';end if;
  total:=total+(a->>'bps')::int;
 end loop;
 select count(distinct value->>'partyId') into n from jsonb_array_elements(p_policy->'allocations');
 if total<>10000 or n<>jsonb_array_length(p_policy->'allocations') then raise exception 'Unique complete allocation required' using errcode='22023';end if;
 financial:=jsonb_build_object('policyVersion',p_policy->>'version','commissionBps',p_policy->'commissionBps','approvalReference',p_reference,'allocations',p_policy->'allocations','policy',p_policy||jsonb_build_object('approvalReference',p_reference));
 terms:=o.terms;c:=terms->'licenseContract';
 if c is not null then
  c:=c||jsonb_build_object('version',p_policy->>'version','approval',jsonb_build_object('mode',p_policy->>'mode','reference',p_reference),
   'pricing',(c->'pricing')||jsonb_build_object('version',p_policy->>'version','sellerTier',p_policy->>'sellerTier','commissionBps',p_policy->'commissionBps'));
  perform licensing_private.check_contract(c,o.rights,financial,o.license_exclusive);
  terms:=terms||jsonb_build_object('version',p_policy->>'version','licenseContract',c,'approvalReference',p_reference);
 end if;
 insert into licensing_private.offers(track_id,license_type_id,seller_user_id,source_hash,rights_epoch,license_exclusive,rights,terms,financial,reviewed_by,review_reference)
 values(o.track_id,o.license_type_id,o.seller_user_id,o.source_hash,o.rights_epoch,o.license_exclusive,o.rights,terms,financial,actor,p_reference) returning id into newid;
 update licensing_private.offer_heads set offer_id=newid where track_id=p_track and license_type_id=p_license;
 insert into finance_private.policy_actions values(p_request,actor,o.id,newid,p_policy,p_reference,clock_timestamp());
 insert into public.track_audit_log(track_id,actor_id,action,metadata) values(p_track,actor,'financial_policy_versioned',jsonb_build_object('previousOffer',o.id,'offerId',newid,'reference',p_reference));
 return jsonb_build_object('offerId',newid,'reviewRequired',true);
end$$;

create function finance_private.accounting_order(p_order uuid,p_actor uuid,p_admin boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare b finance_private.books;seller boolean;paid boolean;rows jsonb:='[]';payouts jsonb;v jsonb;binding finance_private.payee_bindings;payable bigint;reserved bigint;allocated bigint;reversed bigint;completed bigint;hold text;eligible bigint;net bigint;pol jsonb;own boolean;begin
 select * into strict b from finance_private.books where order_id=p_order;
 select coalesce(-sum(signed_minor),0) into net from finance_private.lines where order_id=p_order and (account like 'payable:%' or account like 'reserved:%');
 select net+coalesce(sum(amount_minor),0) into net from finance_private.simulation_facts where order_id=p_order and kind='payout_settle';
 select net-coalesce(sum(r.amount_minor),0) into net from finance_private.payout_events e join finance_private.payout_requests r on r.id=e.payout_id where r.order_id=p_order and e.state='reversed';
 seller:=b.snapshot#>>'{seller,userId}'=p_actor::text;
 paid:=exists(select 1 from finance_private.journals where order_id=p_order and economic_key='purchase');
 for v in select value from jsonb_array_elements(b.snapshot#>'{financial,allocations}') loop
  binding:=finance_private.current_binding(p_order,v->>'partyId');own:=binding.artist_id=p_actor;
  if p_admin or seller or coalesce(own,false) then
   payable:=-finance_private.balance(p_order,'payable:'||(v->>'partyId'));reserved:=-finance_private.balance(p_order,'reserved:'||(v->>'partyId'));
   allocated:=(v->>'amountCents')::bigint;
   select coalesce(sum(amount_minor),0) into completed from finance_private.simulation_facts where order_id=p_order and party_id=v->>'partyId' and kind='payout_settle';
   select completed-coalesce(sum(r.amount_minor),0) into completed from finance_private.payout_events e join finance_private.payout_requests r on r.id=e.payout_id where r.order_id=p_order and r.party_id=v->>'partyId' and e.state='reversed';
   reversed:=case when paid then allocated-payable-reserved-completed else 0 end;
   hold:=finance_private.payout_hold(p_order,v->>'partyId',binding.id);eligible:=0;
   select policy into pol from finance_private.simulation_policies where order_id=p_order;
   if hold is null then eligible:=greatest(0,payable-ceil(allocated::numeric*(pol->>'reserveBps')::int/10000)::bigint);end if;
   rows:=rows||jsonb_build_array(jsonb_build_object('partyId',v->>'partyId','legalName',finance_private.payee_name(p_order,v->>'partyId'),
    'allocationBps',v->'bps','allocatedMinor',allocated::text,'attributedToYou',coalesce(own,false),
    'bindingId',case when p_admin then binding.id else null end,'artistId',case when p_admin then binding.artist_id else null end,
    'pendingMinor',(case when paid then 0 else allocated end)::text,'owedMinor',greatest(payable+reserved+completed,0)::text,
    'heldMinor',least(greatest(payable+reserved+completed,0),greatest(payable,0)-eligible+greatest(reserved,0)+completed)::text,'eligibleSimulationMinor',eligible::text,
    'reservedMinor',greatest(reserved,0)::text,'refundAndLossMinor',reversed::text,'recoveryMinor',greatest(-payable,0)::text,
    'simulatedCompletedMinor',completed::text,'paidMinor','0','availableMinor','0','hold',hold));
  end if;
 end loop;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'partyId',r.party_id,'legalName',finance_private.payee_name(p_order,r.party_id),'amountMinor',r.amount_minor::text,'currency',r.currency,'scheduledFor',r.scheduled_for,
  'state',e.state,'revision',e.revision,'hold',finance_private.payout_hold(r.order_id,r.party_id,r.binding_id),'actualPaidMinor','0',
  'history',(select jsonb_agg(jsonb_build_object('id',h.id,'state',h.state,'command',h.command,'at',h.created_at,'reason',case when p_admin then h.reason else null end,'reference',case when p_admin then h.reference else null end) order by h.revision) from finance_private.payout_events h where h.payout_id=r.id)) order by r.created_at desc),'[]') into payouts
 from finance_private.payout_requests r cross join lateral(select * from finance_private.payout_events e where e.payout_id=r.id order by revision desc limit 1) e
 where r.order_id=p_order and (p_admin or r.artist_id=p_actor);
 return jsonb_build_object('orderId',p_order,'currency',b.currency,'createdAt',b.created_at,'trackTitle',b.snapshot#>>'{track,title}',
 'managedSale',seller,'grossMinor',case when p_admin or seller then (case when paid then b.gross else 0 end)::text else null end,
 'platformFeeMinor',case when p_admin or seller then (-finance_private.balance(p_order,'platform_revenue'))::text else null end,
 'netProceedsMinor',case when p_admin or seller then net::text else null end,
 'policyVersion',b.snapshot#>>'{financial,policyVersion}','policy',case when p_admin or seller then b.snapshot#>'{financial,policy}' else null end,
 'processorFeeMinor',case when p_admin then finance_private.balance(p_order,'processor_fees')::text else null end,
 'paidEvidence',paid,'allocations',rows,'payouts',payouts,'actualPaidMinor','0','withdrawableMinor','0','livePayoutsEnabled',false,
 'accounting',case when p_admin then public.read_financial_order(p_order) else null end,
 'purchaseHash',case when p_admin then b.purchase_hash else null end);
end$$;
create function public.accounting_artist_earnings(p_page integer default 1,p_size integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();result jsonb;total bigint;begin
 if auth.role() is distinct from 'authenticated' or public.current_app_role() is distinct from 'artist' or not public.auth_session_is_active() then raise exception 'Active canonical Artist required' using errcode='42501';end if;
 if p_page is null or p_size is null or p_page not between 1 and 10000 or p_size not between 1 and 50 then raise exception 'Bounded earnings page required' using errcode='22023';end if;
 select count(*) into total from finance_private.books b where b.snapshot#>>'{seller,userId}'=actor::text
 or exists(select 1 from jsonb_array_elements(b.snapshot#>'{financial,allocations}') a where (finance_private.current_binding(b.order_id,a->>'partyId')).artist_id=actor)
 or exists(select 1 from finance_private.payout_requests r where r.order_id=b.order_id and r.artist_id=actor);
 select coalesce(jsonb_agg(finance_private.accounting_order(q.order_id,actor,false) order by q.created_at desc,q.order_id),'[]') into result from (
 select b.order_id,b.created_at from finance_private.books b where b.snapshot#>>'{seller,userId}'=actor::text
 or exists(select 1 from jsonb_array_elements(b.snapshot#>'{financial,allocations}') a where (finance_private.current_binding(b.order_id,a->>'partyId')).artist_id=actor)
 or exists(select 1 from finance_private.payout_requests r where r.order_id=b.order_id and r.artist_id=actor)
 order by b.created_at desc,b.order_id limit p_size offset (p_page-1)*p_size) q;
 return jsonb_build_object('orders',result,'total',total,'page',p_page,'size',p_size,'syntheticOnly',true,'actualPaidMinor','0','withdrawableMinor','0','livePayoutsEnabled',false);
end$$;
create function public.accounting_admin_report(p_page integer default 1,p_size integer default 20) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;result jsonb;begin
 actor:=finance_private.require_admin();
 if p_page is null or p_size is null or p_page not between 1 and 10000 or p_size not between 1 and 50 then raise exception 'Bounded accounting page required' using errcode='22023';end if;
 select coalesce(jsonb_agg(finance_private.accounting_order(q.order_id,actor,true) order by q.created_at desc,q.order_id),'[]') into result from (
 select order_id,created_at from finance_private.books order by created_at desc,order_id limit p_size offset (p_page-1)*p_size) q;
 return jsonb_build_object('orders',result,'total',(select count(*) from finance_private.books),'page',p_page,'size',p_size,
 'summary',public.read_financial_summary(),'livePayoutsEnabled',false,'withdrawableMinor','0',
 'payoutAdapter','synthetic_only','monthlySchedule','Explicit reviewed date; no scheduler or live disbursement',
 'bindingHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select id,order_id,party_id,artist_id,previous_id,actor_id,reason,reference,created_at from finance_private.payee_bindings order by created_at desc,id limit 100) x),
 'policyHistory',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from(select request_id,actor_id,previous_offer,offer_id,reference,created_at from finance_private.policy_actions order by created_at desc,request_id limit 100) x));
end$$;
-- Verify payout obligations against their exact retained reservation/settlement/
-- reversal journals. Keep old comparator issues; never net one payee against another.
create function finance_private.payout_issues(p_order uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb:='[]';r record;e finance_private.payout_events;expected bigint;begin
 select -coalesce(sum(amount_minor),0) into expected from finance_private.simulation_facts where order_id=p_order and kind='payout_settle';
 select expected+coalesce(sum(pr.amount_minor),0) into expected from finance_private.payout_events pe join finance_private.payout_requests pr on pr.id=pe.payout_id where pr.order_id=p_order and pe.state='reversed';
 if finance_private.balance(p_order,'payout_clearing')<>expected then result:=result||jsonb_build_array('payout_clearing_mismatch');end if;
 for r in select a->>'partyId' party_id from finance_private.books b,jsonb_array_elements(b.snapshot#>'{financial,allocations}') a where b.order_id=p_order loop
  select coalesce(sum(case when kind='payout_reserve' then -amount_minor else amount_minor end),0) into expected from finance_private.simulation_facts where order_id=p_order and party_id=r.party_id and kind in ('payout_reserve','payout_release','payout_settle');
  if finance_private.balance(p_order,'reserved:'||r.party_id)<>expected then result:=result||jsonb_build_array('payout_reserved_mismatch:'||r.party_id);end if;
 end loop;
 for r in select * from finance_private.payout_requests where order_id=p_order loop
  select * into e from finance_private.payout_events where payout_id=r.id order by revision desc limit 1;
  if e.id is null then result:=result||jsonb_build_array('payout_history_missing:'||r.id);end if;
  if e.state='scheduled' and not exists(select 1 from finance_private.simulation_facts f where id=e.fact_id and order_id=r.order_id and party_id=r.party_id and kind='payout_reserve' and amount_minor=r.amount_minor) then result:=result||jsonb_build_array('payout_reservation_mismatch:'||r.id);end if;
  if e.state='simulated_completed' and not exists(select 1 from finance_private.simulation_facts f where id=e.fact_id and order_id=r.order_id and party_id=r.party_id and kind='payout_settle' and amount_minor=r.amount_minor) then result:=result||jsonb_build_array('payout_completion_mismatch:'||r.id);end if;
  if e.state='reversed' and not exists(select 1 from finance_private.journals j where j.id=e.journal_id and order_id=r.order_id and economic_key='payout-reversal:'||r.id and kind='payout_reversal') then result:=result||jsonb_build_array('payout_reversal_mismatch:'||r.id);end if;
  if e.state='scheduled' and finance_private.payout_hold(p_order,r.party_id,r.binding_id) is not null then result:=result||jsonb_build_array('scheduled_payout_held:'||r.id);end if;
 end loop;return result;
end$$;
do $$declare body text;needle text:='expected:=jsonb_build_object(''providerAccount''';begin
 body:=pg_get_functiondef('finance_private.inspect_order(uuid,jsonb)'::regprocedure);
 if position(needle in body)=0 then raise exception 'System10 payout comparator drift';end if;
 execute replace(body,needle,'issues:=issues||finance_private.payout_issues(p_order); '||needle);
end$$;
revoke all on all tables in schema finance_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema finance_private from public,anon,authenticated,service_role;
revoke all on all functions in schema finance_private from public,anon,authenticated,service_role;
revoke all on function public.accounting_bind_payee(uuid,text,uuid,uuid,uuid,text,text),public.accounting_prepare_payout(uuid,text,bigint,date,uuid,text),public.accounting_act_payout(uuid,integer,text,uuid,text,text),public.accounting_configure_policy(uuid,uuid,uuid,uuid,jsonb,text),public.accounting_artist_earnings(integer,integer),public.accounting_admin_report(integer,integer) from public,anon,service_role;
grant execute on function public.accounting_bind_payee(uuid,text,uuid,uuid,uuid,text,text),public.accounting_prepare_payout(uuid,text,bigint,date,uuid,text),public.accounting_act_payout(uuid,integer,text,uuid,text,text),public.accounting_configure_policy(uuid,uuid,uuid,uuid,jsonb,text),public.accounting_artist_earnings(integer,integer),public.accounting_admin_report(integer,integer) to authenticated;
commit;
