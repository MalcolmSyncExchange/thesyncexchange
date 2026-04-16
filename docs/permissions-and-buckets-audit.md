# Permissions and Buckets Audit

## Buckets

### `avatars`
- visibility: public
- uploads:
  - authenticated users for their own profile image
  - admins can manage when needed
- reads:
  - public display surfaces

### `cover-art`
- visibility: public
- uploads:
  - artist-owned track submissions
  - admins can manage
- reads:
  - catalog and track detail display

### `track-previews`
- visibility: public
- uploads:
  - artist-owned track preview assets
  - admins can manage
- reads:
  - buyer browsing and preview playback

### `track-audio`
- visibility: private
- uploads:
  - artist-owned full audio assets
  - admins can manage
- reads:
  - signed access for authorized artist/admin workflows only

### `agreements`
- visibility: private
- uploads:
  - system-generated agreement artifacts
  - admins can manage
- reads:
  - authenticated, authorized buyer/admin access through the order agreement route only

## Resource access model

### Artist
- can upload/manage:
  - own avatar
  - own cover art
  - own preview audio
  - own full audio
- cannot directly read other artists’ private full audio
- cannot directly read agreements for buyer orders

### Buyer
- can read:
  - public cover art
  - public previews
- can download:
  - agreement for their own paid order only
- cannot access:
  - private full audio
  - another buyer’s agreement

### Admin
- can review:
  - track assets required for moderation
  - order activity and webhook state
- can access:
  - agreements when needed for support/compliance

## Delivery model

- previews use public URLs
- full audio uses signed URLs
- agreement delivery uses the authenticated order route:
  - `401` unauthenticated
  - `403` wrong buyer
  - `409` payment incomplete or document unavailable
  - `200` stream or `307` redirect for authorized access
