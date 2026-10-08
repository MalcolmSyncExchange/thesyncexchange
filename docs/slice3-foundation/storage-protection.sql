-- GATE 2 ONLY. NOT an ordinary database migration; NOT executed by this authoring.
-- Apply only through an independently verified, supported owner-authorized Storage
-- mechanism. Ordinary postgres has no Storage-owner authority on this project.
begin;
do $$ begin
  if not pg_catalog.pg_has_role(current_user,(select relowner from pg_catalog.pg_class where oid='storage.objects'::regclass),'USAGE') then
    raise exception 'Storage-owner authority required; ordinary foundation install cannot configure Storage' using errcode='42501';
  end if;
  if not submission_media.storage_setup_ready() then
    raise exception 'Storage setup requires all media capabilities OFF' using errcode='55000';
  end if;
end $$;
-- Existing broad permissive policies cannot authorize a new bucket accidentally.
drop policy if exists submission_media_private_reads on storage.objects;
create policy submission_media_private_reads on storage.objects as restrictive for select to anon,authenticated
 using (bucket_id not in ('submission-source','submission-artwork','submission-derived'));
drop policy if exists submission_media_bound_insert on storage.objects;
create policy submission_media_bound_insert on storage.objects as restrictive for insert to authenticated
 with check (bucket_id not in ('submission-source','submission-artwork','submission-derived') or submission_media.storage_insert_allowed(bucket_id,name));
drop policy if exists submission_media_upload_insert on storage.objects;
create policy submission_media_upload_insert on storage.objects for insert to authenticated
 with check (submission_media.storage_insert_allowed(bucket_id,name));
drop policy if exists submission_media_no_update on storage.objects;
create policy submission_media_no_update on storage.objects as restrictive for update to anon,authenticated
 using (bucket_id not in ('submission-source','submission-artwork','submission-derived'))
 with check (bucket_id not in ('submission-source','submission-artwork','submission-derived'));
drop policy if exists submission_media_no_delete on storage.objects;
create policy submission_media_no_delete on storage.objects as restrictive for delete to anon,authenticated
 using (bucket_id not in ('submission-source','submission-artwork','submission-derived'));
drop trigger if exists guard_submission_media_object on storage.objects;
create trigger guard_submission_media_object before insert or update or delete on storage.objects for each row execute function submission_media.guard_storage_object();
commit;
-- NO bucket creation, object mutation, capability activation or worker execution.
