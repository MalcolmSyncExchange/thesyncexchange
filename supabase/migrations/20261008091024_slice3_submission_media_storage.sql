-- Slice 3 C: protection for FUTURE private buckets; creates NO buckets/objects.
-- RLS alone does not protect signed/service uploads. Trigger seals exact object versions.
begin;
grant create on schema submission_media to submission_media_executor;
create or replace function submission_media.storage_insert_allowed(p_bucket text,p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from submission_media.assets a join submission_media.submissions s on s.id=a.submission_id
 join public.user_profiles u on u.id=s.owner_id
 where a.bucket=p_bucket and a.object_path=p_path and a.origin='upload' and a.technical_state='reserved'
 and a.reservation_expires_at>now() and s.owner_id=auth.uid() and u.role::text='artist'
 and exists(select 1 from submission_media.capabilities where singleton and reservations_enabled))
$$;
create or replace function submission_media.guard_storage_object() returns trigger
language plpgsql security definer set search_path = '' as $$
declare a submission_media.assets; relevant boolean; begin
  relevant:=case when tg_op='DELETE' then old.bucket_id in ('submission-source','submission-artwork','submission-derived')
    when tg_op='UPDATE' then old.bucket_id in ('submission-source','submission-artwork','submission-derived') or new.bucket_id in ('submission-source','submission-artwork','submission-derived')
    else new.bucket_id in ('submission-source','submission-artwork','submission-derived') end;
  -- Also seal explicitly adopted legacy sources without affecting other legacy objects.
  if not relevant then
    if tg_op<>'INSERT' then select * into a from submission_media.assets where bucket=old.bucket_id and object_path=old.name and origin='legacy_adoption'; end if;
    if a.id is null then if tg_op='DELETE' then return old; else return new; end if; end if;
  end if;
  if tg_op='DELETE' then raise exception 'Submission media is retained' using errcode='42501'; end if;
  if tg_op='UPDATE' then
    if (new.id,new.bucket_id,new.name,new.version,new.owner,new.owner_id,new.metadata->'size',new.metadata->'mimetype') is distinct from
      (old.id,old.bucket_id,old.name,old.version,old.owner,old.owner_id,old.metadata->'size',old.metadata->'mimetype') then
      raise exception 'Immutable submission Storage object' using errcode='42501';
    end if;
    return new;
  end if;
  select * into a from submission_media.assets where bucket=new.bucket_id and object_path=new.name for update;
  if not found or a.technical_state not in ('reserved','verifying') or a.storage_object_id is not null or a.reservation_expires_at<=clock_timestamp() then
    raise exception 'Exact live reservation required' using errcode='42501';
  end if;
  if a.origin='upload' then
    if not exists(select 1 from submission_media.capabilities where singleton and reservations_enabled) or
      coalesce(new.owner_id,new.owner::text) is distinct from (select owner_id::text from submission_media.submissions where id=a.submission_id) then
      raise exception 'Reservation owner mismatch' using errcode='42501'; end if;
  elsif a.origin='generated' then
    if not exists(select 1 from submission_media.capabilities where singleton and worker_enabled) or not exists
      (select 1 from submission_media.jobs where asset_id=a.id and state='running' and lease_expires_at>clock_timestamp()) then
      raise exception 'Assigned live derivative job required' using errcode='42501'; end if;
  else raise exception 'Legacy object cannot be recreated' using errcode='42501'; end if;
  return new;
end $$;
alter function submission_media.storage_insert_allowed(text,text) owner to submission_media_executor;
alter function submission_media.guard_storage_object() owner to submission_media_executor;
revoke all on function submission_media.storage_insert_allowed(text,text),submission_media.guard_storage_object() from public,anon,authenticated,service_role,submission_media_broker;
grant execute on function submission_media.storage_insert_allowed(text,text) to authenticated;
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
drop policy if exists submission_media_executor_objects on storage.objects;
create policy submission_media_executor_objects on storage.objects for select to submission_media_executor
 using (exists(select 1 from submission_media.assets where bucket=bucket_id and object_path=name));
-- Discovery of the legacy exact object before reservation is authorized by own track.
drop policy if exists submission_media_executor_legacy on storage.objects;
create policy submission_media_executor_legacy on storage.objects for select to submission_media_executor
 using (bucket_id='track-audio' and exists(select 1 from public.tracks t where t.artist_user_id=auth.uid() and t.audio_file_path=name));
drop trigger if exists guard_submission_media_object on storage.objects;
create trigger guard_submission_media_object before insert or update or delete on storage.objects for each row execute function submission_media.guard_storage_object();
revoke create on schema submission_media from submission_media_executor;
commit;
