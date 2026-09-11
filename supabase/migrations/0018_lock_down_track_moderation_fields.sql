-- Prevent artists from bypassing admin review by directly mutating moderation fields.
-- Artists may create drafts, submit for review, update artist-controlled metadata,
-- and archive their own tracks. Approval, featured placement, and ownership changes
-- remain controlled by trusted admin/server workflows.

begin;

create or replace function public.guard_track_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rights_total numeric(7,2);
begin
  -- Service-role operations and verified admins are trusted moderation paths.
  if auth.role() = 'service_role' or public.is_admin() then
    if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
      select coalesce(sum(ownership_percent), 0)
      into rights_total
      from public.rights_holders
      where track_id = new.id;

      if abs(rights_total - 100) > 0.01 then
        raise exception 'Approved tracks must have rights holder ownership totals equal to 100%%.';
      end if;

      new.approved_at = coalesce(new.approved_at, now());
      new.approved_by = coalesce(new.approved_by, auth.uid());
    end if;

    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.artist_user_id <> auth.uid() then
      raise exception 'Artists may only create their own tracks.';
    end if;

    if new.status not in ('draft', 'pending_review') then
      raise exception 'Artists may only create drafts or submit tracks for review.';
    end if;

    if new.approved_at is not null or new.approved_by is not null then
      raise exception 'Approval fields are managed by admin workflows only.';
    end if;

    if new.featured then
      raise exception 'Featured state is managed by admins.';
    end if;

    return new;
  end if;

  if old.artist_user_id <> auth.uid() then
    raise exception 'Artists may only update their own tracks.';
  end if;

  if new.artist_user_id is distinct from old.artist_user_id then
    raise exception 'Track ownership cannot be changed by artists.';
  end if;

  if new.approved_at is distinct from old.approved_at or new.approved_by is distinct from old.approved_by then
    raise exception 'Approval fields are managed by admin workflows only.';
  end if;

  if new.featured is distinct from old.featured then
    raise exception 'Featured state is managed by admins.';
  end if;

  if old.status = 'approved' then
    if new.status <> 'archived' then
      raise exception 'Approved tracks may only be archived by artists.';
    end if;

    return new;
  end if;

  if new.status not in ('draft', 'pending_review', 'archived') then
    raise exception 'Artists may only save drafts, submit for review, or archive their own tracks.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_tracks_write on public.tracks;
create trigger guard_tracks_write
before insert or update on public.tracks
for each row execute function public.guard_track_write();

drop policy if exists "Artists can insert their own tracks" on public.tracks;
create policy "Artists can insert their own tracks"
on public.tracks
for insert
to authenticated
with check (
  auth.uid() = artist_user_id
  and status in ('draft', 'pending_review')
  and featured = false
  and approved_at is null
  and approved_by is null
);

drop policy if exists "Artists and admins can update owned tracks" on public.tracks;
create policy "Artists and admins can update owned tracks"
on public.tracks
for update
to authenticated
using (
  public.is_admin()
  or auth.uid() = artist_user_id
)
with check (
  public.is_admin()
  or auth.uid() = artist_user_id
);

comment on function public.guard_track_write() is
  'Prevents non-admin artists from mutating moderation fields, self-approving tracks, changing ownership, or featuring tracks through direct Supabase writes.';

commit;
