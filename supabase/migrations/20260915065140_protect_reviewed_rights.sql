-- Freeze reviewed rights against direct artist Data API writes, including archive
-- transitions. Trusted application edits already demote the track before replacing
-- its rights collection; admin/service-role workflows retain that capability.
begin;

create schema if not exists security_private;
revoke all on schema security_private from public;

create or replace function security_private.guard_reviewed_rights()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_ids uuid[] := '{}';
  parent record;
begin
  if auth.role() = 'service_role' or public.is_admin() then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op <> 'INSERT' then parent_ids := array_append(parent_ids, old.track_id); end if;
  if tg_op <> 'DELETE' then parent_ids := array_append(parent_ids, new.track_id); end if;

  -- Lock in deterministic order, including BOTH sides of a track_id reassignment.
  -- This serializes untrusted child writes with parent approval/status updates.
  for parent in
    select id, artist_user_id, status, approved_at
    from public.tracks where id = any(parent_ids)
    order by id for update
  loop
    if auth.uid() is null or parent.artist_user_id is distinct from auth.uid() then
      raise exception 'Artists may only edit rights for their own tracks.' using errcode = '42501';
    end if;
    if parent.status = 'approved' or parent.approved_at is not null then
      raise exception 'Reviewed rights must be changed through the track edit and review workflow.' using errcode = '42501';
    end if;
  end loop;

  -- RLS and the existing FK still reject missing/unauthorized INSERT/UPDATE parents.
  -- A missing DELETE parent is allowed for an authorized track-delete cascade.
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function security_private.guard_reviewed_rights() from public, anon, authenticated;
drop trigger if exists guard_reviewed_rights on public.rights_holders;
create trigger guard_reviewed_rights
before insert or update or delete on public.rights_holders
for each row execute function security_private.guard_reviewed_rights();

commit;
