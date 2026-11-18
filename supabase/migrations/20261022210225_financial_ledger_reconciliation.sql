-- PK09 local candidate. No backfill, provider calls, capabilities or payouts enabled.
-- Depends on exact PK07/03/06/08/04 chain. Money is accepted integer minor units.
begin;
set local lock_timeout='5s';
do $$ begin
 if current_user<>'postgres' or to_regprocedure('licensing_private.assert_source(jsonb,boolean)') is null
 or to_regclass('licensing_private.source_reviews') is null then raise exception 'PK04 and reviewed postgres installer required';end if;
end $$;
create schema finance_private;
revoke all on schema finance_private from public,anon,authenticated,service_role;
create table finance_private.capabilities(singleton boolean primary key default true check(singleton),
 synthetic_posting_enabled boolean not null default false);
insert into finance_private.capabilities values(true,false);
create table finance_private.books(
 order_id uuid primary key references public.orders(id) on delete restrict,
 contract_id uuid not null unique references public.order_delivery_contracts(id) on delete restrict,
 provider_account text not null, payment_mode text not null check(payment_mode='test'),
 currency text not null check(currency ~ '^[A-Z]{3}$'), gross bigint not null check(gross>0 and gross<=9007199254740991),
 snapshot jsonb not null, purchase_hash text not null, source_hash text not null,
 refund_policy text not null default 'proportional-floor-suspense-v1' check(refund_policy='proportional-floor-suspense-v1'),
 created_at timestamptz not null default clock_timestamp(),unique(order_id,currency)
);
create table finance_private.accounts(
 order_id uuid not null, currency text not null, account text not null,
 primary key(order_id,currency,account),foreign key(order_id,currency) references finance_private.books(order_id,currency) on delete restrict
);
create table finance_private.journals(
 id uuid primary key default gen_random_uuid(),order_id uuid not null,currency text not null,
 economic_key text not null,kind text not null,evidence jsonb not null,
 reverses uuid unique references finance_private.journals(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),created_tx bigint not null default txid_current(),
 foreign key(order_id,currency) references finance_private.books(order_id,currency) on delete restrict,
 unique(order_id,economic_key),unique(id,order_id,currency)
);
create index finance_journals_order on finance_private.journals(order_id,created_at,id);
create table finance_private.lines(
 journal_id uuid not null,order_id uuid not null,currency text not null,account text not null,
 signed_minor bigint not null check(signed_minor<>0 and signed_minor between -9007199254740991 and 9007199254740991),
 primary key(journal_id,account),foreign key(journal_id,order_id,currency) references finance_private.journals(id,order_id,currency) on delete restrict,
 foreign key(order_id,currency,account) references finance_private.accounts(order_id,currency,account) on delete restrict
);
create index finance_lines_account on finance_private.lines(order_id,account);
-- Durable source inbox is the original immutable payment_events table. A receipt
-- is committed atomically with its journal; no network call or webhook mutation.
create table finance_private.posted_events(
 payment_event_id uuid primary key references commerce_private.payment_events(id) on delete restrict,
 order_id uuid not null references finance_private.books(order_id) on delete restrict,
 evidence_hash text not null,created_at timestamptz not null default clock_timestamp()
);
create table finance_private.simulation_facts(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references finance_private.books(order_id) on delete restrict,
 external_id text not null check(length(external_id) between 5 and 120),kind text not null check(kind in
 ('processor_fee','fee_return','settlement','dispute_debit','dispute_return','chargeback_loss','tax_accrual','tax_remittance','payout_reserve','payout_release','payout_settle')),
 amount_minor bigint not null check(amount_minor>0 and amount_minor<=9007199254740991),currency text not null,
 party_id text,related_fact uuid references finance_private.simulation_facts(id) on delete restrict,
 evidence_hash text not null check(evidence_hash ~ '^[a-f0-9]{64}$'),
 reason text not null check(length(reason) between 10 and 1000),actor uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp(),unique(order_id,external_id),
 foreign key(order_id,currency) references finance_private.books(order_id,currency) on delete restrict
);
create table finance_private.reconciliations(
 id uuid primary key default gen_random_uuid(),order_id uuid not null references public.orders(id) on delete restrict,
 provider_projection jsonb not null,result jsonb not null,actor uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
create index finance_reconcile_order on finance_private.reconciliations(order_id,created_at desc,id);
create table finance_private.case_actions(
 id uuid primary key default gen_random_uuid(),reconciliation_id uuid not null references finance_private.reconciliations(id) on delete restrict,
 actor uuid not null references public.user_profiles(id) on delete restrict,request_id uuid not null unique,
 action text not null check(action in ('investigate','retry_posting','escalate','acknowledge')),
 reason text not null check(length(reason) between 10 and 1000),evidence_reference text not null check(length(evidence_reference) between 5 and 500),
 created_at timestamptz not null default clock_timestamp()
);
create table finance_private.corrections(
 id uuid primary key default gen_random_uuid(),original_journal uuid not null unique references finance_private.journals(id) on delete restrict,
 request_id uuid not null unique,proposed_by uuid not null references public.user_profiles(id) on delete restrict,
 reason text not null check(length(reason) between 10 and 1000),evidence_reference text not null check(length(evidence_reference) between 5 and 500),
 created_at timestamptz not null default clock_timestamp()
);
create table finance_private.correction_approvals(
 correction_id uuid primary key references finance_private.corrections(id) on delete restrict,
 approved_by uuid not null references public.user_profiles(id) on delete restrict,
 reversing_journal uuid not null references finance_private.journals(id) on delete restrict,
 replacement_journal uuid not null references finance_private.journals(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
create table finance_private.simulation_policies(
 order_id uuid primary key references finance_private.books(order_id) on delete restrict,
 policy jsonb not null,actor uuid not null references public.user_profiles(id) on delete restrict,
 created_at timestamptz not null default clock_timestamp()
);
do $$ declare t text;begin
 foreach t in array array['capabilities','books','accounts','journals','lines','posted_events','simulation_facts','reconciliations','case_actions','corrections','correction_approvals','simulation_policies'] loop
  execute format('alter table finance_private.%I enable row level security',t);
  execute format('alter table finance_private.%I force row level security',t);
  execute format('create policy owner_only on finance_private.%I to postgres using(true) with check(true)',t);
  execute format('revoke all on finance_private.%I from public,anon,authenticated,service_role',t);
  if t<>'capabilities' then execute format('create trigger retain_finance before update or delete on finance_private.%I for each row execute function licensing_private.immutable()',t);end if;
 end loop;
end $$;
create function finance_private.assert_enabled() returns void language plpgsql security definer set search_path='' as $$
begin
 if not (select synthetic_posting_enabled from finance_private.capabilities where singleton) then
  raise exception 'Synthetic financial posting disabled' using errcode='42501';end if;
end $$;
create function finance_private.require_admin() returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null or not exists(select 1 from public.user_profiles where id=actor and role='admin') then
  raise exception 'Canonical Admin required' using errcode='42501';end if;return actor;
end $$;
create function public.freeze_finance_simulation_policy(p_order uuid,p_policy jsonb) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid;b finance_private.books;old jsonb;begin
 actor:=finance_private.require_admin();perform finance_private.assert_enabled();
 perform 1 from public.orders where id=p_order for update;
 select * into strict b from finance_private.books where order_id=p_order;
 if p_policy->>'synthetic' is distinct from 'true' or p_policy->>'version' is distinct from b.snapshot#>>'{financial,policyVersion}'
 or length(coalesce(p_policy->>'tier','')) not between 2 and 100
 or length(coalesce(p_policy->>'approvalReference','')) not between 5 and 500
 or coalesce(p_policy->>'commissionBasis','') not in ('gross','net_processor_fee')
 or p_policy->>'refundPolicy' is distinct from b.refund_policy
 or coalesce(p_policy->>'maturitySeconds','') !~ '^[0-9]{1,8}$'
 or coalesce(p_policy->>'reserveBps','') !~ '^[0-9]{1,5}$' or (p_policy->>'reserveBps')::int>10000
 or octet_length(p_policy::text)>10000 then raise exception 'Explicit complete synthetic maturity/tier/reserve policy required';end if;
 select policy into old from finance_private.simulation_policies where order_id=p_order;
 if found then if old is distinct from p_policy then raise exception 'Frozen financial policy cannot change';end if;return;end if;
 insert into finance_private.simulation_policies values(p_order,p_policy,actor,clock_timestamp());
end $$;
create function finance_private.assert_balanced() returns trigger language plpgsql security definer set search_path='' as $$
declare jid uuid; n bigint; total numeric;begin
 jid:=coalesce(to_jsonb(new)->>'journal_id',to_jsonb(new)->>'id')::uuid;
 select count(*),coalesce(sum(signed_minor),0) into n,total from finance_private.lines where journal_id=jid;
 if n<2 or total<>0 then raise exception 'Unbalanced financial journal' using errcode='23514';end if;return null;
end $$;
create constraint trigger balanced_header after insert on finance_private.journals deferrable initially deferred for each row execute function finance_private.assert_balanced();
create constraint trigger balanced_lines after insert on finance_private.lines deferrable initially deferred for each row execute function finance_private.assert_balanced();
create function finance_private.check_line_admission() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from finance_private.journals where id=new.journal_id and created_tx=txid_current()) then
  raise exception 'Committed journal cannot acquire new lines' using errcode='42501';end if;return new;
end $$;
create trigger line_admission before insert on finance_private.lines for each row execute function finance_private.check_line_admission();
create function finance_private.balance(p_order uuid,p_account text) returns bigint language sql stable security definer set search_path='' as $$
 select coalesce(sum(signed_minor),0)::bigint from finance_private.lines where order_id=p_order and account=p_account
$$;
create function finance_private.post(p_order uuid,p_key text,p_kind text,p_evidence jsonb,p_lines jsonb,p_reverses uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare b finance_private.books;j uuid;r record;begin
 select * into strict b from finance_private.books where order_id=p_order;
 -- Only a single owner transaction may construct a journal. No caller-provided
 -- currency, account identity, current price or generic write RPC is exposed.
 insert into finance_private.journals(order_id,currency,economic_key,kind,evidence,reverses)
 values(p_order,b.currency,p_key,p_kind,jsonb_build_object('schemaVersion','TSE-FINANCE-1','providerAccount',b.provider_account,'paymentMode',b.payment_mode,
 'currency',b.currency,'purchaseHash',b.purchase_hash,'sourceHash',b.source_hash,'allocationPolicyVersion',b.snapshot#>>'{financial,policyVersion}',
 'refundPolicy',b.refund_policy)||p_evidence,p_reverses) returning id into j;
 for r in select key,value::text::bigint as amount from jsonb_each(p_lines) loop
  if r.amount<>0 then
   if r.key !~ '^(clearing|platform_revenue|refund_rounding|processor_fees|settled|dispute_receivable|chargeback_expense|tax_expense|tax_payable|payout_clearing|payable:[A-Za-z0-9_-]{1,100}|reserved:[A-Za-z0-9_-]{1,100})$' then raise exception 'Unknown financial account';end if;
   insert into finance_private.accounts values(p_order,b.currency,r.key) on conflict do nothing;
   insert into finance_private.lines values(j,p_order,b.currency,r.key,r.amount);
  end if;
 end loop;
 return j;
end $$;
create function finance_private.open_book(p_order uuid) returns void language plpgsql security definer set search_path='' as $$
declare c public.order_delivery_contracts;a licensing_private.acceptances;total numeric;f jsonb;r jsonb;parties text[]:='{}';begin
 if exists(select 1 from finance_private.books where order_id=p_order) then return;end if;
 select * into strict c from public.order_delivery_contracts where order_id=p_order;
 select * into strict a from licensing_private.acceptances where order_id=p_order;
 f:=a.snapshot->'financial';
 if c.payment_mode<>'test' or c.commercial_rights_granted or
  c.amount_minor is distinct from (a.snapshot->>'amountCents')::bigint or c.currency is distinct from a.snapshot->>'currency'
  or a.snapshot_hash<>licensing_private.hash_json(a.snapshot) or a.snapshot#>>'{sourceEvidence,hash}' is null
  or (select purchase_hash from commerce_private.contract_context where contract_id=c.id) is distinct from a.snapshot_hash
  or jsonb_typeof(f->'allocations') is distinct from 'array' or jsonb_array_length(f->'allocations') not between 1 and 50
  or length(coalesce(f->>'policyVersion',''))<2 or coalesce(f->>'platformFeeCents','') !~ '^[0-9]+$' then
  raise exception 'Complete immutable accepted financial evidence required';end if;
 total:=(f->>'platformFeeCents')::bigint;
 for r in select value from jsonb_array_elements(f->'allocations') loop
  if coalesce(r->>'partyId','') !~ '^[A-Za-z0-9_-]{1,100}$' or r->>'partyId'=any(parties)
   or coalesce(r->>'amountCents','') !~ '^[0-9]+$' or not exists(
    select 1 from jsonb_array_elements((a.snapshot#>'{rights,master}')||(a.snapshot#>'{rights,publishing}')) h where h#>>'{party,id}'=r->>'partyId'
    union all select 1 where a.snapshot#>>'{seller,id}'=r->>'partyId') then raise exception 'Invalid frozen legal payee allocation';end if;
  total:=total+(r->>'amountCents')::bigint;parties:=array_append(parties,r->>'partyId');
 end loop;
 if total<>c.amount_minor then raise exception 'Frozen fee and allocations do not conserve gross';end if;
 insert into finance_private.books(order_id,contract_id,provider_account,payment_mode,currency,gross,snapshot,purchase_hash,source_hash)
 select p_order,c.id,provider_account,'test',c.currency,c.amount_minor,a.snapshot,a.snapshot_hash,a.snapshot#>>'{sourceEvidence,hash}'
 from commerce_private.contract_context where contract_id=c.id;
end $$;
create function finance_private.reverse_economics(p_order uuid,p_key text,p_total bigint,p_cash_account text,p_evidence jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare b finance_private.books;r jsonb;lines jsonb:='{}';target bigint;prior bigint;component text;sum_delta bigint:=0;delta bigint;cash_delta bigint;j uuid;begin
 select * into strict b from finance_private.books where order_id=p_order;
 if p_total<0 or p_total>b.gross then raise exception 'Over-refund or unsupported economic reversal';end if;
 for r in select value from jsonb_array_elements(jsonb_build_array(jsonb_build_object('partyId',null,'amountCents',b.snapshot#>'{financial,platformFeeCents}'))||(b.snapshot#>'{financial,allocations}')) loop
  component:=case when r->>'partyId' is null then 'platform_revenue' else 'payable:'||(r->>'partyId') end;
  target:=floor((r->>'amountCents')::numeric*p_total/b.gross)::bigint;
  select coalesce(sum(l.signed_minor),0)::bigint into prior from finance_private.lines l join finance_private.journals j on j.id=l.journal_id
   where l.order_id=p_order and l.account=component and j.kind in ('refund','chargeback_loss');
  delta:=target-prior;lines:=lines||jsonb_build_object(component,delta);sum_delta:=sum_delta+delta;
 end loop;
 select coalesce(sum((j.evidence->>'economicDelta')::bigint),0)::bigint into prior from finance_private.journals j where j.order_id=p_order and j.kind in ('refund','chargeback_loss');
 cash_delta:=p_total-prior;
 if cash_delta=0 then return null;end if;
 target:=p_total-(select coalesce(sum(floor((x->>'amountCents')::numeric*p_total/b.gross)),0)::bigint from jsonb_array_elements(jsonb_build_array(jsonb_build_object('amountCents',b.snapshot#>'{financial,platformFeeCents}'))||(b.snapshot#>'{financial,allocations}')) x);
 delta:=target-finance_private.balance(p_order,'refund_rounding');
 lines:=lines||jsonb_build_object('refund_rounding',delta,p_cash_account,-cash_delta);
 j:=finance_private.post(p_order,p_key,case when p_cash_account='clearing' then 'refund' else 'chargeback_loss' end,p_evidence||jsonb_build_object('economicDelta',cash_delta,'cumulativeEconomicLoss',p_total),lines);
 return j;
end $$;
create function public.post_financial_order(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare b finance_private.books;e commerce_private.payment_events;paid boolean;refund bigint;lost bigint;accounted bigint;lines jsonb;r jsonb;n integer:=0;begin
 perform commerce_private.require_service_role();perform finance_private.assert_enabled();
 perform 1 from public.orders where id=p_order for update;if not found then raise exception 'Unknown order';end if;
 perform finance_private.open_book(p_order);select * into strict b from finance_private.books where order_id=p_order;
 paid:=exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state='PAID');
 if paid and not exists(select 1 from finance_private.journals where order_id=p_order and economic_key='purchase') then
  lines:=jsonb_build_object('clearing',b.gross,'platform_revenue',-(b.snapshot#>>'{financial,platformFeeCents}')::bigint);
  for r in select value from jsonb_array_elements(b.snapshot#>'{financial,allocations}') loop
   lines:=lines||jsonb_build_object('payable:'||(r->>'partyId'),-(r->>'amountCents')::bigint);end loop;
  select * into strict e from commerce_private.payment_events where contract_id=b.contract_id and payment_state='PAID' order by received_at,id limit 1;
  perform finance_private.post(p_order,'purchase','purchase',jsonb_build_object('paymentEvent',e.id,'providerEvent',e.provider_event_id,'evidenceHash',e.evidence_sha256,
  'paymentIntentId',e.payment_intent_id,'checkoutSessionId',e.checkout_session_id,'providerCreatedAt',e.provider_created_at,'receivedAt',e.received_at),lines);
 end if;
 select coalesce(max(refunded_minor),0) into refund from commerce_private.payment_events where contract_id=b.contract_id;
 select coalesce(sum(amount_minor),0) into lost from finance_private.simulation_facts where order_id=p_order and kind='chargeback_loss';
 if paid then
  perform finance_private.reverse_economics(p_order,'refund:'||refund,least(b.gross,refund+lost),'clearing',jsonb_build_object('cumulativeRefund',refund));
  select coalesce(-sum(l.signed_minor),0) into accounted from finance_private.lines l join finance_private.journals j on j.id=l.journal_id
   where l.order_id=p_order and l.account='clearing' and j.kind in ('refund','refund_overlap');
  -- A provider can debit both a refund and a chargeback. Never reverse a party
  -- twice; additional real cash loss belongs to an explicit recovery expense.
  if refund>accounted then perform finance_private.post(p_order,'refund-overlap:'||refund,'refund_overlap',jsonb_build_object('cumulativeRefund',refund),jsonb_build_object('chargeback_expense',refund-accounted,'clearing',accounted-refund));end if;
 end if;
 for e in select * from commerce_private.payment_events where contract_id=b.contract_id order by received_at,id loop
  if e.provider_account<>b.provider_account or e.payment_mode<>b.payment_mode or e.currency<>b.currency or e.amount_minor<>b.gross or e.livemode then raise exception 'Financial proof binding mismatch';end if;
  insert into finance_private.posted_events values(e.id,p_order,e.evidence_sha256,clock_timestamp()) on conflict do nothing;
  if found then n:=n+1;end if;
 end loop;
 return jsonb_build_object('orderId',p_order,'eventsAcknowledged',n,'paid',paid,'refundedMinor',refund,'syntheticOnly',true);
end $$;

-- Explicit local simulation facts supplement payment webhooks that do not contain
-- actual processor fees/settlements/dispute outcomes. Not a provider verifier.
-- Only canonical authenticated Admin; service-role impersonation is denied.
create function public.record_finance_simulation_fact(p_order uuid,p_external text,p_kind text,p_amount bigint,p_currency text,p_hash text,p_reason text,p_party text default null,p_related uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor uuid;b finance_private.books;old finance_private.simulation_facts;policy finance_private.simulation_policies;f uuid;lines jsonb;amount bigint;outstanding bigint;refund bigint;lost bigint;economic bigint;begin
 actor:=finance_private.require_admin();perform finance_private.assert_enabled();
 perform 1 from public.orders where id=p_order for update;select * into strict b from finance_private.books where order_id=p_order;
 select * into old from finance_private.simulation_facts where order_id=p_order and external_id=p_external;
 if found then
  if (old.kind,old.amount_minor,old.currency,old.evidence_hash,old.reason,old.party_id,old.related_fact) is distinct from (p_kind,p_amount,p_currency,p_hash,p_reason,p_party,p_related) then raise exception 'Conflicting duplicate financial evidence';end if;return old.id;
 end if;
 if p_currency<>b.currency or p_amount<=0 or not exists(select 1 from finance_private.journals where order_id=p_order and economic_key='purchase') then raise exception 'Paid same-currency financial book required';end if;
 -- Related evidence belongs to this exact order. Settlements/returns/reservations
 -- never create earnings or authorize rights. All payout operations are simulated.
 if p_related is not null and not exists(select 1 from finance_private.simulation_facts where id=p_related and order_id=p_order) then raise exception 'Cross-order financial reference denied';end if;
 case p_kind
 when 'processor_fee' then lines:=jsonb_build_object('processor_fees',p_amount,'clearing',-p_amount);
 when 'fee_return' then
  if p_amount>finance_private.balance(p_order,'processor_fees') then raise exception 'Excess fee return';end if;
  lines:=jsonb_build_object('clearing',p_amount,'processor_fees',-p_amount);
 when 'settlement' then
  if p_amount>finance_private.balance(p_order,'clearing') then raise exception 'Insufficient processor clearing';end if;
  lines:=jsonb_build_object('settled',p_amount,'clearing',-p_amount);
 when 'dispute_debit' then
  if not exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state='DISPUTED') then raise exception 'Verified dispute required';end if;
  if p_amount>b.gross then raise exception 'Excess dispute debit';end if;
  lines:=jsonb_build_object('dispute_receivable',p_amount,'clearing',-p_amount);
 when 'dispute_return' then
  if p_related is null or not exists(select 1 from finance_private.simulation_facts where id=p_related and kind='dispute_debit') then raise exception 'Original dispute debit required';end if;
  select amount_minor-coalesce((select sum(amount_minor) from finance_private.simulation_facts where related_fact=p_related and kind in ('dispute_return','chargeback_loss')),0) into outstanding from finance_private.simulation_facts where id=p_related;
  if p_amount>outstanding then raise exception 'Excess dispute outcome';end if;
  lines:=jsonb_build_object('clearing',p_amount,'dispute_receivable',-p_amount);
 when 'chargeback_loss' then
  if p_related is null or not exists(select 1 from finance_private.simulation_facts where id=p_related and kind='dispute_debit') then raise exception 'Original dispute debit required';end if;
  select amount_minor-coalesce((select sum(amount_minor) from finance_private.simulation_facts where related_fact=p_related and kind in ('dispute_return','chargeback_loss')),0) into outstanding from finance_private.simulation_facts where id=p_related;
  if p_amount>outstanding then raise exception 'Excess dispute outcome';end if;
 when 'tax_accrual' then lines:=jsonb_build_object('tax_expense',p_amount,'tax_payable',-p_amount);
 when 'tax_remittance' then
  if p_amount> -finance_private.balance(p_order,'tax_payable') then raise exception 'Excess tax remittance';end if;
  lines:=jsonb_build_object('tax_payable',p_amount,'clearing',-p_amount);
 when 'payout_reserve' then
  select * into policy from finance_private.simulation_policies where order_id=p_order;
  if not found or clock_timestamp()<policy.created_at+make_interval(secs=>(policy.policy->>'maturitySeconds')::int) then raise exception 'Explicit mature synthetic payout policy required';end if;
  select (value->>'amountCents')::bigint into amount from jsonb_array_elements(b.snapshot#>'{financial,allocations}') where value->>'partyId'=p_party;
  if amount is null or -finance_private.balance(p_order,'payable:'||p_party)-p_amount<ceil(amount::numeric*(policy.policy->>'reserveBps')::int/10000) then raise exception 'Synthetic reserve requirement not satisfied';end if;
  if p_party is null or p_party !~ '^[A-Za-z0-9_-]{1,100}$' or p_amount> -finance_private.balance(p_order,'payable:'||p_party)
   or not exists(select 1 from public.generated_licenses where order_id=p_order and status='generated')
   or exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state<>'PAID') then raise exception 'Held, unpaid or insufficient payout obligation';end if;
  -- Current rights/source/assent and all PK07/08 holds are still authoritative.
  perform licensing_private.assert_purchase(p_order,true);
  lines:=jsonb_build_object('payable:'||p_party,p_amount,'reserved:'||p_party,-p_amount);
 when 'payout_release','payout_settle' then
  if p_related is null or not exists(select 1 from finance_private.simulation_facts where id=p_related and kind='payout_reserve' and party_id=p_party) then raise exception 'Original party reservation required';end if;
  select amount_minor-coalesce((select sum(amount_minor) from finance_private.simulation_facts where related_fact=p_related and kind in ('payout_release','payout_settle')),0) into outstanding from finance_private.simulation_facts where id=p_related;
  if p_amount>outstanding then raise exception 'Payout reservation exhausted';end if;
  if p_kind='payout_settle' then
   if exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state<>'PAID') then raise exception 'Payment hold prevents payout settlement';end if;
   perform licensing_private.assert_purchase(p_order,true);
  end if;
  lines:=jsonb_build_object('reserved:'||p_party,p_amount,case when p_kind='payout_settle' then 'payout_clearing' else 'payable:'||p_party end,-p_amount);
 else raise exception 'Unsupported simulated financial fact';end case;
 insert into finance_private.simulation_facts(order_id,external_id,kind,amount_minor,currency,evidence_hash,reason,actor,party_id,related_fact)
 values(p_order,p_external,p_kind,p_amount,p_currency,p_hash,p_reason,actor,p_party,p_related) returning id into f;
 if p_kind='chargeback_loss' then
  select coalesce(max(refunded_minor),0) into refund from commerce_private.payment_events where contract_id=b.contract_id;
  select coalesce(sum(amount_minor),0) into lost from finance_private.simulation_facts where order_id=p_order and kind='chargeback_loss';
  economic:=least(b.gross,refund+lost);
  select coalesce(sum((evidence->>'economicDelta')::bigint),0) into amount from finance_private.journals where order_id=p_order and kind in ('refund','chargeback_loss');
  amount:=economic-amount;
  perform finance_private.reverse_economics(p_order,'loss:'||f,economic,'dispute_receivable',jsonb_build_object('simulationFact',f));
  if p_amount>amount then perform finance_private.post(p_order,'loss-overlap:'||f,'chargeback_overlap',jsonb_build_object('simulationFact',f),jsonb_build_object('chargeback_expense',p_amount-amount,'dispute_receivable',amount-p_amount));end if;
 else perform finance_private.post(p_order,'fact:'||f,p_kind,jsonb_build_object('simulationFact',f,'evidenceHash',p_hash),lines);end if;
 return f;
end $$;

create function finance_private.inspect_order(p_order uuid,p_provider jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b finance_private.books;issues jsonb:='[]';balances jsonb;v jsonb;expected jsonb;paid boolean;refund bigint;loss bigint;fee bigint;settled bigint;disputed bigint;tax_paid bigint;missing integer;begin
 select * into b from finance_private.books where order_id=p_order;
 if not found then return jsonb_build_object('matched',false,'issues',jsonb_build_array('missing_financial_book'));end if;
 paid:=exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state='PAID');
 select coalesce(max(refunded_minor),0) into refund from commerce_private.payment_events where contract_id=b.contract_id;
 select coalesce(sum(amount_minor) filter(where kind='chargeback_loss'),0),coalesce(sum(case when kind='dispute_debit' then amount_minor when kind='dispute_return' then -amount_minor else 0 end),0)
 into loss,disputed from finance_private.simulation_facts where order_id=p_order;
 select coalesce(sum(case when kind='processor_fee' then amount_minor when kind='fee_return' then -amount_minor else 0 end),0),
 coalesce(sum(amount_minor) filter(where kind='settlement'),0),coalesce(sum(amount_minor) filter(where kind='tax_remittance'),0)
 into fee,settled,tax_paid from finance_private.simulation_facts where order_id=p_order;
 if finance_private.balance(p_order,'clearing')<>(case when paid then b.gross-refund else 0 end)-disputed-fee-settled-tax_paid then issues:=issues||'"clearing_mismatch"'::jsonb;end if;
 if finance_private.balance(p_order,'processor_fees')<>fee then issues:=issues||'"processor_fee_mismatch"'::jsonb;end if;
 if finance_private.balance(p_order,'settled')<>settled then issues:=issues||'"settlement_mismatch"'::jsonb;end if;
 if finance_private.balance(p_order,'dispute_receivable')<>disputed-loss then issues:=issues||'"dispute_balance_mismatch"'::jsonb;end if;
 select coalesce(jsonb_object_agg(account,total::text),'{}') into balances from(select account,sum(signed_minor) total from finance_private.lines where order_id=p_order group by account) q;
 if b.purchase_hash is distinct from (select snapshot_hash from licensing_private.acceptances where order_id=p_order) then issues:=issues||'"purchase_hash_mismatch"'::jsonb;end if;
 select count(*) into missing from commerce_private.payment_events e where e.contract_id=b.contract_id and not exists(select 1 from finance_private.posted_events p where p.payment_event_id=e.id and p.evidence_hash=e.evidence_sha256);
 if missing>0 then issues:=issues||'"unposted_payment_events"'::jsonb;end if;
 if paid and not exists(select 1 from finance_private.journals where order_id=p_order and economic_key='purchase') then issues:=issues||'"missing_purchase_journal"'::jsonb;end if;
 if not paid and exists(select 1 from public.generated_licenses where order_id=p_order) then issues:=issues||'"unpaid_license"'::jsonb;end if;
 if paid and refund=0 and loss=0 and not exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state in ('DISPUTED','PAYMENT_FAILED'))
  and not exists(select 1 from public.generated_licenses where order_id=p_order) then issues:=issues||'"paid_license_pending"'::jsonb;end if;
 if exists(select 1 from public.generated_licenses where order_id=p_order and terms_snapshot_json->>'purchaseHash' is distinct from b.purchase_hash) then issues:=issues||'"license_purchase_mismatch"'::jsonb;end if;
 if exists(select 1 from public.order_asset_entitlements where order_id=p_order and state='active') and
  (not paid or refund>0 or exists(select 1 from commerce_private.payment_events where contract_id=b.contract_id and payment_state in ('DISPUTED','PAYMENT_FAILED'))) then issues:=issues||'"active_entitlement_under_payment_hold"'::jsonb;end if;
 if finance_private.balance(p_order,'dispute_receivable')>0 then issues:=issues||'"dispute_outcome_pending"'::jsonb;end if;
 if exists(select 1 from finance_private.lines where order_id=p_order and account like 'payable:%' group by account having sum(signed_minor)>0) then issues:=issues||'"party_recovery_required"'::jsonb;end if;
 -- Check each frozen recipient separately; offsetting errors cannot cancel out.
 for v in select value from jsonb_array_elements(jsonb_build_array(jsonb_build_object('partyId',null,'amountCents',b.snapshot#>'{financial,platformFeeCents}'))||(b.snapshot#>'{financial,allocations}')) loop
  if v->>'partyId' is null then
   if finance_private.balance(p_order,'platform_revenue')<>(case when paid then -(v->>'amountCents')::bigint+floor((v->>'amountCents')::numeric*least(b.gross,refund+loss)/b.gross)::bigint else 0 end) then issues:=issues||'"revenue_allocation_mismatch"'::jsonb;end if;
  else
   if finance_private.balance(p_order,'payable:'||(v->>'partyId'))+finance_private.balance(p_order,'reserved:'||(v->>'partyId'))<>
    (case when paid then -(v->>'amountCents')::bigint+floor((v->>'amountCents')::numeric*least(b.gross,refund+loss)/b.gross)::bigint else 0 end)+
    coalesce((select sum(amount_minor) from finance_private.simulation_facts where order_id=p_order and kind='payout_settle' and party_id=v->>'partyId'),0) then issues:=issues||jsonb_build_array('payee_allocation_mismatch:'||(v->>'partyId'));end if;
  end if;
 end loop;
 expected:=jsonb_build_object('providerAccount',b.provider_account,'paymentMode','test','currency',b.currency,'grossMinor',case when paid then b.gross else 0 end,
 'refundedMinor',refund,'processorFeeMinor',fee,'settledMinor',settled,'disputeNetDebitedMinor',disputed);
 if p_provider='{}'::jsonb then issues:=issues||'"provider_statement_not_supplied"'::jsonb;
 else
  for v in select jsonb_build_object('key',key,'value',value) from jsonb_each(expected) loop
   if p_provider->(v->>'key') is distinct from v->'value' then issues:=issues||jsonb_build_array('provider_mismatch:'||(v->>'key'));end if;end loop;
 end if;
 return jsonb_build_object('orderId',p_order,'currency',b.currency,'providerAccount',b.provider_account,'paymentMode','test','purchaseHash',b.purchase_hash,'sourceHash',b.source_hash,
  'grossMinor',(case when paid then b.gross else 0 end)::text,'refundedMinor',refund::text,'platformRevenueMinor',(-finance_private.balance(p_order,'platform_revenue'))::text,
  'balances',balances,'expectedProvider',expected,'issues',issues,'matched',jsonb_array_length(issues)=0,'syntheticOnly',true,'withdrawableMinor','0');
end $$;
create function public.reconcile_financial_order(p_order uuid,p_provider jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;result jsonb;rid uuid;begin
 actor:=finance_private.require_admin();perform 1 from public.orders where id=p_order for update;
 if octet_length(p_provider::text)>20000 or jsonb_typeof(p_provider) is distinct from 'object' then raise exception 'Bounded provider evidence required';end if;
 result:=finance_private.inspect_order(p_order,p_provider);
 insert into finance_private.reconciliations(order_id,provider_projection,result,actor) values(p_order,p_provider,result,actor) returning id into rid;
 return result||jsonb_build_object('reconciliationId',rid);
end $$;
create function public.record_finance_case_action(p_case uuid,p_request uuid,p_action text,p_reason text,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;old finance_private.case_actions;result uuid;begin
 actor:=finance_private.require_admin();select * into old from finance_private.case_actions where request_id=p_request;
 if found then
  if (old.reconciliation_id,old.actor,old.action,old.reason,old.evidence_reference) is distinct from (p_case,actor,p_action,p_reason,p_reference) then raise exception 'Conflicting operator request';end if;return old.id;end if;
 insert into finance_private.case_actions(reconciliation_id,actor,request_id,action,reason,evidence_reference) values(p_case,actor,p_request,p_action,p_reason,p_reference) returning id into result;return result;
end $$;
-- Correction is a reviewed restatement of original evidence, never a balance
-- setter. Arbitrary commercial reallocations need a new approved contract/model.
create function public.propose_finance_restatement(p_journal uuid,p_request uuid,p_reason text,p_reference text) returns uuid language plpgsql security definer set search_path='' as $$
declare actor uuid;old finance_private.corrections;result uuid;begin
 actor:=finance_private.require_admin();perform finance_private.assert_enabled();
 select * into old from finance_private.corrections where request_id=p_request;
 if found then
  if (old.original_journal,old.proposed_by,old.reason,old.evidence_reference) is distinct from(p_journal,actor,p_reason,p_reference) then raise exception 'Conflicting correction request';end if;return old.id;end if;
 if not exists(select 1 from finance_private.journals where id=p_journal and kind not in ('correction_reverse','correction_replacement')) then raise exception 'Original economic journal required';end if;
 insert into finance_private.corrections(original_journal,request_id,proposed_by,reason,evidence_reference) values(p_journal,p_request,actor,p_reason,p_reference) returning id into result;return result;
end $$;
create function public.approve_finance_restatement(p_correction uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid;c finance_private.corrections;j finance_private.journals;reverse_id uuid;replacement uuid;lines jsonb;begin
 actor:=finance_private.require_admin();perform finance_private.assert_enabled();
 select * into strict c from finance_private.corrections where id=p_correction;
 if c.proposed_by=actor or not exists(select 1 from public.user_profiles where id=c.proposed_by and role='admin') then raise exception 'Independent current Admin approval required';end if;
 select * into strict j from finance_private.journals where id=c.original_journal;
 perform 1 from public.orders where id=j.order_id for update;
 if exists(select 1 from finance_private.correction_approvals where correction_id=c.id) then return jsonb_build_object('correctionId',c.id,'alreadyApproved',true);end if;
 select jsonb_object_agg(account,-signed_minor) into lines from finance_private.lines where journal_id=j.id;
 reverse_id:=finance_private.post(j.order_id,'correction:'||c.id||':reverse','correction_reverse',jsonb_build_object('correctionId',c.id,'originalEvidence',j.evidence),lines,j.id);
 select jsonb_object_agg(account,signed_minor) into lines from finance_private.lines where journal_id=j.id;
 replacement:=finance_private.post(j.order_id,'correction:'||c.id||':replacement','correction_replacement',jsonb_build_object('correctionId',c.id,'originalJournal',j.id,'originalEvidence',j.evidence),lines);
 insert into finance_private.correction_approvals values(c.id,actor,reverse_id,replacement,clock_timestamp());
 return jsonb_build_object('correctionId',c.id,'reversingJournal',reverse_id,'replacementJournal',replacement);
end $$;
create function public.read_financial_order(p_order uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;projection jsonb;begin
 perform finance_private.require_admin();
 select provider_projection into projection from finance_private.reconciliations where order_id=p_order order by created_at desc,id desc limit 1;
 result:=finance_private.inspect_order(p_order,coalesce(projection,'{}'));
 return result||jsonb_build_object('journals',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'occurredAt',created_at,'economicKey',economic_key)) from finance_private.journals where order_id=p_order),'[]'),
 'openPayoutOperations',false,'financialOperationsEnabled',false,'latestReconciliation',(select id from finance_private.reconciliations where order_id=p_order order by created_at desc,id desc limit 1));
end $$;
create function public.read_financial_summary() returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform finance_private.require_admin();
 select coalesce(jsonb_agg(row_to_json(r)),'[]') into result from (
  select b.provider_account,b.payment_mode,b.currency,count(*) as orders,
  sum(case when exists(select 1 from finance_private.journals where order_id=b.order_id and economic_key='purchase') then b.gross else 0 end)::text as gross_minor,
  sum(-finance_private.balance(b.order_id,'platform_revenue'))::text as platform_revenue_minor,
  sum(coalesce((select max(refunded_minor) from commerce_private.payment_events where contract_id=b.contract_id),0))::text as refunded_minor,
  sum(finance_private.balance(b.order_id,'dispute_receivable'))::text as pending_dispute_minor,
  sum(coalesce((select sum(greatest(-q.total,0)) from(select account,sum(signed_minor) total from finance_private.lines where order_id=b.order_id and (account like 'payable:%' or account like 'reserved:%' or account='payout_clearing') group by account) q),0))::text as outstanding_obligations_minor,
  sum(coalesce((select sum(greatest(q.total,0)) from(select account,sum(signed_minor) total from finance_private.lines where order_id=b.order_id and account like 'payable:%' group by account) q),0))::text as party_recovery_minor,
  sum(case when (public.read_financial_order(b.order_id)->>'matched')::boolean then 0 else 1 end) as unreconciled_orders
  from finance_private.books b group by b.provider_account,b.payment_mode,b.currency
 ) r;
 return jsonb_build_object('partitions',result,'syntheticOnly',true,'withdrawableMinor','0','operationsEnabled',false,
 'unbookedOrders',(select count(*) from public.order_delivery_contracts c where not exists(select 1 from finance_private.books where order_id=c.order_id)));
end $$;
-- Default execute grants must never expose internal accounting primitives.
revoke all on all functions in schema finance_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema finance_private from public,anon,authenticated,service_role;
revoke all on function public.post_financial_order(uuid) from public,anon,authenticated;
grant execute on function public.post_financial_order(uuid) to service_role;
do $$ declare f record;begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('freeze_finance_simulation_policy','record_finance_simulation_fact','reconcile_financial_order','record_finance_case_action','propose_finance_restatement','approve_finance_restatement','read_financial_order','read_financial_summary') loop
  execute format('revoke all on function %s from public,anon,service_role',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
commit;
