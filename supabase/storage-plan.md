# Supabase Storage Plan

This repo does not manage `storage.buckets` via SQL migrations.
Create buckets through the Supabase dashboard or CLI, then apply the manual policies in
[storage-policies.sql](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/storage-policies.sql).

## Buckets

### `avatars`
- Visibility: public
- Purpose: user profile images
- Path convention: `{user_id}/profile/{timestamp}-{uuid}.{ext}`
- Access:
  - authenticated users can upload/update/delete only their own objects
  - public read is allowed

### `cover-art`
- Visibility: public
- Purpose: approved track artwork and artist draft artwork previews
- Path convention: `{artist_user_id}/{track_id-or-draft}/cover-art/{timestamp}-{uuid}.{ext}`
- Access:
  - artists can upload/update/delete only inside their own top-level folder
  - admins can manage all objects
  - public read is allowed

### `track-previews`
- Visibility: public
- Purpose: waveform JSON, waveform images, and buyer-safe audio previews
- Path convention: `{artist_user_id}/{track_id-or-draft}/{previews|waveforms}/{timestamp}-{uuid}.{ext}`
- Access:
  - artists can upload/update/delete only inside their own top-level folder
  - admins can manage all objects
  - public read is allowed

### `track-audio`
- Visibility: private
- Purpose: full-resolution master or submission audio files
- Path convention: `{artist_user_id}/{track_id-or-draft}/audio/{timestamp}-{uuid}.{ext}`
- Access:
  - artists can upload/update/delete only their own objects
  - admins can read/manage all objects
  - buyers do not receive bucket-level access
  - app-generated signed URLs should be used only for explicit artist/admin review or fulfillment workflows
  - use a 50MB effective upload limit to match the verified bucket configuration

### `agreements`
- Visibility: private
- Purpose: generated license artifacts and future signed agreement files
- Path convention: `orders/{order_id}/license-agreement.pdf`
- Access:
  - admins and backend service workflows manage writes
  - buyers receive agreement access only through authenticated app routes or signed URLs
  - public read is not allowed

## Policy Plan

Use explicit storage policies scoped by bucket and the first folder segment:

- owner write policy:
  - `bucket_id = '<bucket>'`
  - `(storage.foldername(name))[1] = auth.uid()::text`
- owner update/delete policy:
  - same folder match as insert
- admin override policy:
  - join or helper check against `public.user_profiles.role = 'admin'`
- public read policy:
  - only for `avatars`, `cover-art`, and `track-previews`
- private read policy:
  - only for `track-audio` and `agreements`, scoped to admin/backend workflows

## Operational Notes

- Store object paths in Postgres, not provider-specific public URLs, whenever the app path is ready for that migration.
- Prefer public buckets only for assets that are intentionally buyer-facing or marketing-safe.
- Keep full audio private even when previews are public.
- Agreement delivery should continue through authenticated routes so legal/business logic stays centralized.
- Buyer audio preview should come from a dedicated preview asset; the app should not fall back to full private source audio for buyer browsing.
