-- Fail-closed rollback, preserving every job, permit, run and liability.
-- Stop the exact DO launcher/worker first and confirm no running parser.
begin;
set local lock_timeout='5s';
update submission_media.do_control set enabled=false where singleton;
alter role media_broker_do_login nologin connection limit 0;
do $$declare f regprocedure;begin for f in
 select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='submission_media' and p.proname like 'do\_%' escape '\'
 loop execute format('revoke all on function %s from media_broker_do_login',f);end loop;end$$;
-- Deliberately retain the DO execution-name branch: historical permit rows must
-- remain valid. It grants no authority without role access and live do_control.
-- Restore the captured global capability flags only if they still match the
-- exact activation receipt; do not overwrite another operator's later decision.
commit;
