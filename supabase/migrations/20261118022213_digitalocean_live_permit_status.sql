-- Live status must stop the root process when an exact permit is revoked or
-- expires, not merely deny subsequent IO. Existing grants are preserved.
begin;
create or replace function submission_media.do_scope_status(p_run uuid,p_boot uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare r submission_media.do_runs;p submission_media.execution_permits;authorized boolean:=false;begin
 select * into r from submission_media.do_runs where (id=p_run or p_run is null and state='issued') and boot_id=p_boot order by created_at limit 1;
 select * into p from submission_media.execution_permits where id=r.permit_id;
 begin
 perform submission_media.do_require(p_boot);
 authorized:=r.state='issued' and p.state in ('requested','claimed') and p.expires_at>clock_timestamp() and p.dispatcher_subject='620470021' and p.execution_name=('digitalocean/nyc3/droplets/620470021/boots/'||p_boot||'/executions/'||r.id);
 exception when others then authorized:=false;end;
 return jsonb_build_object('state',coalesce(r.state,'none'),'run_id',r.id,'authorized',coalesce(authorized,false));
end$$;
commit;
