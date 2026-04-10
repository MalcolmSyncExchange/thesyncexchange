insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'track-assets',
  'track-assets',
  true,
  104857600,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/flac',
    'audio/x-flac',
    'audio/aiff',
    'application/json'
  ]
)
on conflict (id) do nothing;

create policy "Authenticated users can upload their own track assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'track-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can update their own track assets"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'track-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'track-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Authenticated users can delete their own track assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'track-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Public track assets are readable"
on storage.objects
for select
to public
using (bucket_id = 'track-assets');
