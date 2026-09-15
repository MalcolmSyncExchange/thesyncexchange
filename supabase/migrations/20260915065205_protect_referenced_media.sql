-- Storage RLS must protect persisted media even when callers bypass app cleanup.
-- Apply after storage-owner policies; restrictive policies also survive reapplying
-- those older permissive policy bundles. New uploads and unreferenced cleanup remain.
begin;

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

commit;
