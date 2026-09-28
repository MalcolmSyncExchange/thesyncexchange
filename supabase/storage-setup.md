# Supabase Storage Setup

This app now expects dedicated buckets instead of the older single `track-assets` bucket.
Bucket creation is a separately approved operation. Follow [canonical deployment](../docs/security-pr2/deployment.md). Do not execute the historical standalone policy bundle.

## Buckets to create

Create these exact bucket names:

- `avatars` — public
- `cover-art` — public
- `track-previews` — public
- `track-audio` — private
- `agreements` — private

## Recommended path conventions

- `avatars/{user_id}/profile/{timestamp}-{uuid}.{ext}`
- `cover-art/{artist_user_id}/{track_id-or-draft}/cover-art/{timestamp}-{uuid}.{ext}`
- `track-previews/{artist_user_id}/{track_id-or-draft}/previews/{timestamp}-{uuid}.{ext}`
- `track-previews/{artist_user_id}/{track_id-or-draft}/waveforms/{timestamp}-{uuid}.{ext}`
- `track-audio/{artist_user_id}/{track_id-or-draft}/audio/{timestamp}-{uuid}.{ext}`
- `agreements/orders/{order_id}/license-agreement.pdf`

## Canonical policy contract

See [Storage access matrix](../docs/security-pr2/storage.md). Authenticated uploads and cleanup go through server authorization. Ordinary object CRUD is denied; referenced track media is immutable even to service-role byte replacement. Public image/preview delivery uses public buckets. Full audio and agreements remain private.

## App expectations

- Postgres stores object paths, not provider-specific public URLs.
- Cover art and waveform assets resolve as public URLs at runtime.
- Full source audio stays private and is surfaced only through short-lived signed URLs in authenticated artist/admin workflows.
- Agreement delivery still goes through the authenticated app route at `/api/orders/[orderId]/agreement`, which can redirect to a signed file URL after auth checks.
- Use a 50MB effective limit for full-audio uploads to stay within the verified bucket configuration.

## Verification checklist

1. Create a new artist account and upload a cover image plus source audio.
2. Confirm the `tracks` row stores `cover_art_path`, `audio_file_path`, and optional `waveform_path` as bucket object paths.
3. Confirm artist and admin track detail pages can play audio through signed URLs.
4. Confirm buyer track detail can play preview audio for approved tracks.
5. Confirm agreement generation writes a PDF artifact to the private `agreements` bucket and the app route returns the file only for the correct buyer or an admin.
