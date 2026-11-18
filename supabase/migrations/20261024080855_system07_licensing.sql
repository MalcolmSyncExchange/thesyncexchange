-- System 07: reviewed scope/pricing contracts and append-only contractual lifecycle.
-- No commercial configuration, capability activation or hosted operation is seeded.
begin;
-- A provider-valid JWT may outlive session revocation. Assent and private legal
-- reads require the session to remain present, not only a canonical role.
create or replace function licensing_private.buyer() returns uuid language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or not exists(select 1 from public.user_profiles where id=auth.uid() and role='buyer')
 then raise exception 'Authenticated active canonical buyer required' using errcode='42501';end if;return auth.uid();end$$;
create function licensing_private.check_contract(c jsonb,r jsonb,f jsonb,exclusive boolean) returns void
language plpgsql set search_path='' as $$declare k text;v jsonb;begin
 if c is null then return;end if;
 if jsonb_typeof(c) is distinct from 'object' or octet_length(c::text)>30000
 or c-array['version','category','media','distribution','audience','campaign','restrictions','maxDurationDays','exclusive','renewal','termination','approval','pricing']<>'{}'::jsonb
 then raise exception 'Bounded explicit licensing contract required' using errcode='22023';end if;
 foreach k in array array['version','category','audience','campaign','renewal','termination'] loop
  if jsonb_typeof(c->k) is distinct from 'string' or length(btrim(c->>k)) not between 2 and 2000 then raise exception 'Complete licensing scope required' using errcode='22023';end if;
 end loop;
 foreach k in array array['media','distribution','restrictions'] loop
  if jsonb_typeof(c->k) is distinct from 'array' or jsonb_array_length(c->k)>50 or (k<>'restrictions' and jsonb_array_length(c->k)=0)
  or exists(select 1 from jsonb_array_elements(c->k) element where jsonb_typeof(element)<>'string' or length(btrim(element#>>'{}')) not between 1 and 1000)
  then raise exception 'Explicit media distribution and restrictions required' using errcode='22023';end if;
 end loop;
 if c->'exclusive' is distinct from to_jsonb(exclusive) or coalesce(c->>'maxDurationDays','')!~'^[0-9]{1,5}$' or (c->>'maxDurationDays')::int not between 1 and 36500
 or jsonb_typeof(c->'approval') is distinct from 'object' or (c->'approval')-array['mode','reference']<>'{}'::jsonb
 or coalesce(c#>>'{approval,mode}','') not in ('synthetic','approved') or length(coalesce(c#>>'{approval,reference}','')) not between 5 and 500
 or (c#>>'{approval,mode}'='synthetic' and c#>>'{approval,reference}' not like 'SYNTHETIC%')
 or (c#>>'{approval,mode}'='approved' and upper(c#>>'{approval,reference}') like 'SYNTHETIC%')
 then raise exception 'Explicit duration exclusivity and approval required' using errcode='22023';end if;
 v:=c->'pricing';
 if jsonb_typeof(v) is distinct from 'object' or v-array['version','currency','sellerTier','basePriceCents','commissionBps','rules']<>'{}'::jsonb
 or jsonb_typeof(v->'version') is distinct from 'string' or jsonb_typeof(v->'sellerTier') is distinct from 'string' or jsonb_typeof(v->'basePriceCents') is distinct from 'number'
 or length(coalesce(v->>'version','')) not between 2 and 100 or length(coalesce(v->>'sellerTier','')) not between 2 and 100
 or v->>'currency' is distinct from 'USD' -- Existing payment/ledger rails support USD; do not silently activate another currency.
 or coalesce(v->>'basePriceCents','')!~'^[0-9]{1,9}$' or (v->>'basePriceCents')::bigint not between 1 and 999999999
 or v->'commissionBps' is distinct from f->'commissionBps' or jsonb_typeof(v->'rules') is distinct from 'array' or jsonb_array_length(v->'rules') not between 1 and 200
 then raise exception 'Approved USD pricing policy required' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(v->'rules') x group by x->>'use',x->>'territory' having count(*)>1)
 or exists(select 1 from jsonb_array_elements(v->'rules') x group by x->>'id' having count(*)>1) then raise exception 'Ambiguous pricing rules' using errcode='22023';end if;
 for v in select value from jsonb_array_elements(c#>'{pricing,rules}') loop
  if jsonb_typeof(v) is distinct from 'object' or v-array['id','use','territory','amountCents','discountCents','approvalReference']<>'{}'::jsonb
  or exists(select 1 from unnest(array['id','use','territory','approvalReference']) field where jsonb_typeof(v->field) is distinct from 'string')
  or jsonb_typeof(v->'amountCents') is distinct from 'number' or jsonb_typeof(v->'discountCents') is distinct from 'number'
  or length(coalesce(v->>'id','')) not between 2 and 100 or length(coalesce(v->>'approvalReference','')) not between 5 and 500
  or not coalesce((r#>'{scope,uses}')?(v->>'use'),false) or coalesce((r#>'{scope,excludedUses}')?(v->>'use'),true)
  or not coalesce((r#>'{scope,territories}')?(v->>'territory'),false)
  or coalesce(v->>'amountCents','')!~'^[0-9]{1,9}$' or coalesce(v->>'discountCents','')!~'^[0-9]{1,9}$'
  or (v->>'amountCents')::bigint not between 1 and 999999999 or (v->>'discountCents')::bigint>=(v->>'amountCents')::bigint
  or (c#>>'{approval,mode}'='approved' and upper(v->>'approvalReference') like 'SYNTHETIC%')
  then raise exception 'Approved exact usage pricing rule required' using errcode='22023';end if;
 end loop;
end$$;
create function licensing_private.guard_contract_offer() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform licensing_private.check_contract(new.terms->'licenseContract',new.rights,new.financial,new.license_exclusive);return new;end$$;
create trigger system07_contract_offer before insert on licensing_private.offers for each row execute function licensing_private.guard_contract_offer();
create function licensing_private.freeze_contract_quote() returns trigger language plpgsql security definer set search_path='' as $$
declare o licensing_private.offers;c jsonb;v jsonb;price bigint;fee bigint;net bigint;allocated bigint:=0;amount bigint;i int:=0;allocations jsonb:='[]';h jsonb;begin
 select * into strict o from licensing_private.offers where id=new.offer_id;c:=o.terms->'licenseContract';
 if c is null then return new;end if;
 perform licensing_private.check_contract(c,o.rights,o.financial,o.license_exclusive);
 if (new.schedule#>>'{usage,endsAt}')::timestamptz-(new.schedule#>>'{usage,startsAt}')::timestamptz>make_interval(days=>(c->>'maxDurationDays')::int)
 then raise exception 'Requested duration exceeds reviewed license contract' using errcode='22023';end if;
 select value into strict v from jsonb_array_elements(c#>'{pricing,rules}') where value->>'use'=new.schedule#>>'{usage,use}' and value->>'territory'=new.schedule#>>'{usage,territory}';
 price:=(v->>'amountCents')::bigint-(v->>'discountCents')::bigint;
 fee:=(price*(o.financial->>'commissionBps')::int+5000)/10000;net:=price-fee;
 for h in select value from jsonb_array_elements(o.financial->'allocations') loop
  i:=i+1;amount:=case when i=jsonb_array_length(o.financial->'allocations') then net-allocated else net*(h->>'bps')::int/10000 end;
  allocations:=allocations||jsonb_build_array(h||jsonb_build_object('amountCents',amount));allocated:=allocated+amount;
 end loop;
 new.schedule:=new.schedule||jsonb_build_object('licenseContract',c,'pricingEvidence',jsonb_build_object('contractHash',licensing_private.hash_json(c),'policy',c->'pricing','rule',v,
 'inputs',jsonb_build_object('category',c->>'category','usage',new.schedule->'usage','media',c->'media','distribution',c->'distribution','audience',c->>'audience','campaign',c->>'campaign','restrictions',c->'restrictions','sellerTier',c#>>'{pricing,sellerTier}'),
 'rounding','Platform fee: half-up to minor unit; allocations: floor in declared order, final payee receives remainder.','amountCents',price,'currency',c#>>'{pricing,currency}'),
 'amountCents',price,'currency',c#>>'{pricing,currency}','financial',o.financial||jsonb_build_object('platformFeeCents',fee,'allocations',allocations));
 new.schedule_hash:=licensing_private.hash_json(new.schedule);return new;
end$$;
-- Last insert trigger; hashes the complete source/catalog/terms/pricing receipt.
create trigger zzzz_system07_contract_quote before insert on licensing_private.quotes for each row execute function licensing_private.freeze_contract_quote();

-- Catalog prices are indicative minima for the exact configured scope. The
-- transaction-specific quote remains authoritative; no client price is trusted.
create function catalog_private.license_display_price(p_track uuid,p_license uuid,p_legacy integer) returns integer language sql stable security definer set search_path='' as $$
 select coalesce((select min((rule->>'amountCents')::int-(rule->>'discountCents')::int) from licensing_private.offer_heads h join licensing_private.offers o on o.id=h.offer_id cross join lateral jsonb_array_elements(o.terms#>'{licenseContract,pricing,rules}') rule where h.track_id=p_track and h.license_type_id=p_license),p_legacy)
$$;
do $$declare definition text;needle text;begin
 select pg_get_functiondef('catalog_private.marketplace_track(uuid)'::regprocedure) into definition;
 needle:=$old$'noncommercialTest',o.terms->>'approvalReference' like 'SYNTHETIC%'$old$;
 if position(needle in definition)=0 then raise exception 'System06 marketplace projection drift';end if;
 definition:=replace(definition,needle,$new$'noncommercialTest',o.terms->>'approvalReference' like 'SYNTHETIC%' or o.terms#>>'{licenseContract,approval,mode}'='synthetic','contract',case when o.terms->'licenseContract' is not null then (o.terms->'licenseContract')-'pricing'-'approval' else null end$new$);
 definition:=replace(definition,'coalesce(x.price_cents,l.default_price_cents)','catalog_private.license_display_price(t.id,l.id,coalesce(x.price_cents,l.default_price_cents))');
 definition:=replace(definition,'x.price_cents/100.0','catalog_private.license_display_price(t.id,l.id,coalesce(x.price_cents,l.default_price_cents))/100.0');execute definition;
 select pg_get_functiondef('public.catalog_search(jsonb,integer,integer,text)'::regprocedure) into definition;
 if position('coalesce(o.price_cents,l.default_price_cents)' in definition)=0 then raise exception 'System06 catalog pricing drift';end if;
 execute replace(definition,'coalesce(o.price_cents,l.default_price_cents)','catalog_private.license_display_price(o.track_id,l.id,coalesce(o.price_cents,l.default_price_cents))');
end$$;
revoke all on function catalog_private.license_display_price(uuid,uuid,integer) from public,anon,authenticated,service_role;
create table licensing_private.lifecycle_events(
 id bigint generated always as identity primary key,order_id uuid not null references public.orders(id) on delete restrict,
 request_id uuid not null unique,revision bigint not null,actor_id uuid not null references public.user_profiles(id),
 action text not null check(action in ('annotate','terminate','revoke')),reason text not null check(length(reason) between 5 and 2000),
 authority_reference text not null check(length(authority_reference) between 5 and 500),created_at timestamptz not null default clock_timestamp(),unique(order_id,revision)
);
create index lifecycle_order_history on licensing_private.lifecycle_events(order_id,id desc);
alter table licensing_private.lifecycle_events enable row level security;
alter table licensing_private.lifecycle_events force row level security;
create policy trusted_owner on licensing_private.lifecycle_events to postgres using(true) with check(true);
create trigger immutable_lifecycle before update or delete on licensing_private.lifecycle_events for each row execute function licensing_private.immutable();
create function licensing_private.contract_closed(p_order uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from licensing_private.lifecycle_events where order_id=p_order and action in('terminate','revoke'))
$$;
-- Preserve every existing source/catalog/rights/payment fence, including its OID.
do $$declare definition text;begin
 select pg_get_functiondef('licensing_private.assert_purchase(uuid,boolean)'::regprocedure) into definition;
 execute replace(definition,'licensing_private.assert_purchase(','licensing_private.assert_purchase_before_system07(');
end$$;
create or replace function licensing_private.assert_purchase(p_order uuid,p_paid boolean) returns licensing_private.acceptances language plpgsql security definer set search_path='' as $$declare a licensing_private.acceptances;begin
 if licensing_private.contract_closed(p_order) then raise exception 'License is contractually closed' using errcode='42501';end if;
 a:=licensing_private.assert_purchase_before_system07(p_order,p_paid);return a;end$$;
create function licensing_private.guard_synthetic_license() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.status='generated' and (new.terms_snapshot_json#>>'{purchase,licenseContract,approval,mode}'='synthetic' or upper(new.terms_snapshot_json#>>'{purchase,terms,approvalReference}') like 'SYNTHETIC%')
 and (new.terms_snapshot_json#>>'{payment,paymentMode}' is distinct from 'test' or new.terms_snapshot_json#>'{payment,commercialRightsGranted}' is distinct from 'false'::jsonb)
 then raise exception 'Synthetic terms cannot grant commercial rights' using errcode='42501';end if;return new;end$$;
create trigger system07_synthetic_license before insert or update on public.generated_licenses for each row execute function licensing_private.guard_synthetic_license();
create function licensing_private.lifecycle(p_order uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders;a licensing_private.acceptances;g public.generated_licenses;state text;closed text;payment text;adverse text;begin
 select * into strict o from public.orders where id=p_order;select * into a from licensing_private.acceptances where order_id=p_order;select * into g from public.generated_licenses where order_id=p_order;
 select action into closed from licensing_private.lifecycle_events where order_id=p_order and action in('terminate','revoke') order by id desc limit 1;
 state:=case when closed='terminate' then 'terminated' when closed='revoke' then 'revoked' when g.status='generated' and (a.snapshot#>>'{usage,endsAt}')::timestamptz<=statement_timestamp() then 'expired'
 when g.status='generated' and (a.snapshot#>>'{usage,startsAt}')::timestamptz>statement_timestamp() then 'issued' when g.status='generated' then 'active' else 'pending' end;
 select s.state into payment from commerce_private.order_states s join public.order_delivery_contracts c on c.id=s.contract_id where c.order_id=p_order;
 select v into adverse from (
 select evidence->>'paymentState' v from checkout_recovery.verified_events where order_id=p_order
 union all select evidence->>'paymentState' from checkout_recovery.adverse_inbox where payment_intent_id=o.stripe_payment_intent_id
 union all select payment
 ) events where v in('REFUNDED','DISPUTED','PARTIALLY_REFUNDED','PAYMENT_FAILED','SECURITY_HOLD')
 order by case v when 'REFUNDED' then 0 when 'DISPUTED' then 1 when 'PARTIALLY_REFUNDED' then 2 when 'PAYMENT_FAILED' then 3 else 4 end limit 1;
 return jsonb_build_object('contractualState',state,'paymentState',coalesce(adverse,payment,upper(o.status::text)),'paymentHold',o.checkout_hold,'issuanceState',case when g.status='generated' then 'issued' when g.status='failed' or o.agreement_generation_error is not null then 'failed' else 'pending' end,
 'revision',(select count(*) from licensing_private.lifecycle_events where order_id=p_order),'testOnly',coalesce(g.terms_snapshot_json#>>'{payment,paymentMode}'='test',a.snapshot#>>'{terms,approvalReference}' like 'SYNTHETIC%',false),
 'rightsMeaning','Payment status and delivery holds do not independently determine contractual termination. Historical agreements remain retained.');
end$$;
create function public.license_lifecycle_command(p_order uuid,p_revision bigint,p_request uuid,p_action text,p_reason text,p_reference text) returns jsonb
language plpgsql security definer set search_path='' as $$declare e licensing_private.lifecycle_events;n bigint;begin
 if not public.is_admin() then raise exception 'Canonical MFA Admin required' using errcode='42501';end if;
 if p_action is null or p_action not in('annotate','terminate','revoke') or p_request is null or length(btrim(coalesce(p_reason,''))) not between 5 and 2000 or length(btrim(coalesce(p_reference,''))) not between 5 and 500
 then raise exception 'Explicit action reason and authority reference required' using errcode='22023';end if;
 perform 1 from public.orders where id=p_order for update;if not found then raise exception 'License record unavailable' using errcode='42501';end if;
 select * into e from licensing_private.lifecycle_events where request_id=p_request;
 if found then
  if (e.order_id,e.actor_id,e.action,e.reason,e.authority_reference,e.revision) is distinct from (p_order,auth.uid(),p_action,p_reason,p_reference,p_revision+1) then raise exception 'Conflicting lifecycle request' using errcode='40001';end if;
  return licensing_private.lifecycle(p_order);
 end if;
 select count(*) into n from licensing_private.lifecycle_events where order_id=p_order;if p_revision is distinct from n then raise exception 'Stale lifecycle revision' using errcode='40001';end if;
 if p_action<>'annotate' and (not exists(select 1 from public.generated_licenses where order_id=p_order and status='generated') or licensing_private.contract_closed(p_order)) then raise exception 'Issued open license required' using errcode='22023';end if;
 insert into licensing_private.lifecycle_events(order_id,request_id,revision,actor_id,action,reason,authority_reference) values(p_order,p_request,n+1,auth.uid(),p_action,p_reason,p_reference);
 insert into public.order_activity_log(order_id,actor_id,source,event_type,message,metadata) values(p_order,auth.uid(),'admin','license_'||p_action,'Audited contractual lifecycle action; original agreement retained.',jsonb_build_object('requestId',p_request,'revision',n+1,'authorityReference',p_reference));
 return licensing_private.lifecycle(p_order);
end$$;
create function licensing_private.record_actor() returns text language plpgsql stable security definer set search_path='' as $$declare r text;begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() then raise exception 'Active account required' using errcode='42501';end if;
 select role::text into r from public.user_profiles where id=auth.uid();if r is null or r not in('buyer','artist','admin') or (r='admin' and not public.is_admin()) then raise exception 'Canonical account required' using errcode='42501';end if;return r;
end$$;
create function licensing_private.record_visible(p_order uuid,r text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o left join licensing_private.acceptances a on a.order_id=o.id join public.tracks t on t.id=o.track_id where o.id=p_order and
 (r='admin' or (r='buyer' and o.buyer_user_id=auth.uid()) or (r='artist' and t.artist_user_id=auth.uid() and a.snapshot#>>'{seller,userId}'=auth.uid()::text)))
$$;
create function public.license_records(p_page integer default 1,p_size integer default 20) returns jsonb language plpgsql stable security definer set search_path='' as $$declare r text;result jsonb;n bigint;begin
 r:=licensing_private.record_actor();if p_page is null or p_page not between 1 and 10000 or p_size is null or p_size not between 1 and 50 then raise exception 'Bounded page required' using errcode='22023';end if;
 select count(*) into n from public.orders o where licensing_private.record_visible(o.id,r);
 select coalesce(jsonb_agg(x),'[]') into result from (select o.id as "orderId",a.snapshot#>>'{track,title}' as title,coalesce(a.snapshot#>>'{license,name}','License') as "licenseName",a.snapshot#>>'{usage,use}' as "use",a.snapshot#>>'{usage,territory}' as territory,
 a.snapshot#>>'{usage,startsAt}' as "startsAt",a.snapshot#>>'{usage,endsAt}' as "endsAt",o.amount_cents as "amountCents",o.currency,o.created_at as "createdAt",g.agreement_number as "agreementNumber",a.snapshot#>>'{terms,version}' as "termsVersion",licensing_private.lifecycle(o.id) as lifecycle
 from public.orders o left join licensing_private.acceptances a on a.order_id=o.id left join public.generated_licenses g on g.order_id=o.id where licensing_private.record_visible(o.id,r) order by o.created_at desc,o.id desc limit p_size offset (p_page-1)*p_size)x;
 return jsonb_build_object('items',result,'total',n,'page',p_page,'size',p_size,'role',r);
end$$;
create function public.license_record(p_order uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare r text;a licensing_private.acceptances;g public.generated_licenses;begin
 r:=licensing_private.record_actor();if r='artist' or not licensing_private.record_visible(p_order,r) then raise exception 'License record unavailable' using errcode='42501';end if;
 select * into a from licensing_private.acceptances where order_id=p_order;select * into g from public.generated_licenses where order_id=p_order;
 return jsonb_build_object('orderId',p_order,'purchase',a.snapshot,'purchaseHash',a.snapshot_hash,'acceptedAt',a.accepted_at,'agreementNumber',g.agreement_number,'generatedAt',g.generated_at,'lifecycle',licensing_private.lifecycle(p_order),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'createdAt',e.created_at,'revision',e.revision)||case when r='admin' then jsonb_build_object('reason',e.reason,'reference',e.authority_reference) else '{}'::jsonb end order by e.id) from licensing_private.lifecycle_events e where e.order_id=p_order),'[]'::jsonb),
 'issuanceFailure',case when r='admin' then (select agreement_generation_error from public.orders where id=p_order) else null end,
 'sourceChain',case when r='admin' then public.read_order_source_chain(p_order) else null end);
end$$;
-- Same OID remains used by every ticket/broker path. Closed contracts deny asset delivery.
do $$declare definition text;begin
 select pg_get_functiondef('commerce_private.broker_can_deliver(uuid,uuid)'::regprocedure) into definition;
 execute replace(definition,'commerce_private.broker_can_deliver(','commerce_private.broker_can_deliver_before_system07(');
end$$;
create or replace function commerce_private.broker_can_deliver(p_entitlement uuid,p_buyer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select commerce_private.broker_can_deliver_before_system07(p_entitlement,p_buyer) and not exists(select 1 from public.order_asset_entitlements n where n.id=p_entitlement and licensing_private.contract_closed(n.order_id))
$$;
-- The old delivery contract compared a newly accepted rule price with today's
-- base price and copied legacy combined rights. For accepted purchases, the
-- original verified receipt is authoritative; legacy fixtures keep their fence.
do $$declare definition text;needle text;begin
 select pg_get_functiondef('commerce_private.freeze_contract(uuid,text,text)'::regprocedure) into definition;
 needle:='declare o public.orders;';if position(needle in definition)=0 then raise exception 'Commerce contract declaration drift';end if;
 definition:=replace(definition,needle,'declare a licensing_private.acceptances; o public.orders;');
 needle:=$old$ if t.status <> 'approved' or not l.active$old$;
 if position(needle in definition)=0 then raise exception 'Commerce contract price fence drift';end if;
 definition:=replace(definition,needle,$new$ if exists(select 1 from licensing_private.acceptances where order_id=o.id) then
  a:=licensing_private.assert_purchase(o.id,false);price:=(a.snapshot->>'amountCents')::int;
 end if;
 if t.status <> 'approved' or not l.active$new$);
 needle:=$old$ if rights is null or (select sum(ownership_percent) from public.rights_holders where track_id=t.id) <> 100 then raise exception 'Rights snapshot incomplete'; end if;$old$;
 if position(needle in definition)=0 then raise exception 'Commerce contract rights fence drift';end if;
 definition:=replace(definition,needle,$new$ if a.order_id is not null then
  select jsonb_agg(value||jsonb_build_object('pool',pool)) into rights from (
   select value,'master'::text pool from jsonb_array_elements(a.snapshot#>'{rights,master}')
   union all select value,'publishing'::text from jsonb_array_elements(a.snapshot#>'{rights,publishing}')
  ) accepted_holders;
 elsif rights is null or (select sum(ownership_percent) from public.rights_holders where track_id=t.id) <> 100 then raise exception 'Rights snapshot incomplete';end if;$new$);
 definition:=replace(definition,'t.title,l.name,o.amount_cents','coalesce(a.snapshot#>>''{track,title}'',t.title),coalesce(a.snapshot#>>''{license,name}'',l.name),o.amount_cents');
 definition:=replace(definition,'rights,to_jsonb(l)','rights,coalesce(a.snapshot->''license'',to_jsonb(l))');execute definition;
end$$;
-- SEC can version an existing reviewed offer. Source/deliverable/catalog review is
-- deliberately NOT copied: the new offer remains unavailable until explicitly reviewed.
create function public.license_offer_contract(p_track uuid,p_license uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare o licensing_private.offers;begin
 if not public.is_admin() then raise exception 'Canonical MFA Admin required' using errcode='42501';end if;
 select v.* into strict o from licensing_private.offer_heads h join licensing_private.offers v on v.id=h.offer_id where h.track_id=p_track and h.license_type_id=p_license;
 return jsonb_build_object('offerId',o.id,'contract',o.terms->'licenseContract','uses',o.rights#>'{scope,uses}','territories',o.rights#>'{scope,territories}','commissionBps',o.financial->'commissionBps','exclusive',o.license_exclusive);
end$$;
create function public.license_configure_contract(p_track uuid,p_license uuid,p_expected uuid,p_contract jsonb,p_reference text) returns jsonb language plpgsql security definer set search_path='' as $$declare o licensing_private.offers;newid uuid;begin
 if not public.is_admin() then raise exception 'Canonical MFA Admin required' using errcode='42501';end if;
 if length(btrim(coalesce(p_reference,''))) not between 5 and 500 or p_contract is null or length(coalesce(p_contract->>'version','')) not between 2 and 100 then raise exception 'Reviewed version and reference required' using errcode='22023';end if;
 perform 1 from public.tracks where id=p_track for update;
 select v.* into strict o from licensing_private.offer_heads h join licensing_private.offers v on v.id=h.offer_id where h.track_id=p_track and h.license_type_id=p_license;
 if o.id is distinct from p_expected then raise exception 'Stale offer version' using errcode='40001';end if;
 if o.terms->'licenseContract'=p_contract then return jsonb_build_object('offerId',o.id,'reviewRequired',true);end if;
 if p_contract->>'version'=o.terms->>'version' then raise exception 'New material terms require a new document version' using errcode='22023';end if;
 perform licensing_private.check_offer(o.id,clock_timestamp());
 insert into licensing_private.offers(track_id,license_type_id,seller_user_id,source_hash,rights_epoch,license_exclusive,rights,terms,financial,reviewed_by,review_reference)
 values(o.track_id,o.license_type_id,o.seller_user_id,o.source_hash,o.rights_epoch,o.license_exclusive,o.rights,o.terms||jsonb_build_object('licenseContract',p_contract,'version',p_contract->>'version'),o.financial,auth.uid(),p_reference) returning id into newid;
 update licensing_private.offer_heads set offer_id=newid where track_id=p_track and license_type_id=p_license;
 insert into public.track_audit_log(track_id,actor_id,action,metadata)
 values(p_track,auth.uid(),'license_contract_versioned',jsonb_build_object('previousOffer',o.id,'offerId',newid,'reference',p_reference));
 return jsonb_build_object('offerId',newid,'reviewRequired',true);
end$$;
revoke all on function public.license_offer_contract(uuid,uuid),public.license_configure_contract(uuid,uuid,uuid,jsonb,text) from public,anon,service_role;
grant execute on function public.license_offer_contract(uuid,uuid),public.license_configure_contract(uuid,uuid,uuid,jsonb,text) to authenticated;
revoke all on all tables in schema licensing_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema licensing_private from public,anon,authenticated,service_role;
revoke all on all functions in schema licensing_private from public,anon,authenticated,service_role;
revoke all on function commerce_private.broker_can_deliver_before_system07(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.license_lifecycle_command(uuid,bigint,uuid,text,text,text),public.license_records(integer,integer),public.license_record(uuid) from public,anon,service_role;
grant execute on function public.license_lifecycle_command(uuid,bigint,uuid,text,text,text),public.license_records(integer,integer),public.license_record(uuid) to authenticated;
commit;
