-- Read-only executive reporting. No ledger, policy, capability, provider or payout mutation.
begin;
set local lock_timeout='5s';
create or replace function finance_private.command_center_rows(p_start timestamptz,p_end timestamptz,p_mode text,p_currency text,p_account text,p_status text)
returns table(order_id uuid,occurred_at timestamptz,currency text,provider_account text,track_title text,buyer text,artist text,status text,paid boolean,gross_minor numeric,commission_minor numeric,earnings_minor numeric,obligations_minor numeric,refund_minor numeric,dispute_minor numeric,recovery_minor numeric,matched boolean,ledger_missing boolean)
language sql stable security definer set search_path='' as $$
 with candidates as (
 select c.*,x.provider_account,
 coalesce(e.paid_at,c.created_at) occurred_at,coalesce(e.paid,false) paid,coalesce(e.refunded,0) refunded,
 coalesce(e.last_state,'PENDING') last_state,
 buyer.full_name buyer_name,seller.full_name artist_name,
 b.order_id book_id,l.commission,l.earnings,l.obligations,l.dispute,l.recovery,l.last_journal,
 r.at reconciled_at,r.result
 from public.order_delivery_contracts c
 join commerce_private.contract_context x on x.contract_id=c.id
 left join public.user_profiles buyer on buyer.id=c.buyer_user_id
 left join public.user_profiles seller on seller.id=c.seller_user_id
 left join finance_private.books b on b.order_id=c.order_id and b.created_at<p_end
 left join lateral (
 select bool_or(payment_state='PAID') paid,min(provider_created_at) filter(where payment_state='PAID') paid_at,
 max(refunded_minor) refunded,(array_agg(payment_state order by provider_created_at desc,received_at desc,id desc))[1] last_state
 from commerce_private.payment_events e where e.contract_id=c.id and e.provider_created_at<p_end
 and e.provider_account=x.provider_account and e.payment_mode=c.payment_mode and e.currency=c.currency and e.amount_minor=c.amount_minor
 ) e on true
 left join lateral (
 select -coalesce(sum(v.amount) filter(where v.account='platform_revenue'),0) commission,
 -coalesce(sum(v.amount) filter(where v.account like 'payable:%' or v.account like 'reserved:%' or v.account='payout_clearing'),0) earnings,
 coalesce(sum(greatest(-v.amount,0)) filter(where v.account like 'payable:%' or v.account like 'reserved:%' or v.account='payout_clearing'),0) obligations,
 coalesce(sum(v.amount) filter(where v.account='dispute_receivable'),0) dispute,
 coalesce(sum(greatest(v.amount,0)) filter(where v.account like 'payable:%'),0) recovery,max(v.at) last_journal
 from (select l.account,sum(l.signed_minor) amount,max(j.created_at) at from finance_private.lines l join finance_private.journals j on j.id=l.journal_id
 where l.order_id=c.order_id and j.created_at<p_end group by l.account) v
 ) l on true
 left join lateral (
 select v.at,v.result from (
 select created_at at,result from finance_private.reconciliations where order_id=c.order_id and created_at<p_end
 union all select created_at,result from finance_private.provider_reconciliations where order_id=c.order_id and created_at<p_end
 ) v order by v.at desc limit 1
 ) r on true
 where c.payment_mode=p_mode and (p_currency is null or c.currency=p_currency) and (p_account is null or x.provider_account=p_account)
 and not exists(select 1 from commerce_private.acceptance_grants g where g.order_id=c.order_id)
 ), classified as (
 select *,case when last_state='DISPUTED' or dispute>0 then 'disputed' when refunded>=amount_minor then 'refunded' when refunded>0 then 'partially_refunded'
 when paid then 'paid' when last_state='PAYMENT_FAILED' then 'failed' else 'pending' end payment_status
 from candidates
 )
 select order_id,occurred_at,currency,provider_account,track_title,coalesce(buyer_name,'Buyer account'),coalesce(artist_name,'Artist account'),payment_status,paid,
 case when paid then amount_minor else 0 end::numeric,commission,earnings,obligations,refunded::numeric,dispute,recovery,
 coalesce((result->>'matched')::boolean and reconciled_at>=last_journal,false),
 paid and (book_id is null or not exists(select 1 from finance_private.journals j where j.order_id=classified.order_id and j.economic_key='purchase' and j.created_at<p_end))
 from classified where occurred_at>=p_start and occurred_at<p_end and (p_status='all' or payment_status=p_status)
$$;
revoke all on function finance_private.command_center_rows(timestamptz,timestamptz,text,text,text,text) from public,anon,authenticated,service_role;

create or replace function public.sec_financial_command_center(p_start timestamptz,p_end timestamptz,p_mode text default 'test',p_currency text default null,p_account text default null,p_status text default 'all',p_source text default 'all',p_interval text default 'day',p_page integer default 1,p_search text default '') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform finance_private.require_admin();
 if p_start is null or p_end is null or p_start>=p_end or p_end-p_start>interval '366 days'
 or p_mode is null or p_mode not in('test','live') or p_status is null or p_status not in('all','paid','pending','failed','refunded','partially_refunded','disputed')
 or p_source is null or p_source not in('all','marketplace','subscriptions') or p_interval is null or p_interval not in('day','week','month','year')
 or p_page is null or p_page<1 or p_page>1000000 or p_search is null or length(p_search)>120
 or (p_currency is not null and p_currency!~'^[A-Z]{3}$') or (p_account is not null and p_account!~'^acct_[A-Za-z0-9]{1,100}$') then
 raise exception 'Invalid financial reporting filters' using errcode='22023';end if;
 with current_rows as materialized (
 select * from finance_private.command_center_rows(p_start,p_end,p_mode,p_currency,p_account,p_status) where p_source<>'subscriptions'
 ), previous_rows as materialized (
 select * from finance_private.command_center_rows(p_start-(p_end-p_start),p_start,p_mode,p_currency,p_account,p_status) where p_source<>'subscriptions'
 ), periods as (
 select 'current' period,* from current_rows union all select 'previous',* from previous_rows
 ), totals as (
 select period,currency,count(*) orders,count(*) filter(where paid) paid,count(*) filter(where status='failed') failed,count(*) filter(where status='pending') pending,
 count(*) filter(where status in('refunded','partially_refunded')) refunded,count(*) filter(where status='disputed') disputed,
 count(*) filter(where matched) matched,count(*) filter(where not matched) unmatched,count(*) filter(where ledger_missing) missing,
 sum(gross_minor)::text gross,sum(commission_minor)::text commission,sum(earnings_minor)::text earnings,
 sum(obligations_minor)::text obligations,sum(refund_minor)::text refunds,sum(dispute_minor)::text disputes,sum(recovery_minor)::text recovery
 from periods group by period,currency
 ), series as (
 select date_trunc(p_interval,occurred_at at time zone 'UTC') at time zone 'UTC' at,currency,
 sum(gross_minor)::text gross,sum(commission_minor)::text commission,sum(earnings_minor)::text earnings,sum(refund_minor)::text refunds,
 count(*) filter(where paid) paid,count(*) filter(where status='failed') failed,count(*) filter(where status='disputed') disputed
 from current_rows group by 1,2
 ), searched as (
 select * from current_rows where p_search='' or position(lower(p_search) in lower(order_id::text||' '||track_title||' '||buyer||' '||artist))>0
 ), page as (
 select * from searched order by occurred_at desc,order_id desc limit 25 offset (p_page-1)::bigint*25
 )
 select jsonb_build_object('state',case when p_mode='live' or p_source='subscriptions' then 'unavailable' else 'available' end,
 'basis','Orders first paid (or opened while unpaid) during the period; payment and ledger status through period end. Previous period uses its own cutoff. Not cash-flow or net profit.',
 'totals',coalesce((select jsonb_agg(to_jsonb(t) order by period,currency) from totals t),'[]'),
 'series',coalesce((select jsonb_agg(to_jsonb(s) order by at,currency) from series s),'[]'),
 'transactions',coalesce((select jsonb_agg(jsonb_build_object('id',order_id,'date',occurred_at,'currency',currency,'account',provider_account,'track',track_title,'buyer',buyer,'artist',artist,'status',status,'gross',gross_minor::text,'commission',case when ledger_missing then null else commission_minor::text end,'earnings',case when ledger_missing then null else earnings_minor::text end,'refunds',refund_minor::text,'disputes',dispute_minor::text,'obligations',obligations_minor::text,'matched',matched,'ledgerMissing',ledger_missing) order by occurred_at desc,order_id desc) from page),'[]'),
 'total',(select count(*) from searched),'page',p_page,'size',25,
 'options',jsonb_build_object('currencies',(select coalesce(jsonb_agg(distinct c.currency),'[]') from public.order_delivery_contracts c where c.payment_mode=p_mode),
 'accounts',(select coalesce(jsonb_agg(distinct x.provider_account),'[]') from commerce_private.contract_context x join public.order_delivery_contracts c on c.id=x.contract_id where c.payment_mode=p_mode)),
 'subscriptionsAvailable',false,'payoutsAvailable',false)
 into result;
 return result;
end$$;
revoke all on function public.sec_financial_command_center(timestamptz,timestamptz,text,text,text,text,text,text,integer,text) from public,anon,service_role;
grant execute on function public.sec_financial_command_center(timestamptz,timestamptz,text,text,text,text,text,text,integer,text) to authenticated;
comment on function public.sec_financial_command_center(timestamptz,timestamptz,text,text,text,text,text,text,integer,text) is 'Read-only full-admin financial reporting. Cohort-based, currency-separated, paginated. No financial mutations.';
commit;
