-- PROPOSED ONLY. Requires separate founder production authorization.
-- Target: sgpubcpldfxcuhjjdcau. Run only after backup, migration, private
-- bucket/policy verification, and publication of the approved application.
begin;
do $$
declare c submission_media.capabilities;
begin
 select * into strict c from submission_media.capabilities where singleton for update;
 if c.reservations_enabled or c.foundation_reads_enabled or c.worker_enabled or c.activation_enabled then
  raise exception 'Unexpected media capability baseline';
 end if;
 if (select count(*) from supabase_migrations.schema_migrations)<>49 or not exists
  (select 1 from supabase_migrations.schema_migrations where version='20261026021846') then
  raise exception 'Workspace migration ledger checkpoint failed';
 end if;
 if (select count(*) from storage.buckets where not public and
   ((id='submission-source' and file_size_limit=50000000) or
    (id='submission-artwork' and file_size_limit=10000000) or
    (id='submission-derived' and file_size_limit=4000000)))<>3 then
  raise exception 'Private bucket checkpoint failed';
 end if;
 if not exists(select 1 from pg_catalog.pg_trigger where
  tgrelid='storage.objects'::regclass and tgname='guard_submission_media_object' and
  tgenabled='O' and tgfoid='submission_media.guard_storage_object()'::regprocedure) then
  raise exception 'Storage guard checkpoint failed';
 end if;
 update submission_media.capabilities set foundation_reads_enabled=true,
  reservations_enabled=true,updated_at=clock_timestamp() where singleton;
end $$;
select reservations_enabled,foundation_reads_enabled,worker_enabled,activation_enabled
 from submission_media.capabilities where singleton;
commit;
