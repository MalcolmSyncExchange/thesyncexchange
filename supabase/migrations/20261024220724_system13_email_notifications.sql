-- System 13: local-only, default-disabled email. No SMTP, provider, schedule or legal-policy activation.
begin;
set local lock_timeout='5s';
create schema notifications_private;
revoke all on schema notifications_private from public,anon,authenticated,service_role;
create table notifications_private.configuration(
 singleton boolean primary key default true check(singleton),enabled boolean not null default false,
 source_from timestamptz not null default clock_timestamp(),retention_days int not null default 90 check(retention_days between 30 and 365)
);
insert into notifications_private.configuration(singleton) values(true);
create table notifications_private.preferences(user_id uuid primary key references public.user_profiles(id),operational boolean not null default true,marketing boolean not null default false,notice text not null default 'notifications-v1',changed_at timestamptz not null default clock_timestamp());
create table notifications_private.outbox(
 id uuid primary key default gen_random_uuid(),source_key text not null unique,kind text not null,category text not null check(category in('security','transactional','operational','admin')),
 order_id uuid references public.orders(id),recipient_id uuid not null references public.user_profiles(id),recipient_role text not null check(recipient_role in('artist','buyer','admin')),recipient_address text,
 occurred_at timestamptz not null,created_at timestamptz not null default clock_timestamp(),request_hash text,template_version text not null default 'tse-notice-v1',
 state text not null default 'pending' check(state in('pending','leased','retry','accepted','delivered','bounced','complained','failed','dead','canceled')),
 attempts int not null default 0 check(attempts between 0 and 6),next_at timestamptz not null default clock_timestamp(),
 lease_id uuid,lease_until timestamptz,first_attempt_at timestamptz,provider_id text unique,code text,terminal_at timestamptz,
 check((state='leased')=(lease_id is not null and lease_until is not null))
);
create index email_due on notifications_private.outbox(next_at,id) where state in('pending','retry','leased');
create table notifications_private.attempts(id bigint generated always as identity primary key,message_id uuid not null references notifications_private.outbox(id),lease_id uuid not null,attempt int not null,outcome text not null,created_at timestamptz not null default clock_timestamp());
create table notifications_private.provider_events(event_id text primary key,body_hash text not null,provider_id text not null,kind text not null,occurred_at timestamptz not null,received_at timestamptz not null default clock_timestamp());
create table notifications_private.provider_conflicts(event_id text not null,body_hash text not null,received_at timestamptz not null default clock_timestamp(),primary key(event_id,body_hash));
create table notifications_private.suppressions(address text primary key,reason text not null,created_at timestamptz not null default clock_timestamp());
create table notifications_private.runs(id bigint generated always as identity primary key,collected int not null,created_at timestamptz not null default clock_timestamp());
do $$declare t text;begin foreach t in array array['configuration','preferences','outbox','attempts','provider_events','provider_conflicts','suppressions','runs'] loop
 execute format('alter table notifications_private.%I enable row level security',t);
 execute format('alter table notifications_private.%I force row level security',t);
 execute format('create policy owner_only on notifications_private.%I to postgres using(true) with check(true)',t);
end loop;
foreach t in array array['attempts','provider_events','provider_conflicts'] loop
 execute format('create trigger immutable before update or delete on notifications_private.%I for each row execute function licensing_private.immutable()',t);
end loop;end$$;
create function notifications_private.freeze() returns trigger language plpgsql set search_path='' as $$begin
 if row(new.id,new.source_key,new.kind,new.category,new.order_id,new.recipient_id,new.recipient_role,new.occurred_at,new.created_at,new.template_version) is distinct from row(old.id,old.source_key,old.kind,old.category,old.order_id,old.recipient_id,old.recipient_role,old.occurred_at,old.created_at,old.template_version)
 or(old.request_hash is not null and new.request_hash is distinct from old.request_hash)
 or(new.recipient_address is distinct from old.recipient_address and not(new.recipient_address is null and old.terminal_at<clock_timestamp()-interval '30 days')) then raise exception 'Immutable notification identity' using errcode='42501';end if;return new;end$$;
create trigger immutable_identity before update on notifications_private.outbox for each row execute function notifications_private.freeze();
-- No tokens, titles, legal-party data, documents, messages, money or private URLs in email projections.
create view notifications_private.paid_orders with(security_invoker=true) as
 select c.order_id,c.buyer_user_id,c.track_id,a.snapshot#>>'{seller,userId}' seller_id,c.id contract_id,e.provider_created_at occurred_at,s.state
 from public.order_delivery_contracts c join commerce_private.contract_context x on x.contract_id=c.id
 join public.orders o on o.id=c.order_id join commerce_private.order_states s on s.contract_id=c.id
 join commerce_private.payment_events e on e.id=s.payment_received_event_id
 join licensing_private.acceptances a on a.order_id=c.order_id and a.snapshot_hash=x.purchase_hash
 where e.payment_state='PAID' and e.verification_method='stripe_signature' and e.amount_minor=c.amount_minor and e.currency=c.currency
 and e.provider_account=x.provider_account and e.payment_mode=c.payment_mode and e.checkout_session_id=o.stripe_checkout_session_id and e.payment_intent_id=o.stripe_payment_intent_id
 and o.buyer_user_id=c.buyer_user_id and o.track_id=c.track_id and o.license_type_id=c.license_type_id
 and not exists(select 1 from commerce_private.acceptance_grants g where g.order_id=c.order_id);
create view notifications_private.customer_sources with(security_invoker=true) as
 select 'confirmed:'||u.id source_key,u.id recipient_id,p.role::text recipient_role,'account_confirmed'::text kind,'security'::text category,(to_jsonb(u)->>'email_confirmed_at')::timestamptz occurred_at
 from auth.users u join public.user_profiles p on p.id=u.id where p.role in('artist','buyer') and to_jsonb(u)->>'email_confirmed_at' is not null
 union all select 'onboarded:'||id,id,role::text,'onboarding_complete','operational',onboarding_completed_at from public.user_profiles where role='artist' and onboarding_completed_at is not null
 union all select 'media:'||e.id,s.owner_id,'artist',case e.event_type when 'master_review_requested' then 'submission_received' when 'validation_failed' then 'upload_failed' else 'upload_ready' end,'operational',e.created_at
 from submission_media.events e join submission_media.submissions s on s.id=e.submission_id where e.event_type in('master_review_requested','validation_failed','validation_passed')
 union all select 'rights:'||d.id,c.owner_id,'artist','rights_'||d.state,case when d.state in('disputed','revoked','expired') then 'transactional' else 'operational' end,d.created_at from rights_private.decisions d join rights_private.cases c on c.track_id=d.track_id
 union all select 'catalog:'||e.id,c.owner_id,'artist',e.action,'operational',e.recorded_at from catalog_private.events e join catalog_private.cases c on c.track_id=e.track_id where e.action in('catalog_changes_requested','catalog_approved','catalog_rejected','catalog_published','catalog_suspended','catalog_unpublished','catalog_archived')
 union all select 'purchase:'||order_id,buyer_user_id,'buyer','purchase_confirmed','transactional',occurred_at from notifications_private.paid_orders where state in('PAID','FULFILLED')
 union all select 'license:'||l.id,p.buyer_user_id,'buyer','license_ready','transactional',l.generated_at from notifications_private.paid_orders p join public.generated_licenses l on l.order_id=p.order_id where p.state in('PAID','FULFILLED') and not licensing_private.contract_closed(p.order_id) and l.status='generated' and l.pdf_storage_path is not null and l.buyer_id=p.buyer_user_id and l.track_id=p.track_id
 union all select 'assets:'||p.order_id,p.buyer_user_id,'buyer','assets_ready','transactional',min(n.activated_at) from notifications_private.paid_orders p join public.order_asset_entitlements n on n.order_id=p.order_id and n.contract_id=p.contract_id where p.state in('PAID','FULFILLED') and not licensing_private.contract_closed(p.order_id) and n.state='active' and exists(select 1 from public.generated_licenses l where l.order_id=p.order_id and l.status='generated') group by p.order_id,p.buyer_user_id
 union all select 'artist-license:'||l.id,u.id,'artist','license_activity','transactional',l.generated_at from notifications_private.paid_orders p join public.generated_licenses l on l.order_id=p.order_id join public.user_profiles u on u.id::text=p.seller_id and u.role='artist' where p.state in('PAID','FULFILLED') and not licensing_private.contract_closed(p.order_id) and l.status='generated'
 union all select 'rights-request:'||e.id,c.owner_id,'artist','rights_review_started','operational',e.recorded_at from rights_private.events e join rights_private.cases c on c.track_id=e.track_id where e.action='rights_submitted'
 union all select 'payment:'||e.id,c.buyer_user_id,'buyer',case e.payment_state when 'PAYMENT_FAILED' then 'payment_failed' when 'DISPUTED' then 'payment_disputed' when 'PARTIALLY_REFUNDED' then 'partial_refund' else 'refund' end,'transactional',e.provider_created_at from commerce_private.payment_events e join public.order_delivery_contracts c on c.id=e.contract_id where e.verification_method='stripe_signature' and e.payment_state in('PAYMENT_FAILED','DISPUTED','PARTIALLY_REFUNDED','REFUNDED')
 union all select 'recovery:'||h.id,p.buyer_user_id,'buyer','payment_recovered','transactional',h.created_at from commerce_private.state_history h join notifications_private.paid_orders p on p.contract_id=h.contract_id where h.state in('PAID','FULFILLED') and exists(select 1 from commerce_private.state_history prev where prev.contract_id=h.contract_id and prev.created_at<h.created_at and prev.state='PAYMENT_FAILED')
 union all select 'status:'||h.id,c.buyer_user_id,'buyer','license_status','transactional',h.created_at from commerce_private.state_history h join public.order_delivery_contracts c on c.id=h.contract_id where h.state in('SECURITY_HOLD','REFUNDED','DISPUTED')
 union all select 'lifecycle:'||e.id,o.buyer_user_id,'buyer','license_status','transactional',e.created_at from licensing_private.lifecycle_events e join public.orders o on o.id=e.order_id where e.action in('terminate','revoke')
 union all select 'seller-lifecycle:'||e.id,u.id,'artist','license_status','transactional',e.created_at from licensing_private.lifecycle_events e join licensing_private.acceptances a on a.order_id=e.order_id join public.user_profiles u on u.id::text=a.snapshot#>>'{seller,userId}' and u.role='artist' where e.action in('terminate','revoke')
 union all select 'support:'||r.sequence,r.owner_id,u.role::text,'support_response','transactional',r.created_at from sec_private.revisions r join public.user_profiles u on u.id=r.owner_id where r.module='support' and r.action='reply' and r.actor_id<>r.owner_id and u.role in('buyer','artist')
 union all select 'account-security:'||r.sequence,r.owner_id,u.role::text,'account_security','security',r.created_at from sec_private.revisions r join public.user_profiles u on u.id=r.owner_id where r.module in('users','permissions') and r.action in('restrict','suspend','reinstate','grant','revoke')
 union all select 'earnings:'||j.id,u.id,'artist','earnings_updated','operational',j.created_at from finance_private.journals j join finance_private.books b on b.order_id=j.order_id join public.user_profiles u on u.id::text=b.snapshot#>>'{seller,userId}' and u.role='artist'
 union all select 'earnings-bound:'||j.id||':'||b.id,b.artist_id,'artist','earnings_updated','operational',j.created_at from finance_private.journals j join finance_private.books book on book.order_id=j.order_id join finance_private.payee_bindings b on b.order_id=j.order_id and b.created_at<=j.created_at where b.artist_id is not null and b.artist_id::text is distinct from book.snapshot#>>'{seller,userId}' and not exists(select 1 from finance_private.payee_bindings newer where newer.previous_id=b.id and newer.created_at<=j.created_at)
 union all select 'payout:'||e.id,p.artist_id,'artist','payout_status','transactional',e.created_at from finance_private.payout_events e join finance_private.payout_requests p on p.id=e.payout_id join finance_private.payee_bindings b on b.id=p.binding_id and b.artist_id=p.artist_id;
-- Hourly coalescing bounds noisy operator alerts, retaining detailed evidence in SEC.
create view notifications_private.admin_signals with(security_invoker=true) as
 select 'rights_queue'::text kind,e.recorded_at occurred_at from rights_private.events e where e.action='rights_submitted'
 union all select 'catalog_queue',e.recorded_at from catalog_private.events e where e.action='catalog_submitted'
 union all select 'media_failure',e.created_at from submission_media.events e where e.event_type='validation_failed'
 union all select 'checkout_failure',h.created_at from commerce_private.state_history h where h.state='PAYMENT_FAILED'
 union all select 'checkout_failure',a.started_at from checkout_recovery.attempts a where a.state in('failed','expired') or(a.state='uncertain' and a.started_at<clock_timestamp()-interval '10 minutes')
 union all select 'financial_exception',r.created_at from finance_private.provider_reconciliations r where r.result->>'matched'='false'
 union all select 'delivery_failure',e.created_at from commerce_private.delivery_transfer_events e where e.phase='finished' and e.outcome<>'stream_exhausted'
 union all select 'dispute_alert',e.received_at from commerce_private.payment_events e where e.payment_state='DISPUTED'
 union all select 'support_escalation',r.created_at from sec_private.revisions r where r.module='support' and r.data->>'status'='escalated'
 union all select 'admin_security',r.created_at from sec_private.revisions r where r.module='permissions' and r.action in('grant','revoke')
 union all select 'worker_failure',a.created_at from finance_private.provider_attempts a where a.outcome in('retry','dead','conflict','lease_expired')
 union all select 'dead_letter',j.updated_at from finance_private.provider_jobs j where j.state in('dead','conflict')
 union all select 'email_dead_letter',o.terminal_at from notifications_private.outbox o where o.state in('dead','failed','bounced','complained') and o.kind<>'email_dead_letter';
create view notifications_private.sources with(security_invoker=true) as
 select * from notifications_private.customer_sources
 union all select 'admin:'||a.kind||':'||date_trunc('hour',a.occurred_at at time zone 'UTC')::text||':'||u.id,u.id,'admin',a.kind,'admin',min(a.occurred_at)
 from notifications_private.admin_signals a cross join public.user_profiles u where u.role='admin' and sec_private.admin_access_active(u.id)
 group by a.kind,date_trunc('hour',a.occurred_at at time zone 'UTC'),u.id;
create function notifications_private.buyer_order(p_key text,p_kind text,p_recipient uuid) returns uuid language sql stable security definer set search_path='' as $$
 select o.id from public.orders o where o.buyer_user_id=p_recipient and(
 (p_kind in('purchase_confirmed','assets_ready') and o.id::text=split_part(p_key,':',2)) or
 (p_kind='license_ready' and exists(select 1 from public.generated_licenses l where l.order_id=o.id and l.id::text=split_part(p_key,':',2))) or
 (p_kind in('payment_failed','payment_disputed','partial_refund','refund') and exists(select 1 from commerce_private.payment_events e join public.order_delivery_contracts c on c.id=e.contract_id where c.order_id=o.id and e.id::text=split_part(p_key,':',2))) or
 (p_kind='license_status' and exists(select 1 from licensing_private.lifecycle_events e where e.order_id=o.id and e.id::text=split_part(p_key,':',2))) or
 (p_kind in('license_status','payment_recovered') and exists(select 1 from commerce_private.state_history h join public.order_delivery_contracts c on c.id=h.contract_id where c.order_id=o.id and h.id::text=split_part(p_key,':',2)))
 ) limit 1
$$;
create function notifications_private.allowed(p notifications_private.outbox) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.user_profiles u join auth.users a on a.id=u.id where u.id=p.recipient_id and u.role::text=p.recipient_role
 and lower(a.email)=p.recipient_address and to_jsonb(a)->>'email_confirmed_at' is not null
 and (p.category='security' or sec_private.account_allowed(u.id)) and (p.category<>'admin' or sec_private.admin_access_active(u.id))
 and not exists(select 1 from notifications_private.suppressions s where s.address=p.recipient_address)
 and(p.category<>'operational' or coalesce((select operational from notifications_private.preferences where user_id=u.id),true))
 and exists(select 1 from notifications_private.sources s where s.source_key=p.source_key and s.recipient_id=u.id and s.kind=p.kind))
$$;
create function public.notification_preferences(p_operational boolean default null,p_marketing boolean default null,p_notice text default null) returns jsonb language plpgsql security definer set search_path='' as $$declare p notifications_private.preferences;begin
 if auth.role() is distinct from 'authenticated' or not public.auth_session_is_active() or public.current_app_role() not in('artist','buyer','admin') then raise exception 'Active canonical account required' using errcode='42501';end if;
 if p_operational is not null or p_marketing is not null then
 if p_notice is distinct from 'notifications-v1' then raise exception 'Current notification notice required';end if;
 insert into notifications_private.preferences(user_id,operational,marketing) values(auth.uid(),coalesce(p_operational,true),coalesce(p_marketing,false)) on conflict(user_id) do update set operational=coalesce(p_operational,notifications_private.preferences.operational),marketing=coalesce(p_marketing,notifications_private.preferences.marketing),changed_at=clock_timestamp();
 end if;
 select * into p from notifications_private.preferences where user_id=auth.uid();
 return jsonb_build_object('operational',coalesce(p.operational,true),'marketing',coalesce(p.marketing,false),'essential',true,'notice','notifications-v1','sendingEnabled',(select enabled from notifications_private.configuration));
end$$;
create function public.collect_notification_events(p_limit int default 200) returns int language plpgsql security definer set search_path='' as $$declare s record;n int:=0;c notifications_private.configuration;begin
 perform commerce_private.require_service_role();if p_limit is null or p_limit not between 1 and 200 then raise exception 'Bounded batch required';end if;
 select * into strict c from notifications_private.configuration;if not c.enabled then return 0;end if;
 perform pg_advisory_xact_lock(hashtextextended('notification-collector',0));
 for s in select x.*,lower(a.email) address from notifications_private.sources x join auth.users a on a.id=x.recipient_id join public.user_profiles u on u.id=a.id and u.role::text=x.recipient_role
 where x.occurred_at>=c.source_from and x.occurred_at<=clock_timestamp() and to_jsonb(a)->>'email_confirmed_at' is not null and a.email is not null
 and not exists(select 1 from notifications_private.outbox o where o.source_key=x.source_key)
 order by x.occurred_at,x.source_key limit p_limit loop
 insert into notifications_private.outbox(source_key,kind,category,recipient_id,recipient_role,recipient_address,occurred_at,order_id) values(s.source_key,s.kind,s.category,s.recipient_id,s.recipient_role,s.address,s.occurred_at,case when s.recipient_role='buyer' then notifications_private.buyer_order(s.source_key,s.kind,s.recipient_id) end);n:=n+1;
 end loop;
 insert into notifications_private.runs(collected) values(n);return n;
end$$;
create function public.claim_notification() returns jsonb language plpgsql security definer set search_path='' as $$declare o notifications_private.outbox;begin
 perform commerce_private.require_service_role();if not(select enabled from notifications_private.configuration) then return null;end if;
 for o in select * from notifications_private.outbox where(state in('pending','retry') and next_at<=clock_timestamp()) or(state='leased' and lease_until<=clock_timestamp()) order by next_at,id for update skip locked limit 200 loop
 if not notifications_private.allowed(o) then update notifications_private.outbox set state='canceled',code='recipient_or_source_ineligible',lease_id=null,lease_until=null,terminal_at=clock_timestamp() where id=o.id;continue;end if;
 if o.attempts>=6 or o.first_attempt_at<=clock_timestamp()-interval '20 hours' then update notifications_private.outbox set state='dead',code='idempotency_window_or_attempts_exhausted',lease_id=null,lease_until=null,terminal_at=clock_timestamp() where id=o.id;continue;end if;
 update notifications_private.outbox set state='leased',attempts=attempts+1,lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '60 seconds',first_attempt_at=coalesce(first_attempt_at,clock_timestamp()) where id=o.id returning * into o;
 insert into notifications_private.attempts(message_id,lease_id,attempt,outcome) values(o.id,o.lease_id,o.attempts,'claimed');
 return jsonb_build_object('id',o.id,'lease',o.lease_id,'kind',o.kind,'category',o.category,'to',o.recipient_address,'role',o.recipient_role,'templateVersion',o.template_version,'orderId',o.order_id,'attempt',o.attempts);
 end loop;return null;
end$$;
create function public.notification_send_allowed(p_id uuid,p_lease uuid) returns boolean language plpgsql stable security definer set search_path='' as $$declare o notifications_private.outbox;begin
 perform commerce_private.require_service_role();select * into o from notifications_private.outbox where id=p_id and lease_id=p_lease and state='leased' and lease_until>clock_timestamp();
 return found and(select enabled from notifications_private.configuration) and notifications_private.allowed(o) and o.first_attempt_at>clock_timestamp()-interval '20 hours';end$$;
create function public.notification_request_seal(p_id uuid,p_lease uuid,p_hash text) returns boolean language plpgsql security definer set search_path='' as $$declare o notifications_private.outbox;begin
 perform commerce_private.require_service_role();if p_hash is null or p_hash!~'^[a-f0-9]{64}$' then raise exception 'Provider request digest required';end if;
 select * into o from notifications_private.outbox where id=p_id for update;
 if not public.notification_send_allowed(p_id,p_lease) then return false;end if;
 if o.request_hash is not null and o.request_hash<>p_hash then update notifications_private.outbox set state='dead',code='immutable_request_changed',lease_id=null,lease_until=null,terminal_at=clock_timestamp() where id=o.id;return false;end if;
 update notifications_private.outbox set request_hash=p_hash where id=o.id;return true;end$$;
create function public.finish_notification(p_id uuid,p_lease uuid,p_outcome text,p_provider text default null) returns boolean language plpgsql security definer set search_path='' as $$declare o notifications_private.outbox;v text;begin
 perform commerce_private.require_service_role();select * into o from notifications_private.outbox where id=p_id for update;
 if not found or o.state<>'leased' or o.lease_id is distinct from p_lease or o.lease_until<=clock_timestamp() then return false;end if;
 if p_outcome is null or p_outcome not in('accepted','transient','permanent','canceled','configuration') then raise exception 'Safe outcome required';end if;
 if p_outcome='accepted' and (p_provider is null or p_provider!~'^[A-Za-z0-9_-]{1,128}$') then raise exception 'Provider identity required';end if;
 v:=case p_outcome when 'accepted' then 'accepted' when 'transient' then case when o.attempts<6 then 'retry' else 'dead' end when 'canceled' then 'canceled' else 'failed' end;
 update notifications_private.outbox set state=v,provider_id=case when p_outcome='accepted' then p_provider else provider_id end,code=p_outcome,next_at=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,o.attempts-1)::int)),lease_id=null,lease_until=null,terminal_at=case when v in('retry') then null else clock_timestamp() end where id=o.id;
 insert into notifications_private.attempts(message_id,lease_id,attempt,outcome) values(o.id,p_lease,o.attempts,p_outcome);
 -- Delivery webhooks may arrive before the HTTP response is durably acknowledged.
 if p_outcome='accepted' then perform notifications_private.apply_provider(p_provider);end if;return true;
end$$;
create function notifications_private.apply_provider(p_provider text) returns void language plpgsql security definer set search_path='' as $$declare o notifications_private.outbox;k text;begin
 select * into o from notifications_private.outbox where provider_id=p_provider for update;if not found then return;end if;
 select kind into k from notifications_private.provider_events where provider_id=p_provider and kind in('email.delivered','email.bounced','email.complained','email.failed') order by case kind when 'email.complained' then 4 when 'email.bounced' then 3 when 'email.failed' then 2 else 1 end desc,occurred_at desc limit 1;
 if k is null then return;end if;
 update notifications_private.outbox set state=case k when 'email.delivered' then 'delivered' when 'email.bounced' then 'bounced' when 'email.complained' then 'complained' else 'failed' end,code=replace(k,'email.','provider_'),terminal_at=clock_timestamp() where id=o.id;
 if k in('email.bounced','email.complained') and o.recipient_address is not null then insert into notifications_private.suppressions(address,reason) values(o.recipient_address,k) on conflict do nothing;end if;
end$$;
create function public.ingest_notification_event(p_event text,p_hash text,p_provider text,p_kind text,p_at timestamptz) returns text language plpgsql security definer set search_path='' as $$declare old notifications_private.provider_events;begin
 perform commerce_private.require_service_role();if p_event is null or p_event!~'^[A-Za-z0-9_-]{1,128}$' or p_hash is null or p_hash!~'^[a-f0-9]{64}$' or p_provider is null or p_provider!~'^[A-Za-z0-9_-]{1,128}$' or p_kind is null or p_kind not in('email.sent','email.delivered','email.bounced','email.complained','email.failed','email.delivery_delayed') or p_at is null or p_at>clock_timestamp()+interval '5 minutes' then raise exception 'Supported authenticated delivery event required';end if;
 perform pg_advisory_xact_lock(hashtextextended('email-provider:'||p_event,0));select * into old from notifications_private.provider_events where event_id=p_event;
 if found then if old.body_hash<>p_hash then insert into notifications_private.provider_conflicts(event_id,body_hash) values(p_event,p_hash) on conflict do nothing;return 'conflict';end if;return 'duplicate';end if;
 insert into notifications_private.provider_events values(p_event,p_hash,p_provider,p_kind,p_at,clock_timestamp());perform notifications_private.apply_provider(p_provider);return 'recorded';
end$$;
create function public.notification_operations() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.is_admin() then raise exception 'Current MFA full Admin required' using errcode='42501';end if;
 return jsonb_build_object('sendingEnabled',(select enabled from notifications_private.configuration),'retentionDays',(select retention_days from notifications_private.configuration),'lastCollection',(select max(created_at) from notifications_private.runs),
 'states',(select coalesce(jsonb_object_agg(state,n),'{}') from(select state,count(*) n from notifications_private.outbox group by state)x),
 'retryDue',(select count(*) from notifications_private.outbox where state='retry' and next_at<=clock_timestamp()),'conflicts',(select count(*) from notifications_private.provider_conflicts),
 'attention',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'state',state,'code',code,'attempts',attempts)),'[]') from(select * from notifications_private.outbox where state in('dead','failed','bounced','complained') order by terminal_at desc limit 50)x));end$$;
create function public.notification_retry(p_id uuid,p_reason text) returns boolean language plpgsql security definer set search_path='' as $$declare o notifications_private.outbox;begin
 if not public.is_admin() then raise exception 'Current MFA full Admin required' using errcode='42501';end if;
 if length(coalesce(p_reason,'')) not between 10 and 1000 then raise exception 'Auditable reason required';end if;
 if not public.sec_admit() then raise exception 'Notification recovery rate limited';end if;select * into o from notifications_private.outbox where id=p_id for update;
 if not found or o.state not in('retry','failed') or o.attempts>=6 or o.first_attempt_at<=clock_timestamp()-interval '20 hours' or not notifications_private.allowed(o) then raise exception 'Unsafe replay; provider reconciliation required';end if;
 update notifications_private.outbox set state='retry',next_at=clock_timestamp(),terminal_at=null where id=p_id;
 perform sec_private.log('notification_retry','notifications',p_id::text,jsonb_build_object('state',o.state),jsonb_build_object('state','retry'),p_reason,p_id::text);return true;
end$$;
create function public.notification_retention() returns int language plpgsql security definer set search_path='' as $$declare n int;begin
 perform commerce_private.require_service_role();update notifications_private.outbox set recipient_address=null where recipient_address is not null and terminal_at<clock_timestamp()-make_interval(days=>(select retention_days from notifications_private.configuration)) and state not in('pending','leased','retry');get diagnostics n=row_count;return n;
end$$;
-- Exact legacy preferences remain available, but essential receipts/security cannot be disabled and marketing is opt-in.
alter table public.buyer_notification_preferences alter column platform_updates set default false;
create function notifications_private.legacy_preferences() returns trigger language plpgsql set search_path='' as $$begin
 new.purchase_receipts:=true;new.license_agreement_ready:=true;new.security_alerts:=true;return new;end$$;
create trigger mandatory_notifications before insert or update on public.buyer_notification_preferences for each row execute function notifications_private.legacy_preferences();
-- Private schemas remain inaccessible even with a service API key. Narrow RPCs are the only entrypoints.
revoke all on all tables in schema notifications_private from public,anon,authenticated,service_role;
revoke all on all functions in schema notifications_private from public,anon,authenticated,service_role;
do $$declare f record;begin for f in select oid::regprocedure signature,proname from pg_proc where pronamespace='public'::regnamespace and proname in('notification_request_seal','notification_preferences','collect_notification_events','claim_notification','notification_send_allowed','finish_notification','ingest_notification_event','notification_operations','notification_retry','notification_retention') loop
 execute format('revoke all on function %s from public,anon,authenticated,service_role',f.signature);
 execute format('grant execute on function %s to %I',f.signature,case when f.proname in('notification_preferences','notification_operations','notification_retry') then 'authenticated' else 'service_role' end);
end loop;end$$;
commit;
