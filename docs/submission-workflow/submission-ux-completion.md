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
