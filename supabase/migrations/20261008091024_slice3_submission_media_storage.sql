-- Slice 3 C: database-side Storage contracts only. NO provider-owned DDL.
-- Policies/trigger attachment live in the separately authorized Gate 2 setup artifact.
begin;
do $$ begin if current_user <> 'postgres' then raise exception 'Verified postgres installer required' using errcode='55000'; end if; end $$;
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
alter function submission_media.storage_insert_allowed(text,text) owner to postgres;
alter function submission_media.guard_storage_object() owner to postgres;
revoke all on function submission_media.storage_insert_allowed(text,text),submission_media.guard_storage_object() from public,anon,authenticated,service_role,submission_media_broker;
grant execute on function submission_media.storage_insert_allowed(text,text) to authenticated;
-- Gate 2 can inspect dormancy without direct lifecycle-table grants.
create or replace function submission_media.storage_setup_ready() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from submission_media.capabilities where singleton and
   not reservations_enabled and not worker_enabled and not activation_enabled and not foundation_reads_enabled)
$$;
revoke all on function submission_media.storage_setup_ready() from public,anon,authenticated,service_role,submission_media_broker;
-- The provider Storage owner receives ONLY setup/trigger-call authority, no tables.
grant usage on schema submission_media to supabase_storage_admin;
grant execute on function submission_media.guard_storage_object(),submission_media.storage_setup_ready() to supabase_storage_admin;
commit;
