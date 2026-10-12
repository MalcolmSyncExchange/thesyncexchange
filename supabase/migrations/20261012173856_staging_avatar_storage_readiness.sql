begin;
-- Separate staging review prerequisite. Never run this automatically at app startup.
-- Fail closed on existing bucket drift rather than silently replacing configuration.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('avatars','avatars',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
do $$ begin
 if not exists(select 1 from storage.buckets where id='avatars' and public=true and file_size_limit=10485760
  and allowed_mime_types @> array['image/jpeg','image/png','image/webp'] and allowed_mime_types <@ array['image/jpeg','image/png','image/webp']) then
  raise exception 'Avatar bucket configuration differs; review before applying storage setup.';
 end if;
end $$;
-- Only the authenticated server workflow uploads decoded/re-encoded avatar bytes.
-- Existing owner SELECT/DELETE cleanup policies remain; no raw browser upload grant.
drop policy if exists "Avatar uploads require server validation" on storage.objects;
create policy "Avatar uploads require server validation" on storage.objects as restrictive for insert to authenticated
with check(bucket_id<>'avatars');
drop policy if exists "Avatars require a new object path" on storage.objects;
create policy "Avatars require a new object path" on storage.objects as restrictive for update to authenticated
using(bucket_id<>'avatars') with check(bucket_id<>'avatars');
drop policy if exists "Active artist avatars cannot be deleted" on storage.objects;
create policy "Active artist avatars cannot be deleted" on storage.objects as restrictive for delete to authenticated
using(bucket_id<>'avatars' or not exists(select 1 from public.user_profiles p where p.id=auth.uid()
 and (p.avatar_path=name or p.avatar_url is not null or p.onboarding_payload->>'avatarPath'=name or p.onboarding_payload->>'avatar_path'=name)));
commit;
