# Non-executed Storage and worker setup specification

This specification does not authorize installation, provisioning, uploads or activation.
All hosted buckets, workers, media delivery endpoints and application adapters remain unbuilt.

## Storage setup

Create through the supported Storage platform API **only after separate authorization**;
do not insert bucket metadata directly into SQL. Verify current platform/project maximum
upload size permits 250,000,000 bytes. All three buckets MUST be private:

| Bucket | Maximum bytes | Platform MIME allowlist | Upload/read/update/delete |
|---|---:|---|---|
| submission-source | 250,000,000 | audio/wav, audio/x-wav, audio/wave, audio/vnd.wave, audio/aiff, audio/x-aiff, audio/flac, audio/x-flac, application/octet-stream | Authenticated Artist TUS into exact unexpired reservation; broker-scoped reads; no overwrite/deletion |
| submission-artwork | 10,000,000 | image/jpeg, image/png, image/webp | Exact Artist reservation; broker-scoped reads; no overwrite/deletion |
| submission-derived | 4,000,000 | audio/mp4, application/octet-stream | Assigned job outputs only; broker-scoped reads; no client reads/writes/updates/deletion |

MIME policies are convenience/transport gates, never proof of actual content. Waveforms
have a stricter 2 MB application/validator bound inside the 4 MB derivative bucket.
Master maximum is decimal 250 MB, not MiB. Artist identity comes from canonical profile
and authenticated UUID, not filename/path prefix or metadata ownership claims.

Use direct Storage TUS (6 MiB chunks as currently documented), `x-upsert=false`, bytes-based
transfer progress and the exact server-issued reservation. The server may return the
minimum destination/capability in a dedicated upload response; never embed it in saved
Artist state. The initial supported mode is authenticated TUS: `owner_id` must equal the
reservation owner. A privileged signed-upload mode is **not enabled by this source**;
its redemption owner semantics must be tested on isolated Storage before adoption.
Reservations last 24 hours. Refreshing the page resumes from persisted reservation;
TUS-local upload handles may expire, in which case inspect the exact object first. Never
mint a new arbitrary destination from client arguments. Missing uploads can reserve a
new asset after quota/expiry handling; superseded/failed objects are retained.

Migration C defines three database-side routines only, with no Storage DDL.
`storage-protection.sql` is a separately hashed Gate 2 setup artifact, outside the ordinary
migration ledger. It requires exact non-superuser postgres current/session identity,
unchanged supabase_storage_admin ownership (no owner inheritance/SET path), genuine
registered SIGHUP supautils settings from provider configuration, and exact postgres →
storage.objects grants in BOTH policy_grants and drop_trigger_grants. Native TRIGGER,
schema USAGE, all-FALSE capabilities and exact Migration C function definitions/owners/
complete EXECUTE ACLs are also required. No additional installer privilege is proposed.
The JSON shape is an object of unique role names → arrays of unique schema.table strings;
malformed shapes, duplicate keys/tables, wildcard/quoted/injected identifiers, missing
exact grants and USERSET/session placeholders fail closed. Registered settings prove the
library loaded; no SQL CREATE EXTENSION record is assumed for session-preloaded supautils.
The five exact policy definitions and single exact trigger are validated before controlled
DROP/CREATE replay. Unrelated policies/triggers remain untouched. Buckets remain separate
supported Storage API configuration; no SQL bucket creation. This source adds an INSERT
policy for exact reservations, restrictive denial of raw pending reads, and denies
client update/delete. The trigger also protects privileged Storage writes: only the
exact live reservation can create an object; object ID, version, destination, ownership,
size and MIME cannot change afterward. Metadata access timestamps may change. An
explicitly adopted legacy source is sealed; other legacy objects are unaffected.

No Artist/Admin/Buyer can directly read the new buckets through RLS. Future broker
endpoints must authorize canonical Artist ownership or canonical Admin review and issue
short-lived exact-object playback access. Buyer delivery resolves only the opaque
`buyer_media` descriptor, then signs only that active Preview/Artwork. It must never sign
Source Master or pending derivatives for Buyers. Keep all pending delivery responses
`private, no-store`; no public pending cache. Approved media can use version-keyed controlled
CDN delivery with authorization/predicate checks and short URL TTLs. Existing approved
legacy public preview/artwork URLs keep working. No copying to public buckets is designed.

The broker SQL role has no Storage byte access. A separate isolated signing broker is
required later. It may hold a Supabase service credential if platform-scoped signing
cannot be used: keep it out of the worker, deny arbitrary URL/bucket/path requests, use
exact leased job DB records, short-lived GET/one-object output capabilities, isolated
secrets, rate limits and audit correlation. Supabase service keys bypass RLS; the object
trigger is necessary but does not make service credentials least-privileged. The Storage
API/version/sealing integration MUST pass isolated-platform tests before hosted activation.

## Worker specification (not implemented)

Cloud Run job/container, TypeScript on pinned supported Node LTS; exact FFmpeg/ffprobe
package versions and image SHA-256 must be selected and reviewed when worker authoring is
authorized. No floating `latest` image. Profiles in `contracts/submission-media/profiles.ts`
are immutable v1 provenance. Current source does not pretend a pin has been selected.

Initial budget: 2 vCPU, 2 GiB RAM, single job per container, 10-minute task timeout,
1 GiB bounded temporary file budget. Use disk-backed ephemeral volume if available;
default writable filesystem memory consumption must fit the memory budget. Maximum
input 250 MB, maximum measured duration 15 minutes, one source read per processing pass;
stream checksum/probe/decode/waveform where feasible. Never buffer input in Netlify or
load the Master in the browser just to render waveform.

Container claims trusted database job through isolated broker; resolves exact sealed
object ID/version and source checksum; reads a scoped object; processes with subprocess
argument arrays, controlled paths, disabled network/protocols and no shell interpolation;
validates bounded output; obtains only the assigned destination capability; uploads
immutable output; completes the exact job with lease token + epoch. Heartbeat each minute,
lease five minutes. Broker is not a general SQL proxy. No Artist-to-worker URL interface.
Worker has no DB table grants, Supabase service key, Stripe/Gate D credentials or
purchased-delivery authority. SQL broker role is NOLOGIN; any runtime login/membership,
network and secrets setup requires separate approval and must not be an API-role member.

Source validation: signature/container + codec allowlist, entire audio decode, nonzero
frames, measured technical metadata, streamed SHA-256, actual byte count and exact object
identity. Source bytes unchanged. WAV/AIFF/AIFF-C PCM and FLAC only; 1 second–15 minutes,
mono/stereo, 8–192 kHz; supported integer PCM/FLAC precision and PCM float32/64. No MP3,
normalization, loudness, automatic key/BPM or watermarking. Parser safety rejects malformed,
extra/unexpected streams and unsupported configurations. Do not silently transcode Master.

Waveform: derive from exact validated source; 100 points/second, channel-safe display
min/max envelope, signed int16 versioned encoding, display normalization only, duration
binding, <=90,000 points and <=2 MB. Browser needs opaque derivative descriptor, no Master
URL. Accessible numeric region controls can accompany future waveform selection.

Preview: deterministic floor(start_ms*sample_rate/1000), floor(end_ms*sample_rate/1000);
short cues use all decoded frames. M4A/AAC-LC 256 kbps, 44.1 kHz, mono/stereo preserved,
strip tags/artwork/extra streams, no gain change, <=4 MB. Re-probe/decode output and verify
source SHA, sample boundaries, duration tolerance <=100 ms and complete checksum. Selection
15–60 seconds at 100 ms precision; entire source for tracks <15 seconds. Default 30 seconds
is UI-only. Output success never activates a preview by itself.

Artwork: full still-image decode, JPEG/PNG/WebP, <=10 MB, each dimension 256–8192 pixels,
<=32 million pixels, ratio 1:4–4:1, no animation or malformed image. Square preferred only.
No transformation pipeline. Strip/avoid rendering untrusted metadata in logs/DTOs.

Use unprivileged container UID, read-only image, isolated processing subprocess, resource
and temporary-file limits, parser fuzz/malformed fixtures, outbound allowlist to broker and
Storage only. Processing child has no network or credentials. Destroy only ephemeral
working files, never Storage evidence. Heartbeat/lease loss immediately stops processing;
late completion rejected. Exit 0 only after completion outcome confirmed; transient exit
maps to bounded retry, permanent invalid content to safe failure. SQL attempts max three;
Cloud scheduler must not independently create duplicate jobs. Log operation/job/asset IDs,
profile/build digest, stage/time/error code, never URLs/tokens/raw parser stderr. Metrics:
queue age, lease expiry, retry count, stage latency, rejected formats and byte volumes.

Staging must use repository-owned synthetic tones WAV/AIFF/FLAC, malformed/zero-frame
fixtures, synthetic artwork and synthetic users. Actual decoding/encoding and platform
TUS/CDN semantics are future worker/isolated-Storage tests, not validated by the database
result-contract tests in this branch.
