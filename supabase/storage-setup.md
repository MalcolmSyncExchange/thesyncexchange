# Supabase Storage Setup

This app now expects dedicated buckets instead of the older single `track-assets` bucket.
Create the buckets through the Supabase dashboard or CLI, then apply the policies in
[storage-policies.sql](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/storage-policies.sql).

## Buckets to create

Create these exact bucket names:

- `avatars` — public
- `cover-art` — public
- `track-previews` — public
- `track-audio` — private
- `agreements` — private

## Recommended path conventions

- `avatars/{user_id}/{timestamp}-{filename}`
- `cover-art/{artist_user_id}/{track_id-or-draft}/cover-art/{timestamp}-{filename}`
- `track-previews/{artist_user_id}/{track_id-or-draft}/waveforms/{timestamp}-{filename}`
- `track-audio/{artist_user_id}/{track_id-or-draft}/audio/{timestamp}-{filename}`
- `agreements/orders/{order_id}/license-agreement.html`

## Apply policies

After the buckets exist, run the SQL in:

- [storage-policies.sql](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/storage-policies.sql)

Those policies enforce:

- public read for `avatars`, `cover-art`, and `track-previews`
- owner-scoped writes based on the first folder segment matching `auth.uid()`
- admin override via `public.is_admin()`
- private `track-audio` and `agreements` buckets

## App expectations

- Postgres stores object paths, not provider-specific public URLs.
- Cover art and waveform assets resolve as public URLs at runtime.
- Full source audio stays private and is surfaced through short-lived signed URLs.
- Agreement delivery still goes through the authenticated app route at `/api/orders/[orderId]/agreement`, which can redirect to a signed file URL after auth checks.

## Verification checklist

1. Create a new artist account and upload a cover image plus source audio.
2. Confirm the `tracks` row stores `cover_art_path`, `audio_file_path`, and optional `waveform_path` as bucket object paths.
3. Confirm artist and admin track detail pages can play audio through signed URLs.
4. Confirm buyer track detail can play preview audio for approved tracks.
5. Confirm agreement generation writes to the private `agreements` bucket and the app route returns the file.
