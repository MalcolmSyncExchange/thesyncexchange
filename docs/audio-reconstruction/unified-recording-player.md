# Unified recording player — November 18, 2026

## Release scope

One full-source, server-generated waveform replaces separate master and preview
waveforms in the artist/SEC media workbench. Symmetrical rounded bars retain the
existing measured envelope and shared gain. Peak caps and center decoration are
removed; playback position remains visible. The bounded preliminary PCM worker
is unchanged and still appears immediately for a newly selected file.

One native audio element has three explicitly labeled modes: Full Track,
Preview (audition from the original), and Generated AAC (the immutable derived
asset). Original audition is never acceptance evidence. Generated AAC progress
is mapped to its source interval on the same full waveform. Starting another
mode stops the previous one. Selection changes and source/revision changes stop
playback; cancellation/unmount abort authorization and stop media downloads.
Backgrounding pauses playback; a bounded endpoint timer and time/seek checks
enforce audition boundaries, including reduced-motion mode.

The movable artist region is exactly 30 seconds for recordings >=30 seconds;
pointer, touch, slider arrows and numeric timestamps share the same clamping.
The installed worker's 100 ms precision is preserved. Recordings <30 seconds
audition the complete measured source. A fractional-duration recording between
15 and 30 seconds whose terminal millisecond is not a 100 ms multiple cannot
yet generate an exact full-length AAC under that retained worker contract.
The UI explicitly blocks that edge case instead of shortening audio or queueing
a known-invalid job. Resolving it requires a separately verified worker boundary
update; no parser image/algorithm, admission, accounting or runtime was changed.
SEC read-only review preserves existing saved regions, including legacy regions
whose lengths differ from the new artist default.

## Original access boundary

Additive migration `20261118203109_unified_master_playback.sql` creates only
three functions. It changes no rows, bucket policies, job/permit admission,
holds, quotas or accounting. Required columns and existing capability helpers
were confirmed against production with read-only schema inspection; the three
new functions were not installed during preparation.

`POST /api/media/[submission]/[asset]/original` requires the configured same
origin and an empty body. Canonical session/role and owner checks run before
Storage signing. An authenticated read guard requires an existing auth session,
an owning Artist or an AAL2 Admin, the exact current nonretired master, completed
validation, SHA-256 evidence, a private source bucket, unchanged object/version,
approved formats and the 150 MB/15 minute bounds. Browser roles receive only a
boolean from that guard; they cannot execute the locator. The private locator
and service-only resolver cannot be called by anon/authenticated clients.

The endpoint reuses the existing authenticated upload anti-abuse budget when
minting an original URL (20/minute and 200/day including other upload operations).
It returns only a 60-second signed URL for the approved immutable object after
rechecking authority and locator identity. Responses are private/no-store and
errors are redacted. URL origin/path are checked against configured Supabase.
No original is loaded until an explicit playback action. The browser caches
authorization for at most 55 seconds, renews on a later action after expiry,
and retries only following an explicit user action. It never receives a service
key. Signed capability revocation is bounded by the provider's 60-second TTL;
already authorized buffered audio cannot be recalled. Do not claim instant
revocation or a signed URL as an unlimited download entitlement.

Buyer APIs, descriptors, publication/rights/SEC gates, payments and licensing
remain unchanged. Buyers, unrelated artists, anonymous callers, stale sources,
non-MFA reviewers, public buckets and Storage version drift fail closed.
The existing derived-media endpoint still verifies complete artifact hashes
and authorizes before/after serving byte ranges.

## Validation and rollout

Focused tests exercise exact duration/clamping, short cues, pointer arithmetic,
source/revision matching, original access denial, expiry bounds, foreign origin,
oversized or wrong locators, URL validation, provider errors, rate denial,
session revocation, MFA, object drift, private grants and additive rollback.
Local Chrome simulation uses synthetic PCM and a synthetic AAC made with macOS
Audio File Convert. This verifies native browser playback/UI, not the production
FFmpeg runtime, provider CORS/MIME behavior or live signing. Its temporary route,
fetch adapter, media setter and fixture files must be removed before release.

Observed local browser evidence: a 90-second PCM original played with no media
error; full-track pause and keyboard seeking passed. A 40.500–70.500 second
audition clamped at its endpoint when seeking beyond it. A 17.100–47.100 second
audition stopped naturally at47.100 with reduced motion enabled. The two-second
cue stopped at2.000. Direct pointer movement and emulated touch moved the region
without changing its30-second duration; keyboard movement used100ms steps.
Generated AAC fixture playback mapped its position back onto the full waveform;
acceptance was disabled before playback and became available after listening.
Unsaved selection changes hid current-AAC acceptance. At390px, document and
scroll widths were both390. These are local desktop Chrome/mobile-emulation
results, not physical-device or production acceptance. Temporary adapters and
fixtures were removed before the production build. The preliminary worker and
its prior45/100/150MB performance evidence are unchanged.

Production requires explicit main-merge and exact SQL approval under AGENTS.md.
Apply only this additive migration, then publish the approved-main production
Netlify build. Verify authorized artist and reviewer full playback, unauthorized
original access denial, overlay/keyboard/mobile behavior and existing generated
AAC playback. New AAC processing remains pending while DO admission is disabled.
Do not activate the worker, release reservations or exceed the $15 allowance.
Keep Supabase's spend cap enabled and Clean Media Recovery on HOLD.

Rollback is a reviewed source revert/new deploy; the previous media workbench
does not call the new API. If needed, run the separately approved access-only
rollback in `unified-player-rollback.sql`. It drops the three new functions and
preserves all assets, files, jobs, attempts, selection/acceptance/review records,
historical holds and accounting. Never undo artist work or restore a database
snapshot to roll back this UI.
