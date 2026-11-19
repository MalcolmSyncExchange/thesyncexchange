begin;
-- Aggregate operator telemetry only. No credentials, paths, job IDs or writes.
create or replace function submission_media.do_health(p_boot uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c submission_media.do_control; result jsonb;
begin
 select * into c from submission_media.do_control where singleton;
 if not found or c.host_id<>'620470021' or c.boot_id is distinct from p_boot then
  raise exception 'DO_IDENTITY_DENIED' using errcode='42501';
 end if;
 with eligible as (
  select j.* from submission_media.jobs j join submission_media.submissions s on s.id=j.submission_id
  where s.owner_id=c.allowed_owner and s.deleted_at is null and j.created_at>=c.jobs_after
  and exists(select 1 from submission_media.assets a join submission_media.upload_files f on f.asset_id=coalesce(a.source_asset_id,a.id)
   where a.id=j.asset_id and f.submission_id=s.id and f.retired_at is null)
 ), recent as (
  select * from eligible where completed_at>=clock_timestamp()-interval '24 hours'
 ) select jsonb_build_object(
  'queue_depth',(select count(*) from eligible where state in ('queued','retry_wait')),
  'oldest_queued_seconds',coalesce((select greatest(0,extract(epoch from clock_timestamp()-min(created_at))) from eligible where state in ('queued','retry_wait')),0),
  'running',(select count(*) from eligible where state='running'),
  'completed_24h',(select count(*) from recent where state='succeeded'),
  'failed_24h',(select count(*) from recent where state='failed'),
  'mean_processing_seconds',(select avg(extract(epoch from completed_at-started_at)) from recent where state='succeeded'),
  'observed_at',clock_timestamp()
 ) into result;
 return result;
end$$;
revoke all on function submission_media.do_health(uuid) from public,anon,authenticated,service_role;
grant execute on function submission_media.do_health(uuid) to media_broker_do_login;
comment on function submission_media.do_health(uuid) is 'Read-only founder-scope aggregate queue telemetry. Does not authorize or claim work.';
commit;
