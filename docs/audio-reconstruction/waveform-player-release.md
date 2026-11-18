# Branded waveform player release

## Scope and preservation

Artist generated-preview transport is custom; the native audio element remains the playback engine. Buyer persistent-player transport, analytics attribution and revision-bound descriptor resolution remain intact. Both use the shared measured waveform renderer. No database migration, credential, Storage policy, worker image, permit or payment change is required. Clean Media Recovery remains on HOLD.

## Data and visual findings

The production two-second 440 Hz tone is genuinely almost constant in peak amplitude; its flat envelope was not a processing failure. The old renderer used absolute PCM amplitudes, thin strokes and no visual gain. Long, heavily limited music also loses visible detail when every broad display column is rendered only at its maximum peak.

The revised renderer uses symmetrical rounded bars. Bar bodies average the existing 100 Hz peak-envelope magnitudes, while subtle caps preserve the maximum absolute peak in every column. This is an average **peak envelope**, not a claim to calculate PCM RMS or perceived loudness. A single linear visual gain applies to the entire displayed region, using its maximum peak. Audio gain is unchanged. No random heights, per-bar boosts or artificial silence floor are used. Existing preview envelope consumers remain compatible; an optional bounded `levels` array carries average peak-envelope bodies alongside unchanged min/max pairs. Invalid body values fail closed.

Mobile bar density follows actual available width through ResizeObserver. Played/unplayed clipping follows the audio clock, with requestAnimationFrame only where available and reduced motion is not requested. Native range controls provide pointer drag, touch and keyboard seeking. Audio time is clamped to the loaded media duration. Loading/error states and bounded waveform fetching remain explicit; missing waveform data never produces fake bars or disables otherwise authorized playback.

## Region and access binding

Artist crops use the immutable generated asset's source and region, not the editable next selection. Frame rounding matches the worker's floor-to-frame rule and its full-short-track exception. Stale source, missing or malformed region metadata disables waveform display. Buyer descriptors continue binding audio and envelope to the same approved preview asset. Same-origin authorized endpoints, bounded bodies, no-store, redirect rejection, private masters, artist acceptance and SEC gates are preserved.

## Local evidence

- Exact production synthetic fixture: 64,044 bytes, two-second mono PCM; near-constant measured peaks verified. Reproducible fixture lives under tests/fixtures/audio, never a customer recording.
- Founder-approved full-length WAV tested locally: 172.1379365 seconds, stereo, 44.1 kHz, 24-bit PCM, 7,591,283 frames. All 17,214 min/max bins match independent PCM scanning. Existing waveform algorithm invoked with a bounded local PCM adapter; this is not a repeated FFmpeg or hosted sandbox qualification.
- 30–60 second crop: 600 columns; local buyer audio duration 30 seconds. No source bytes or private music fixture enter this release or repository.
- Desktop pointer drag reached 86.068968 seconds of 172.137937 at fraction 0.5; End reached exact media end. Buyer End reached 30.0 seconds. No audio errors.
- Mobile viewport 390 × 844: document width 390; controls and time display fit. Native range semantics retain touch support; this is browser viewport verification, not a physical-device test.
- Local QA proxy bound only to 127.0.0.1. Temporary QA page and exact fake-resource rewrites removed before production build. No production authentication bypass or fixture route is shipped.

## Release and rollback

Ship through feature PR, required CI, approved production main branch and Netlify production context. Preserve current deploy 6afd15a9e57d6b9c6f6b5932 and its source 3e26a2f8 as the current live reference before publication; reconcile latest host-only merges as ancestors. The application change has no migration or runtime installation requirement. If a published UI regression occurs, revert this focused application commit through the reviewed production branch and deploy the known source; do not alter worker admission or data to repair a visual issue.

Do not claim production visual acceptance until the new deployment is live and desktop/mobile screenshots plus authorized preview playback have been verified. Local fixture screenshots are explicitly local evidence.

## Production seeking postflight correction

The first live custom-player check played the entire AAC successfully but reported `audio.seekable=[[0,0]]`. The artist delivery route ignored the Range request and did not advertise byte ranges; the buyer route already supported them. The local fixture server's range support had hidden this existing delivery limitation.

The focused follow-up passes the Range header into artist playback and advertises/serves bounded single byte ranges. Complete immutable bytes are still size-bounded and SHA-256 verified, then role/ownership/session and exact locator are rechecked before selecting any response bytes. Malformed, multiple, zero-suffix, unsafe-integer and unsatisfiable ranges return416 only after authorization. No credential, Storage policy, database or worker change. Retain no-store and same-origin protection. Live acceptance must establish a nonzero seekable range and verify actual `currentTime` after a midpoint seek; a rendered slider alone is not sufficient evidence.
