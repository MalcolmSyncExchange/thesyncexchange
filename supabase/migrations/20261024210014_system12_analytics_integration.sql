-- System 12. Local candidate only. No schedule, keys, notices approved or activation.
begin;
set local lock_timeout='5s';
create schema analytics_private;
revoke all on schema analytics_private from public,anon,authenticated,service_role;
create table analytics_private.configuration(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 environment text not null default 'preview' check(environment in('preview','production')),
 capture_from timestamptz not null default clock_timestamp(),retention_days integer not null default 30 check(retention_days between 7 and 365),
 notice_version text not null default 'analytics-optional-v1',privacy_approved boolean not null default false
);
insert into analytics_private.configuration(singleton) values(true);
create table analytics_private.preferences(
 user_id uuid primary key references auth.users(id) on delete cascade,consented boolean not null,
 notice_version text not null,source text not null check(source in('signup','account')),confirmation_required boolean not null default true,signup_role text check(signup_role in('artist','buyer','admin','unassigned')),changed_at timestamptz not null default clock_timestamp()
);
create table analytics_private.runs(
 id bigint generated always as identity primary key,environment text not null,collected integer not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare t text;begin foreach t in array array['configuration','preferences','runs'] loop
 execute format('alter table analytics_private.%I enable row level security',t);
 execute format('alter table analytics_private.%I force row level security',t);
 execute format('create policy owner_only on analytics_private.%I to postgres using(true) with check(true)',t);
end loop;end$$;
create function analytics_private.allowed(p_user uuid,p_at timestamptz default clock_timestamp()) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from analytics_private.configuration c join analytics_private.preferences p on p.user_id=p_user
 join public.user_profiles u on u.id=p.user_id where c.enabled and c.privacy_approved and p.consented and p.notice_version=c.notice_version
 and p_at>=greatest(c.capture_from,p.changed_at,statement_timestamp()-make_interval(days=>c.retention_days))
 and u.role in('artist','buyer','admin') and sec_private.account_allowed(u.id))
$$;
create function public.analytics_preferences(p_consent boolean default null,p_notice text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c analytics_private.configuration;p analytics_private.preferences;begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or public.current_app_role() not in('artist','buyer','admin') then raise exception 'Active canonical account required' using errcode='42501';end if;
 select * into strict c from analytics_private.configuration;
 if p_consent is not null then
  if p_notice is distinct from c.notice_version then raise exception 'Current analytics notice required' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('analytics-consent:'||auth.uid()::text,0));
  insert into analytics_private.preferences(user_id,consented,notice_version,source) values(auth.uid(),p_consent,p_notice,'account')
  on conflict(user_id) do update set consented=excluded.consented,notice_version=excluded.notice_version,source='account',changed_at=clock_timestamp();
  if not p_consent then delete from public.analytics_outbox where actor_id=auth.uid();end if;
 end if;
 select * into p from analytics_private.preferences where user_id=auth.uid();
 return jsonb_build_object('consented',coalesce(p.consented and p.notice_version=c.notice_version,false),'noticeVersion',c.notice_version,'deliveryEnabled',c.enabled and c.privacy_approved,'retentionDays',c.retention_days,'changedAt',p.changed_at);
end$$;
create function public.analytics_signup_consent(p_user uuid,p_notice text,p_confirmation boolean default true) returns void language plpgsql security definer set search_path='' as $$begin
 perform commerce_private.require_service_role();
 if p_notice is distinct from (select notice_version from analytics_private.configuration) or not exists(select 1 from public.user_profiles where id=p_user and created_at>clock_timestamp()-interval '1 minute') then raise exception 'New canonical signup and current notice required';end if;
 insert into analytics_private.preferences(user_id,consented,notice_version,source,confirmation_required,signup_role) values(p_user,true,p_notice,'signup',p_confirmation,coalesce((select role::text from public.user_profiles where id=p_user),'unassigned')) on conflict do nothing;
end$$;
-- All original Phase 1 names/payloads remain valid. New lifecycle facts are server-only.
alter table public.analytics_outbox drop constraint analytics_outbox_event_check;
alter table public.analytics_outbox add constraint analytics_outbox_event_check check(event in(
 'signup_completed','onboarding_started','onboarding_completed','submission_started','submission_completed','catalog_searched','track_preview_started','license_selected','checkout_started','purchase_verified','funnel_step_failed',
 'email_confirmed','artist_profile_completed','upload_completed','rights_reviewed','rights_approved','catalog_reviewed','catalog_approved','catalog_published','buyer_accepted','license_issued','asset_delivery_completed','asset_delivery_failed','refund_verified','dispute_verified','subscription_activity','admin_operation','operational_failure','marketplace_inquiry','marketplace_quote','marketplace_checkout','marketplace_license'));
-- Save original contract so verified purchase checks/rate limits remain in force.
alter function public.enqueue_analytics_event(text,text,uuid,text,jsonb,text,boolean,boolean) rename to enqueue_analytics_event_before_system12;
create function public.enqueue_analytics_event(p_environment text,p_event text,p_actor_id uuid,p_actor_role text,p_properties jsonb,p_dedupe_key text,p_is_internal boolean,p_is_test boolean) returns uuid language plpgsql security definer set search_path='' as $$declare role text;prior public.analytics_outbox;begin
 perform commerce_private.require_service_role();
 select u.role::text into role from public.user_profiles u where id=p_actor_id;
 if role is distinct from p_actor_role or not analytics_private.allowed(p_actor_id) or p_environment is distinct from(select environment from analytics_private.configuration) then return null;end if;
 perform pg_advisory_xact_lock(hashtextextended('analytics-key:'||p_environment||p_dedupe_key,0));
 select * into prior from public.analytics_outbox where environment=p_environment and dedupe_key=p_dedupe_key;
 if found and (prior.actor_id<>p_actor_id or prior.actor_role<>p_actor_role or prior.event<>p_event or prior.properties<>p_properties) then raise exception 'Conflicting analytics dedupe identity' using errcode='22023';end if;
 return public.enqueue_analytics_event_before_system12(p_environment,p_event,p_actor_id,p_actor_role,p_properties,p_dedupe_key,p_is_internal or role='admin',p_is_test or p_environment='preview');
end$$;
-- Original lease fencing/backoff retained. Privacy is checked again on every claim.
alter function public.claim_analytics_event(text,uuid) rename to claim_analytics_event_before_system12;
create function public.claim_analytics_event(p_environment text,p_id uuid default null) returns setof public.analytics_outbox language plpgsql security definer set search_path='' as $$begin
 perform commerce_private.require_service_role();
 if not exists(select 1 from analytics_private.configuration where enabled and privacy_approved and environment=p_environment) then return;end if;
 delete from public.analytics_outbox where environment=p_environment and not analytics_private.allowed(actor_id,occurred_at);
 return query select * from public.claim_analytics_event_before_system12(p_environment,p_id);
end$$;
-- Outbox event payloads/time/identity are immutable after insertion. Only lease/delivery metadata changes.
create function analytics_private.immutable_event() returns trigger language plpgsql set search_path='' as $$begin
 if row(new.id,new.dedupe_key,new.environment,new.event,new.actor_id,new.actor_role,new.properties,new.is_internal,new.is_test,new.occurred_at)
 is distinct from row(old.id,old.dedupe_key,old.environment,old.event,old.actor_id,old.actor_role,old.properties,old.is_internal,old.is_test,old.occurred_at) then raise exception 'Analytics event evidence is immutable' using errcode='42501';end if;return new;end$$;
create trigger analytics_event_immutable before update on public.analytics_outbox for each row execute function analytics_private.immutable_event();
-- Minimal recoverable projections over existing domain evidence. No raw messages,
-- legal identity, rights documents, Storage paths, provider payloads or amounts.
create view analytics_private.source_events with(security_invoker=true) as
 select 'signup:'||u.id::text source_key,u.id actor_id,p.signup_role actor_role,'signup_completed'::text event,
 jsonb_build_object('confirmation_required',p.confirmation_required) properties,p.changed_at occurred_at,false is_test
 from public.user_profiles u join analytics_private.preferences p on p.user_id=u.id and p.source='signup' and p.signup_role in('artist','buyer') and u.role::text=p.signup_role
 union all select 'confirmation:'||u.id,u.id,u.role::text,'email_confirmed','{}'::jsonb,(to_jsonb(a)->>'email_confirmed_at')::timestamptz,false
 from public.user_profiles u join auth.users a on a.id=u.id where to_jsonb(a)->>'email_confirmed_at' is not null
 union all select 'onboarding_completed:'||id,id,role::text,'onboarding_completed','{}',onboarding_completed_at,false from public.user_profiles where onboarding_completed_at is not null
 union all select 'artist-account:'||id,user_id,'artist','artist_profile_completed','{}',accepted_at,false from public.artist_account_acceptances
 union all select 'media:'||e.id,s.owner_id,'artist',case when e.event_type='validation_passed' then 'upload_completed' when e.event_type='master_review_requested' then 'submission_completed' else 'operational_failure' end,
 case when e.event_type='validation_passed' then jsonb_build_object('track_id',s.track_id,'asset_id',e.asset_id)
 when e.event_type='master_review_requested' then jsonb_build_object('track_id',s.track_id,'is_resubmission',exists(select 1 from submission_media.events prev where prev.submission_id=e.submission_id and prev.event_type=e.event_type and prev.id<e.id))
 else jsonb_build_object('system','media','category','processing_failed') end,e.created_at,false
 from submission_media.events e join submission_media.submissions s on s.id=e.submission_id where s.track_id is not null and e.event_type in('validation_passed','master_review_requested','validation_failed')
 union all select 'rights-review:'||d.id,c.owner_id,'artist','rights_reviewed',jsonb_build_object('track_id',d.track_id,'state',d.state),d.created_at,false from rights_private.decisions d join rights_private.cases c on c.track_id=d.track_id
 union all select 'rights-approved:'||d.id,c.owner_id,'artist','rights_approved',jsonb_build_object('track_id',d.track_id),d.created_at,false from rights_private.decisions d join rights_private.cases c on c.track_id=d.track_id where d.state='approved'
 union all select 'catalog-reviewed:'||d.id,c.owner_id,'artist','catalog_reviewed',jsonb_build_object('track_id',d.track_id,'state',d.state),d.created_at,false from catalog_private.decisions d join catalog_private.cases c on c.track_id=d.track_id
 union all select 'catalog-approved:'||d.id,c.owner_id,'artist','catalog_approved',jsonb_build_object('track_id',d.track_id),d.created_at,false from catalog_private.decisions d join catalog_private.cases c on c.track_id=d.track_id where d.state='approved'
 union all select 'catalog-published:'||e.id,c.owner_id,'artist','catalog_published',jsonb_build_object('track_id',e.track_id),e.recorded_at,false from catalog_private.events e join catalog_private.cases c on c.track_id=e.track_id where e.action='catalog_published'
 union all select 'acceptance:'||a.order_id,a.buyer_id,'buyer','buyer_accepted',jsonb_build_object('order_id',a.order_id,'track_id',o.track_id),a.accepted_at,true from licensing_private.acceptances a join public.orders o on o.id=a.order_id
 union all select 'checkout:'||o.id,o.buyer_user_id,'buyer','checkout_started',jsonb_build_object('order_id',o.id,'track_id',o.track_id,'license_type',x.license_snapshot->>'slug','checkout_attempt_id',o.id),o.checkout_created_at,c.payment_mode='test' from public.orders o join public.order_delivery_contracts c on c.order_id=o.id join commerce_private.contract_context x on x.contract_id=c.id where o.stripe_checkout_session_id is not null and o.checkout_created_at is not null
 union all select 'purchase:'||c.order_id,c.buyer_user_id,'buyer','purchase_verified',jsonb_build_object('order_id',c.order_id,'track_id',c.track_id,'license_type',x.license_snapshot->>'slug','payment_mode',e.payment_mode),e.provider_created_at,e.payment_mode='test'
 from public.order_delivery_contracts c join commerce_private.contract_context x on x.contract_id=c.id join commerce_private.order_states s on s.contract_id=c.id join commerce_private.payment_events e on e.id=s.payment_received_event_id
 where e.payment_state='PAID' and e.verification_method='stripe_signature' and not exists(select 1 from commerce_private.acceptance_grants g where g.order_id=c.order_id)
 union all select 'license:'||l.id,c.buyer_user_id,'buyer','license_issued',jsonb_build_object('order_id',c.order_id,'track_id',c.track_id),l.generated_at,c.payment_mode='test'
 from public.generated_licenses l join public.order_delivery_contracts c on c.order_id=l.order_id join commerce_private.order_states s on s.contract_id=c.id where l.status='generated' and s.payment_received_event_id is not null
 union all select 'transfer:'||e.authorization_id,a.actor_id,'buyer',case when e.outcome='stream_exhausted' then 'asset_delivery_completed' else 'asset_delivery_failed' end,
 jsonb_build_object('order_id',a.requested_order,'outcome',e.outcome),e.created_at,c.payment_mode='test'
 from commerce_private.delivery_transfer_events e join commerce_private.delivery_authorizations a on a.id=e.authorization_id join public.order_delivery_contracts c on c.order_id=a.requested_order where e.phase='finished'
 union all select 'adverse:'||e.id,c.buyer_user_id,'buyer',case when e.payment_state='DISPUTED' then 'dispute_verified' else 'refund_verified' end,jsonb_build_object('order_id',c.order_id),e.provider_created_at,e.payment_mode='test'
 from commerce_private.payment_events e join public.order_delivery_contracts c on c.id=e.contract_id where e.payment_state in('REFUNDED','PARTIALLY_REFUNDED','DISPUTED') and e.verification_method='stripe_signature'
 union all select 'sec:'||r.sequence,r.actor_id,'admin',case when r.module='subscriptions' then 'subscription_activity' else 'admin_operation' end,
 case when r.module='subscriptions' then jsonb_build_object('kind','administrative_observation') else jsonb_build_object('module',r.module) end,r.created_at,true
 from sec_private.revisions r join public.user_profiles u on u.id=r.actor_id and u.role='admin'
 union all select 'domain-audit:'||a.id,a.actor_id,'admin','admin_operation',jsonb_build_object('module','domain'),a.recorded_at,true from sec_private.audit a join public.user_profiles u on u.id=a.actor_id and u.role='admin' where a.entity_type not in('users','permissions','support','integrity','deals','subscriptions','settings','organizations','incidents')
 union all select 'deal:'||r.sequence,r.owner_id,'buyer',case r.data->>'stage' when 'quote' then 'marketplace_quote' when 'checkout' then 'marketplace_checkout' when 'license' then 'marketplace_license' else 'marketplace_inquiry' end,
 jsonb_strip_nulls(jsonb_build_object('track_id',r.data->>'trackId','deal_id',r.entity_id,'order_id',r.data->>'orderId')),r.created_at,false
 from sec_private.revisions r join public.user_profiles u on u.id=r.owner_id and u.role='buyer' where r.module='deals' and ((r.action='create' and r.data->>'stage'='inquiry') or (r.action='advance' and r.data->>'stage' in('inquiry','quote','checkout','license')));
-- Collector is outside critical transactions. A rollback/interruption leaves the
-- canonical source intact; the next run discovers every still-unprojected key.
create function public.collect_analytics_events(p_environment text,p_limit integer default 200,p_internal_ids uuid[] default '{}',p_test_ids uuid[] default '{}') returns integer language plpgsql security definer set search_path='' as $$declare e record;n integer:=0;c analytics_private.configuration;v uuid;begin
 perform commerce_private.require_service_role();
 if p_limit is null or p_limit not between 1 and 200 or p_internal_ids is null or p_test_ids is null or cardinality(p_internal_ids)>1000 or cardinality(p_test_ids)>1000 then raise exception 'Bounded analytics batch required';end if;
 select * into strict c from analytics_private.configuration;
 if not c.enabled or not c.privacy_approved or c.environment<>p_environment then return 0;end if;
 perform pg_advisory_xact_lock(hashtextextended('analytics-collector:'||p_environment,0));
 for e in select s.* from analytics_private.source_events s where analytics_private.allowed(s.actor_id,s.occurred_at) and s.actor_role=(select role::text from public.user_profiles where id=s.actor_id)
 and not exists(select 1 from public.analytics_outbox o where o.environment=p_environment and o.dedupe_key=s.source_key)
 order by s.occurred_at,s.source_key limit p_limit loop
  v:=public.enqueue_analytics_event(p_environment,e.event,e.actor_id,e.actor_role,e.properties,e.source_key,e.actor_role='admin' or e.actor_id=any(p_internal_ids),e.is_test or e.actor_id=any(p_test_ids));
  if v is not null then
   -- Set immutable source time at INSERT, never mutate accepted outbox evidence.
   -- enqueue uses clock time; insert through the checked helper below instead.
   n:=n+1;
  end if;
 end loop;
 insert into analytics_private.runs(environment,collected) values(p_environment,n);return n;
end$$;
-- Source timestamps are supplied only by the private collector through a local
-- function setting, not by clients or public RPC parameters.
create function analytics_private.source_timestamp() returns trigger language plpgsql set search_path='' as $$declare t text;begin
 t:=current_setting('analytics.source_time',true);if t is not null and t<>'' then new.occurred_at:=t::timestamptz;end if;return new;end$$;
create trigger analytics_source_time before insert on public.analytics_outbox for each row execute function analytics_private.source_timestamp();
do $$declare body text;begin body:=pg_get_functiondef('public.collect_analytics_events(text,integer,uuid[],uuid[])'::regprocedure);
 body:=replace(body,'v:=public.enqueue_analytics_event','perform set_config(''analytics.source_time'',e.occurred_at::text,true); v:=public.enqueue_analytics_event');
 body:=replace(body,'insert into analytics_private.runs','perform set_config(''analytics.source_time'','''',true); insert into analytics_private.runs');execute body;end$$;
create function public.analytics_retention() returns integer language plpgsql security definer set search_path='' as $$declare n integer;begin
 perform commerce_private.require_service_role();
 delete from public.analytics_outbox o where o.occurred_at<clock_timestamp()-make_interval(days=>(select retention_days from analytics_private.configuration)) or not exists(select 1 from public.user_profiles u where u.id=o.actor_id) or not sec_private.account_allowed(o.actor_id);
 get diagnostics n=row_count;
 delete from analytics_private.runs where created_at<clock_timestamp()-interval '30 days';return n;
end$$;
create function public.analytics_operations(p_environment text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.is_admin() then raise exception 'Current MFA full Admin required' using errcode='42501';end if;
 if p_environment not in('preview','production') or p_environment is null then raise exception 'Analytics environment required';end if;
 result:=public.get_analytics_delivery_health(p_environment);
 return result||jsonb_build_object('oldestPendingSeconds',(select greatest(0,extract(epoch from statement_timestamp()-min(occurred_at))) from public.analytics_outbox where environment=p_environment and delivered_at is null),
 'lastCollectionAt',(select max(created_at) from analytics_private.runs where environment=p_environment),
 'retentionDays',(select retention_days from analytics_private.configuration),'deliveryEnabled',(select enabled and privacy_approved from analytics_private.configuration where environment=p_environment),
 'domainHealth',jsonb_build_object('financialDeadLetters',(select count(*) from finance_private.provider_jobs where state in('dead','conflict')),'financialRetries',(select count(*) from finance_private.provider_jobs where state='retry'),'deliveryFailures30Days',(select count(*) from commerce_private.delivery_transfer_events where phase='finished' and outcome<>'stream_exhausted' and created_at>statement_timestamp()-interval '30 days')),
 'attention',(select coalesce(jsonb_agg(to_jsonb(q)),'[]') from(select id,event,delivery_status,attempt_count,delivery_cycle,failure_category,next_retry_at from public.analytics_outbox where environment=p_environment and delivery_status in('held','exhausted') order by occurred_at,id limit 50) q));
end$$;
revoke all on all tables in schema analytics_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema analytics_private from public,anon,authenticated,service_role;
revoke all on all functions in schema analytics_private from public,anon,authenticated,service_role;
revoke all on function public.enqueue_analytics_event_before_system12(text,text,uuid,text,jsonb,text,boolean,boolean),public.claim_analytics_event_before_system12(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.enqueue_analytics_event(text,text,uuid,text,jsonb,text,boolean,boolean),public.claim_analytics_event(text,uuid),public.collect_analytics_events(text,integer,uuid[],uuid[]),public.analytics_retention(),public.analytics_signup_consent(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.enqueue_analytics_event(text,text,uuid,text,jsonb,text,boolean,boolean),public.claim_analytics_event(text,uuid),public.collect_analytics_events(text,integer,uuid[],uuid[]),public.analytics_retention(),public.analytics_signup_consent(uuid,text,boolean) to service_role;
revoke all on function public.analytics_preferences(boolean,text),public.analytics_operations(text) from public,anon,service_role;
grant execute on function public.analytics_preferences(boolean,text),public.analytics_operations(text) to authenticated;
-- Exact verified provider facts for the existing pure financial contract. Bounded
-- complete local history, no inference from browser telemetry or order.status.
create function public.analytics_financial_source(p_end timestamptz,p_mode text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare payments jsonb;refunds jsonb;n bigint;begin
 if not public.is_admin() then raise exception 'Current MFA full Admin required' using errcode='42501';end if;
 if p_mode not in('test','live') or p_end is null then raise exception 'Bounded financial request required';end if;
 if p_mode='live' then return jsonb_build_object('state','unavailable_source');end if;
 select count(*) into n from commerce_private.payment_events where provider_created_at<p_end;
 if n>10000 then return jsonb_build_object('state','insufficient_evidence');end if;
 -- An economic payment may have several authentic provider envelopes. Conflicting
 -- facts are exposed as insufficient evidence, never selected by last-write wins.
 if exists(select 1 from commerce_private.payment_events e where e.payment_state='PAID' and e.provider_created_at<p_end group by e.provider_account,e.payment_mode,e.payment_intent_id having count(distinct (e.contract_id,e.amount_minor,e.currency,e.checkout_session_id))>1) then return jsonb_build_object('state','insufficient_evidence');end if;
 select coalesce(jsonb_agg(jsonb_build_object('paymentKey',e.provider_account||':'||e.payment_intent_id,'orderKey',c.order_id,'mode',e.payment_mode,'capturedAt',e.provider_created_at,'amountMinor',e.amount_minor,'currency',e.currency,
 'licenseCategory',x.license_snapshot->>'slug','signatureVerified',e.verification_method='stripe_signature',
 'orderBinding',case when e.amount_minor=c.amount_minor and e.currency=c.currency and x.provider_account=e.provider_account and c.payment_mode=e.payment_mode and o.buyer_user_id=c.buyer_user_id and o.track_id=c.track_id and o.license_type_id=c.license_type_id and o.stripe_checkout_session_id=e.checkout_session_id and o.stripe_payment_intent_id=e.payment_intent_id and a.snapshot_hash=x.purchase_hash then 'matched' else 'mismatched' end,
 'license',case when l.status='generated' and l.buyer_id=c.buyer_user_id and l.track_id=c.track_id and l.license_type_id=c.license_type_id and l.pdf_storage_path is not null then 'completed' when l.status='failed' then 'failed' when l.id is null then 'missing' else 'pending' end)),'[]') into payments
 from (select distinct on(provider_account,payment_mode,payment_intent_id) * from commerce_private.payment_events where payment_state='PAID' and provider_created_at<p_end order by provider_account,payment_mode,payment_intent_id,provider_created_at,id) e
 join public.order_delivery_contracts c on c.id=e.contract_id join commerce_private.contract_context x on x.contract_id=c.id join public.orders o on o.id=c.order_id
 left join licensing_private.acceptances a on a.order_id=c.order_id left join public.generated_licenses l on l.order_id=c.order_id
 where not exists(select 1 from commerce_private.acceptance_grants g where g.order_id=c.order_id);
 select coalesce(jsonb_agg(jsonb_build_object('eventKey',e.id,'paymentKey',e.provider_account||':'||e.payment_intent_id,'mode',e.payment_mode,'occurredAt',e.provider_created_at,'cumulativeMinor',e.refunded_minor,'currency',e.currency,'signatureVerified',e.verification_method='stripe_signature')),'[]') into refunds from commerce_private.payment_events e where e.payment_state in('PARTIALLY_REFUNDED','REFUNDED') and e.provider_created_at<p_end and not exists(select 1 from commerce_private.acceptance_grants g join public.order_delivery_contracts c on c.order_id=g.order_id where c.id=e.contract_id);
 return jsonb_build_object('state','available','payments',payments,'refunds',refunds,'refundsState','available','reason','complete','historyComplete',true,
 'failedPayments',jsonb_build_object('state','unavailable_instrumentation','value',null),
 'disputedPayments',(select count(distinct (provider_account,payment_intent_id)) from commerce_private.payment_events where payment_state='DISPUTED' and provider_created_at<p_end));
end$$;
create function public.analytics_booked_finance(p_start timestamptz,p_end timestamptz,p_mode text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare rows jsonb;begin
 if not public.is_admin() then raise exception 'Current MFA full Admin required' using errcode='42501';end if;
 if p_start is null or p_end is null or p_start>=p_end or p_end-p_start>interval '93 days' or p_mode not in('test','live') then raise exception 'Bounded financial range required';end if;
 if p_mode='live' then return jsonb_build_object('state','unavailable_source','currencies','[]'::jsonb);end if;
 if exists(select 1 from finance_private.journals j left join finance_private.lines l on l.journal_id=j.id group by j.id having count(l.journal_id)<2 or coalesce(sum(l.signed_minor),0)<>0) then return jsonb_build_object('state','insufficient_evidence','currencies','[]'::jsonb);end if;
 select coalesce(jsonb_agg(jsonb_build_object('currency',q.currency,'commissionMinor',q.commission::text,'sellerEarningsMinor',q.earnings::text,'outstandingObligationsMinor',q.obligations::text,'disputeLossMinor',q.disputes::text,'unpostedOrders',q.unposted)),'[]') into rows from(
 select b.currency,
 coalesce((select -sum(l.signed_minor) from finance_private.lines l join finance_private.journals j on j.id=l.journal_id where l.currency=b.currency and l.account='platform_revenue' and j.created_at>=p_start and j.created_at<p_end),0) commission,
 coalesce((select -sum(l.signed_minor) from finance_private.lines l join finance_private.journals j on j.id=l.journal_id where l.currency=b.currency and (l.account like 'payable:%' or l.account like 'reserved:%' or l.account='payout_clearing') and j.created_at>=p_start and j.created_at<p_end),0) earnings,
 coalesce((select -sum(l.signed_minor) from finance_private.lines l join finance_private.journals j on j.id=l.journal_id where l.currency=b.currency and(l.account like 'payable:%' or l.account like 'reserved:%') and j.created_at<p_end),0) obligations,
 coalesce((select sum(l.signed_minor) from finance_private.lines l join finance_private.journals j on j.id=l.journal_id where l.currency=b.currency and l.account='chargeback_expense' and j.created_at>=p_start and j.created_at<p_end),0) disputes,
 (select count(*) from finance_private.books x where x.currency=b.currency and x.created_at>=p_start and x.created_at<p_end and not exists(select 1 from finance_private.journals j where j.order_id=x.order_id and j.economic_key='purchase')) unposted
 from finance_private.books b where b.payment_mode=p_mode group by b.currency) q;
 return jsonb_build_object('state','available','currencies',rows,'basis','Booked journal activity; obligations as of range end; synthetic test book only','actualPayoutsAvailable',false);
end$$;
revoke all on function public.analytics_financial_source(timestamptz,text),public.analytics_booked_finance(timestamptz,timestamptz,text) from public,anon,service_role;
grant execute on function public.analytics_financial_source(timestamptz,text),public.analytics_booked_finance(timestamptz,timestamptz,text) to authenticated;


create function public.analytics_delivery_allowed(p_id uuid,p_lease uuid) returns boolean language plpgsql stable security definer set search_path='' as $$begin
 perform commerce_private.require_service_role();
 return exists(select 1 from public.analytics_outbox o join analytics_private.configuration c on c.environment=o.environment where o.id=p_id and o.lease_id=p_lease and o.delivery_status='processing' and o.lease_until>statement_timestamp() and analytics_private.allowed(o.actor_id,o.occurred_at));
end$$;
revoke all on function public.analytics_delivery_allowed(uuid,uuid) from public,anon,authenticated;
grant execute on function public.analytics_delivery_allowed(uuid,uuid) to service_role;

commit;
