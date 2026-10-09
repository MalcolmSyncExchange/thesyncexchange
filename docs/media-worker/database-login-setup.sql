-- NON-EXECUTED SETUP ARTIFACT. Separate authorization; never run from the app.
-- Run only after all reviewed media migrations. Password/secret provisioning is separate.
begin;
do $$ begin
 if current_user<>'postgres' or exists(select 1 from pg_catalog.pg_roles where rolname='media_broker_staging_login') then
  raise exception 'Verified installer and absent login required' using errcode='55000'; end if;
end $$;
create role media_broker_staging_login login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls password null;
grant connect on database postgres to media_broker_staging_login;
-- No membership in submission_media_broker: its local legacy claim API is excluded.
grant usage on schema submission_media to media_broker_staging_login;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='submission_media' and p.proname in
 ('create_execution_permit','request_execution','bind_execution','claim_targeted_job','resolve_execution_lease','complete_execution','read_execution','inspect_worker_output','heartbeat_job','resolve_worker_io','record_worker_output') loop
 execute format('grant execute on function %s to media_broker_staging_login',f.signature);
 end loop;
 if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='submission_media' and p.proname in
 ('create_execution_permit','request_execution','bind_execution','claim_targeted_job','resolve_execution_lease','complete_execution','read_execution','inspect_worker_output','heartbeat_job','resolve_worker_io','record_worker_output'))<>11 then
 raise exception 'Exact reviewed RPC inventory required'; end if;
end $$;
-- No auth/Storage usage, table grants, generic claim or role membership.
commit;
