alter table storage.objects enable row level security;

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

create policy "Public avatars are readable"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

create policy "Owners can manage avatars"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins can manage avatars"
on storage.objects
for all
to authenticated
using (bucket_id = 'avatars' and public.is_admin())
with check (bucket_id = 'avatars' and public.is_admin());

create policy "Public cover art is readable"
on storage.objects
for select
to public
using (bucket_id = 'cover-art');

create policy "Artists can manage cover art"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'cover-art'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'cover-art'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins can manage cover art"
on storage.objects
for all
to authenticated
using (bucket_id = 'cover-art' and public.is_admin())
with check (bucket_id = 'cover-art' and public.is_admin());

create policy "Public track previews are readable"
on storage.objects
for select
to public
using (bucket_id = 'track-previews');

create policy "Artists can manage track previews"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'track-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'track-previews'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins can manage track previews"
on storage.objects
for all
to authenticated
using (bucket_id = 'track-previews' and public.is_admin())
with check (bucket_id = 'track-previews' and public.is_admin());

create policy "Artists can manage private track audio"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'track-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'track-audio'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Admins can manage private track audio"
on storage.objects
for all
to authenticated
using (bucket_id = 'track-audio' and public.is_admin())
with check (bucket_id = 'track-audio' and public.is_admin());

create policy "Admins can manage agreements"
on storage.objects
for all
to authenticated
using (bucket_id = 'agreements' and public.is_admin())
with check (bucket_id = 'agreements' and public.is_admin());
