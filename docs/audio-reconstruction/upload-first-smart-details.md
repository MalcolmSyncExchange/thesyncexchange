# Upload-first submission and advisory audio discovery

The four artist steps are Upload Music → Track Details → Rights & Ownership → Review & Submit. Optional audio versions/artwork remain in the studio, contributor credits move into Track Details, and licensing preferences remain under Rights & Ownership. No retained fields are removed. The mounted upload workbench continues transfer, preview persistence and polling while the artist edits other steps. Draft CAS and serial autosave remain independent of media revision fencing.

PCM WAV advisory analysis runs in the existing disposable browser worker, with its existing 20-second/8 MiB sample and three-second termination deadline. It reports preliminary duration/sample rate/channels/bit depth and confident pulse estimates. Secure worker validation remains authoritative. Unsupported formats or ambiguous audio fall back to manual input; no paid service or audio upload to an analysis provider is introduced. Only explicit artist action applies or dismisses suggested moods. Heuristics use sampled RMS, dynamics and pulse evidence; they do not claim semantic/tonal classification. Manual BPM values, including a deliberate clearing, take precedence over asynchronous results. Existing saved BPM values are treated as manual on restoration.

Genre, Language and Moods open from compact search inputs; keyboard arrows, Escape, visible focus, touch targets and retained legacy values are supported. Curated vocabularies remain unchanged. English is first; other languages, genres and mood choices are sorted alphabetically. Subgenres stay in the same genre control. Custom moods retain the existing private-review path.

## Database compatibility and rollback

`20261119222415_upload_first_optional_tempo.sql` makes `tracks.bpm` nullable without updating any existing row. Existing catalog contracts already support null tempo. Guarded body edits change only blank-draft BPM conversion and metadata validation of explicit unknown tempo. Numeric BPM remains 40–220. Function owners, ACLs, actor/ownership checks, rights checks, private Storage and pending-review/publication gates remain unchanged. The migration is idempotent and aborts on an unexpected routine contract.

Apply this migration before publishing the application; explicit approval is required by AGENTS.md. Rehearse it against the retained target-shaped schema. Test an unknown-BPM complete audio package through pending SEC review, malformed numeric rejection and unaccepted/rights-incomplete rejection. No automatic publication occurs.

Rollback is republication of the current Netlify deployment `6aff5d09cae90ef45f6c4815` (or the independently verified immediately preceding release). Keep nullable BPM and preserve newly created unknown values; never fill them with invented tempo or restore NOT NULL destructively. Existing previous UI can read null as an empty field. Reinstating stricter submission validation, if needed, requires a separately reviewed forward migration, not data deletion. Worker/host images, financial controls, $35 allowance, accounting, Supabase spend cap and Clean Media Recovery HOLD are untouched.

## Validation limits

Advisory analysis currently supports PCM WAV only. AIFF/FLAC remain securely supported uploads with authoritative duration after processing and manual BPM/mood fallback. Mood suggestions are transient per selected local recording; accepted mood choices and BPM are saved in the existing draft. No success is claimed for unavailable analysis. Founder acceptance occurs on the live production interface after required CI and repository merge approval.
