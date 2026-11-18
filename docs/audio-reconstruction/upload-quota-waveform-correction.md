# Upload admission and single waveform timeline — November 18, 2026

The production baseline is main5285efaf (deploy6afe1e55285c283ba1286d63),
including PR48, PR49 and PR50. Historical source recovery is not repeated.

## Confirmed upload blocker

Read-only production evidence for the founder Artist showed four objects fully
stored but awaiting validation, all counted against the old four-item in-flight
limit. Seven upload reservations existed in the rolling24-hour window, below
its separate20/day ceiling. The installed reserve function SHA256 was
77bf9964b70bfacf32292d6f765071894b48c3591d77e10b6916c5f79ec74a9f.
The per-file frontend/API/database/Storage limit is already150000000 bytes.
No account or draft byte aggregation caused this rejection.

Migration20261118220915 changes only media_upload_reserve admission. Four
unexpired, nonretired, uncompleted transfers remain the concurrent maximum.
A completed immutable Storage object awaiting processing is not a transfer.
Expired reservations stop consuming slots without deleting or rewriting their
records; explicit cancellation continues to retire the reservation through the
existing authorized workflow. The owner advisory lock, optimistic revision,
operation idempotence, ownership checks, private paths and audit history remain.
The independent20 reservations per rolling24 hours remains an abuse limit;
canceled/expired attempts still count until that daily window passes. The shared
20/minute and200/day request limits also remain. Neither is a per-file limit.

Only exact approved database error names become distinct transfer/daily quota
messages. Unknown diagnostics stay redacted. Storage413,429 and507 errors receive
size, rate and capacity messages respectively. TUS chunking, verified offsets,
exact-file resume fingerprints, cancellation and bounded retries are unchanged.
No spend-cap or processing-admission change is included.

## Player

Remove both visible position sliders and the numeric region field. The measured
waveform is the seek surface with one thin vertical HTML playhead over the
highlight. Played bars retain the real server envelope. Keyboard focus targets
for seeking and region selection are siblings, avoiding nested ARIA sliders.
The selected region can be dragged with pointer/touch, moved0.1s with arrows,
1s with Shift, and clamped with Home/End. Its timestamps sit above the selection
and stay inside the timeline. Playback never changes the saved selection.
Full Track/Preview buttons, time, volume and applicable Save/Generate/Accept
controls remain. Native audio, CORS correction, revision matching and explicit
AAC listening/acceptance are unchanged. Processing stays disabled.

## Validation

Local2065 unit tests and300 security regressions passed. Focused database and
TUS tests cover sequential45.5MB stored uploads awaiting validation,150MB
admission, oversized rejection, four active slots, expiry, cancellation, daily
quota, interrupted100MB resume, provider failure messages and rollback.
A disposable native macOS ARM64 PostgreSQL cluster verified the owner quota with
two concurrent connections: exactly one fourth reservation succeeded and the
other failed; expiry and rollback preserved records. This is database evidence,
not a new native AMD64 parser qualification. The first native harness attempted
a protected-table revision read as authenticated and was correctly denied;
operator fixture setup now reads it separately without changing grants.

Chrome local synthetic UI simulation passed full playback, keyboard seek,
fixed30s pointer dragging, natural24–54s endpoint stop exactly54.000, and mobile
touch drag to35.4–65.4s. A separate touch on the waveform sought to~6.6s without
moving the region.390px viewport had390px scroll width. No worker, production
credentials or production requests were used. Temporary routes/fetch/media
adapters/fixtures were removed before release checks. Initial typecheck found a
stale generated local-QA validator; removing that task-generated validator
resolved it. Final typecheck/lint/build passed (existing HookForm warning only).

## Release and rollback

Require the reviewed exact migration and main-merge approval under AGENTS.md;
routine production publication is already authorized. Apply only this function
replacement, verify body/grants, publish the approved-main Netlify build, then
verify two founder-only synthetic uploads without activating the worker.
Preserve existing files and do not fabricate waveform/AAC processing success
while admission is disabled. Verify unauthenticated/foreign-Origin playback
rejection and desktop/mobile seeking/selection after deployment.

Rollback uses a reviewed source revert/new production build and, if authorized,
upload-transfer-quota-rollback.sql to restore the prior function. It restores
no database snapshot and deletes no asset/job/history. Clean Media Recovery,
historical holds/accounting, the15USD DO gate and Supabase spend cap stay intact.
