# Submission UX completion — Release A

Baseline: production `6aff8b152ce7263aaa242b2e`, main `93638ea3`.

## Scope and evidence

The recovered recording already has stored/validated source, waveform and AAC assets. An abandoned local selection can still take precedence in the UI. Display reconciliation now derives stage readiness from current source/revision relationships. It does not promote local bytes, infer file identity from a filename, change a reservation, re-upload, or enqueue processing. A concurrent replacement remains local/pending until its identity is established. Stored metadata is used for the saved recording; unbound local work is retained separately.

Tempo analysis reads two independent windows (intro and middle), at most 20 seconds / 8 MiB of PCM, within the existing deadline. Adaptive onset normalization retains compressed rhythmic evidence; mean-centered correlation rejects unstructured energy. Supported low-confidence estimates are labelled; incompatible windows expose candidates instead of an automatic BPM. Half/double candidates are selectable. Manual BPM, including an intentional blank, always wins. Estimates are advisory and never an audio-validation verdict. Synthetic pulse/noise tests are not proof of the founder recording's tempo.

Genre selection stays open after a parent choice and reveals its optional children; Done closes it. Language behavior is unchanged. Enter in Mood selects a matching label or saves a private personal label. The artist-only RPC derives ownership from the verified session, never a supplied user ID. Curated/global vocabulary remains unchanged. Library removal preserves historical track selections.

## Migration and rollback

`20261120043522_personal_artist_mood_library.sql` adds private RLS-protected tables and one actor-guarded RPC. No existing rows, rights, processing, billing, Storage policies or grants are rewritten. Up to 100 labels/account, 80 characters/label, 30 successful mutations/minute; Unicode normalization, case-insensitive deduplication and separator/markup/control/abuse rejection. Owner-scoped advisory lock serializes changes. Direct table access is revoked.

Rollback: republish the prior immutable production deployment. Leave private library rows intact. If necessary, separately approve revoking authenticated execution on `public.media_personal_moods(text,text)`; do not drop tables or delete artist labels. New API calls safely return unavailable if migration absent.

## Release gates

Exact PR merge and production SQL approval required by AGENTS.md. No full founder submission test before deployment. Production verification must inspect the existing recovered recording and new controls without duplicate uploads or sending rights-invitation emails. Release B is separate and has not been implemented or deployed by Release A. Existing $35 allowance, Supabase spend cap, private originals, worker controls and Clean Media Recovery HOLD remain unchanged.

## Production Release A and bounded tempo follow-up

PR #70 merged as `b179a58d358e7fb18d2db244ecd3fdd542bdb2c2`; required CI passed. Production deployment `6affd3c6cf5def4cef69de5b` published; approved private-library SQL applied. Production readback confirmed RLS and no authenticated direct read/write grants on either private table. The recovered 45.5 MB recording shows all five stages completed, duration 2:52, private playback advances without error, and its saved 30-second selection is preserved. Re-selecting its unchanged parent genre kept the hierarchy open until Done. Anonymous media-read request returned 401. No duplicate upload or full submission was initiated.

Amplitude-only tempo evidence remained ambiguous on the approved full-length recording. A focused follow-up adds bounded 512-point Hann-windowed spectral flux, separating timbral onsets from volume changes. It rejects narrow sustained tones and tiny stationary spectral leakage, smooths short timing jitter, and checks measured shorter periods against second/third-beat aliases. Existing absolute bounds and manual overrides remain. Synthetic tests cover rhythmic constant-volume timbre, silence, sustained tones at multiple pitches, deterministic noise, unchanged source bytes, PCM adapter limits and tempo candidates.

Local-only Chrome diagnostic on the approved 172.14-second stereo PCM recording: final guarded analysis returned a low-confidence 72 BPM estimate with 144 BPM double-time candidate, score approximately 0.24, 5,292,012 bytes read and 232 ms elapsed. An earlier unguarded candidate returned 146/73; it was not chosen for release because sustained-tone rejection was incomplete. These are estimates, not ground-truth tempo. The artist can choose/correct candidates; no BPM value was written to the founder draft. The temporary diagnostic was not part of a release or a server upload.

The follow-up also accepts an optional owner-email field in the existing strict draft schema, preserving it unchanged without marking ownership verified. No owner-email UI, invitation API, grants, delivery or rights-approval changes are activated by this compatibility adjustment. This supplies an application rollback baseline for Release B that can still load/save email-bearing drafts without dropping fields. Release B must retain its database confirmation gates on application rollback.
