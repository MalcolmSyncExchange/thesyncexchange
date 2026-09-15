-- Add only the permissions required by authenticated artist avatar cleanup.
-- Production uses bucket "avatars". Bucket aliases require a separate review.
-- Uploads stay on the authenticated, validated server action with service role;
-- no authenticated INSERT/UPDATE or broad owner/admin Storage grants are added.
begin;

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
    raise exception 'Apply 20260915065205_protect_referenced_media before avatar cleanup policies.';
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
