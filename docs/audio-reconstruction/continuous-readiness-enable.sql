begin;
do $$
declare c submission_media.do_control; projection numeric;
begin
 select * into c from submission_media.do_control where singleton for update;
 if not found or c.enabled or c.host_id<>'620470021'
 or c.root_uuid is distinct from '59134bd0-a76f-4ea0-8e4a-770b2e1eafc2'::uuid
 or c.boot_id is distinct from 'c9f16c23-0c25-416c-b22e-b23a705b15cf'::uuid
 or c.worker_digest is distinct from 'sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876'
 or c.broker_digest is distinct from 'sha256:648c94c3d3950e7547fd0fe63cacd21592f2c64c47ef9d4cb35865a741b98e51'
 or c.allowed_owner is distinct from '5ebe50a3-0499-4ac1-850e-701480d6055d'::uuid
 or c.jobs_after is distinct from '2026-11-19T06:01:59.292215Z'::timestamptz
 or c.expires_at is distinct from '2026-12-01T00:00:00Z'::timestamptz
 or c.month<>'2026-11' or c.month<>to_char(clock_timestamp() at time zone 'UTC','YYYY-MM')
 or c.monthly_ceiling_usd<>20 or c.fixed_reserve_usd<>12 or c.carry_forward_usd is distinct from 1::numeric
 or not c.accounting_reconciled or c.historical_google_liabilities<>'UNKNOWN_PRESERVED_NOT_OFFSET'
 or c.observed_at is null or c.observed_at>clock_timestamp() or c.observed_at<clock_timestamp()-interval '90 seconds'
 or exists(select 1 from submission_media.do_runs where state='issued') then
 raise exception 'CONTINUOUS_ACTIVATION_PREFLIGHT_DENIED'; end if;
 projection:=c.fixed_reserve_usd+c.carry_forward_usd+coalesce((select sum(reserved_usd) from submission_media.do_runs where month=c.month),0)+c.traffic_bytes::numeric/1000000000*.09+c.log_bytes::numeric/1073741824*.5;
 if projection is null or projection+.41>20 then raise exception 'CONTINUOUS_ACTIVATION_BUDGET_DENIED';end if;
 update submission_media.do_control set broker_digest='sha256:1cbce62cbdb4ca1a9e6e9334625f76a30966e53cf216dea85e75d9dc97c0a015',expires_at='2026-12-01T00:00:00Z',enabled=true where singleton;
end$$;
commit;
