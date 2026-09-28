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

  if tg_op = 'INSERT' and (new.approval_status <> 'pending' or new.user_id is not null) then
    raise exception 'Rights approval requires the rights workflow.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (new.approval_status is distinct from old.approval_status or new.user_id is distinct from old.user_id) then
    raise exception 'Rights approval and account links require the rights workflow.' using errcode = '42501';
  end if;

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



-- Replace historical broad object grants; application uploads use authorized server actions.
drop policy if exists "Public avatars are readable" on storage.objects;
drop policy if exists "Owners can manage avatars" on storage.objects;
drop policy if exists "Admins can manage avatars" on storage.objects;
drop policy if exists "Public cover art is readable" on storage.objects;
drop policy if exists "Artists can manage cover art" on storage.objects;
drop policy if exists "Admins can manage cover art" on storage.objects;
drop policy if exists "Public track previews are readable" on storage.objects;
drop policy if exists "Artists can manage track previews" on storage.objects;
drop policy if exists "Admins can manage track previews" on storage.objects;
drop policy if exists "Artists can manage private track audio" on storage.objects;
drop policy if exists "Admins can manage private track audio" on storage.objects;
drop policy if exists "Admins can manage agreements" on storage.objects;
-- Storage RLS must protect persisted media even when callers bypass app cleanup.
-- Apply after storage-owner policies; restrictive policies also survive reapplying
-- those older permissive policy bundles. New uploads and unreferenced cleanup remain.

create schema if not exists security_private;
revoke all on schema security_private from public;
grant usage on schema security_private to authenticated;

-- Legacy *_url values survived the migration to *_path columns. Resolve Storage
-- URL aliases to object names as well as comparing raw object paths. Hosts/buckets
-- are deliberately not trusted here: conservative matching supports custom domains
-- and configured bucket aliases. It can protect same-named objects in other buckets.
create or replace function security_private.track_asset_object_names(reference text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  url_path text;
  decoded bytea := ''::bytea;
  part text;
  parts text[] := array[]::text[];
  candidates text[];
  names text[] := array[]::text[];
  i integer := 1;
begin
  if reference is null or reference !~* '^https?://' then
    return array[reference];
  end if;
  -- Browsers normalize literal backslashes in HTTP URLs before requesting them.
  url_path := replace(reference, chr(92), '/');
  url_path := regexp_replace(url_path, '^https?://[^/]*', '', 'i');
  url_path := split_part(split_part(url_path, '?', 1), '#', 1);
  while i <= length(url_path) loop
    if substr(url_path, i, 1) = '%' and substr(url_path, i + 1, 2) ~ '^[0-9a-fA-F]{2}$' then
      decoded := decoded || decode(substr(url_path, i + 1, 2), 'hex');
      i := i + 3;
    else
      decoded := decoded || convert_to(substr(url_path, i, 1), 'UTF8');
      i := i + 1;
    end if;
  end loop;
  url_path := convert_from(decoded, 'UTF8');
  candidates := array[url_path];
  foreach part in array string_to_array(url_path, '/') loop
    if part = '..' then
      parts := parts[1:greatest(coalesce(array_length(parts, 1), 0) - 1, 1)];
    elsif part <> '.' then
      parts := array_append(parts, part);
    end if;
  end loop;
  candidates := array_append(candidates, array_to_string(parts, '/'));
  foreach url_path in array candidates loop
    if url_path ~ '^/storage/v1/object/(public|sign|authenticated)/[^/]+/.+' then
      names := array_append(names, regexp_replace(url_path, '^/storage/v1/object/(public|sign|authenticated)/[^/]+/', ''));
    elsif url_path ~ '^/storage/v1/render/image/(public|sign|authenticated)/[^/]+/.+' then
      names := array_append(names, regexp_replace(url_path, '^/storage/v1/render/image/(public|sign|authenticated)/[^/]+/', ''));
    elsif url_path ~ '^/storage/v1/object/[^/]+/.+' then
      names := array_append(names, regexp_replace(url_path, '^/storage/v1/object/[^/]+/', ''));
    end if;
  end loop;
  return names;
exception when character_not_in_repertoire or untranslatable_character then
  -- A malformed legacy URL must not make unrelated uploads/cleanup unavailable.
  return null;
end;
$$;
revoke all on function security_private.track_asset_object_names(text) from public, anon, authenticated;

create or replace function security_private.is_referenced_track_asset(object_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tracks t
    cross join lateral unnest(array[t.audio_file_path, t.preview_file_path,
      t.waveform_path, t.cover_art_path]) as asset(reference)
    where asset.reference = object_path
      or object_path = any(security_private.track_asset_object_names(asset.reference))
  );
$$;

-- The function sees references independently of the caller's tracks RLS. Comparing
-- paths across buckets is intentionally conservative and supports configured bucket
-- aliases without silently missing the app's media. Avatars use a separate namespace.
revoke all on function security_private.is_referenced_track_asset(text) from public, anon, authenticated;
grant execute on function security_private.is_referenced_track_asset(text) to authenticated;

drop policy if exists "Referenced track media cannot be overwritten" on storage.objects;
create policy "Referenced track media cannot be overwritten"
on storage.objects as restrictive for update to authenticated
using (public.is_admin() or not security_private.is_referenced_track_asset(name))
with check (public.is_admin() or not security_private.is_referenced_track_asset(name));

drop policy if exists "Referenced track media cannot be deleted" on storage.objects;
create policy "Referenced track media cannot be deleted"
on storage.objects as restrictive for delete to authenticated
using (public.is_admin() or not security_private.is_referenced_track_asset(name));

drop policy if exists "Referenced track media cannot be recreated" on storage.objects;
create policy "Referenced track media cannot be recreated"
on storage.objects as restrictive for insert to authenticated
with check (public.is_admin() or not security_private.is_referenced_track_asset(name));

-- Signed upload redemption uses Storage's privileged DB connection. RLS alone
-- cannot protect against an upsert token minted before submission/approval.
-- No admin/service-role exception: use a NEW object path for media replacement.
create or replace function security_private.guard_referenced_media_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if security_private.is_referenced_track_asset(new.name) then
      raise exception 'Referenced track media cannot be recreated or overwritten. Upload to a new path.' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if security_private.is_referenced_track_asset(old.name) then
      raise exception 'Referenced track media cannot be deleted.' using errcode = '42501';
    end if;
    return old;
  end if;

  -- Storage maintains access timestamps and other metadata on reads. Protect the
  -- content locator/version, while allowing updates that do not change the bytes.
  if (new.name is distinct from old.name or new.bucket_id is distinct from old.bucket_id
      or new.version is distinct from old.version)
    and (security_private.is_referenced_track_asset(old.name)
      or security_private.is_referenced_track_asset(new.name)) then
    raise exception 'Referenced track media is immutable. Upload to a new path and submit it for review.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function security_private.guard_referenced_media_version() from public, anon, authenticated;
drop trigger if exists guard_referenced_media_version on storage.objects;
create trigger guard_referenced_media_version
before insert or update or delete on storage.objects
for each row execute function security_private.guard_referenced_media_version();



-- Add only the permissions required by authenticated artist avatar cleanup.
-- Production uses bucket "avatars". Bucket aliases require a separate review.
-- Uploads stay on the authenticated, validated server action with service role;
-- no authenticated INSERT/UPDATE or broad owner/admin Storage grants are added.

-- Never enable deletion without the all-role referenced-media guard. A forged
-- track reference to an avatar path must remain protected after these grants.
do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'storage.objects'::regclass
      and tgname = 'guard_referenced_media_version'
      and not tgisinternal and tgenabled in ('O', 'A')
  ) then
    raise exception 'Apply 20260915224738_reconcile_reviewed_rights_and_storage before avatar cleanup policies.';
  end if;
end;
$$;

-- Storage remove first selects visible objects, so both SELECT and DELETE are
-- needed. UUID ownership comes from auth.uid(), never user-supplied metadata.
-- This matches buildAvatarAssetPath/deleteOwnAvatar including the timestamp fallback.
drop policy if exists "Artists can select own cleanup avatars" on storage.objects;
create policy "Artists can select own cleanup avatars"
on storage.objects as permissive for select to authenticated
using (
  bucket_id = 'avatars'
  and (select public.current_app_role()) = 'artist'
  and (string_to_array(name, '/'))[1] = (select auth.uid())::text
  and name !~ '[[:cntrl:]]'
  and name ~ '^[0-9a-f-]+/profile/[0-9]{13}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]{13})\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "Artists can delete own cleanup avatars" on storage.objects;
create policy "Artists can delete own cleanup avatars"
on storage.objects as permissive for delete to authenticated
using (
  bucket_id = 'avatars'
  and (select public.current_app_role()) = 'artist'
  and (string_to_array(name, '/'))[1] = (select auth.uid())::text
  and name !~ '[[:cntrl:]]'
  and name ~ '^[0-9a-f-]+/profile/[0-9]{13}-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9]{13})\.(jpg|jpeg|png|webp)$'
);



commit;
