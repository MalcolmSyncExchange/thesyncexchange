# Playback, recoverable drafts and compact upload progress

This release follows the November $20 ceiling approval; it does not activate a
worker, change billing, alter image pins or change processing resource limits.

Playback authorization warms once when the listening room becomes visible, and
on subsequent explicit play-button pointer/keyboard intent if renewal is needed.
Concurrent requests coalesce; a component-local capability expires within the
existing 60-second server limit, renews with five seconds remaining, and is never
persisted. No master bytes are prefetched. Unmount aborts authorization and clears
the audio source. Private origin/session/role, source integrity and preview
revision checks remain unchanged. Cold and warm production measurements remain
required; this is not a claim of sub-500ms playback on every connection.

Delete Draft removes only the authenticated Artist's unsubmitted workspace from
active lists. A confirmation dialog explains recovery and unsaved edits. Shared,
licensed, submitted, reviewed and approved packages are protected. An active
issued execution blocks deletion. The same advisory lock as admission prevents
a deletion/claim race; queued jobs are excluded while deleted and are not reset.
Restoring does not reset attempts or give a new permit. The append-only lifecycle
audit is limited to 20 changes/minute and 200/day per artist.

Deleted drafts remain recoverable through Deleted drafts / Restore. Files and
legal evidence are retained privately, not physically purged. Existing upload
expiry and reference-aware cleanup protections are preserved. No destructive
Storage cleanup or new background purge process is introduced. This intentionally
avoids deleting shared or legally required assets merely to remove a list item.

Progress is compact, shows the actual filename and confirmed human-readable size,
preserves pause/resume/cancel and reliable ETA, and hides the duplicate processing
card during transfer. The preliminary waveform remains visible. TUS chunking,
integrity checks, retries and transfer concurrency are unchanged. No throughput
improvement is claimed solely from this presentation change.

The additive migration preserves existing values and grants. Active lists remain
compatible with old clients and omit deleted drafts. Rollback is a tested-source
revert followed by a new production build; retain the additive schema, private
files, tombstones, attempts and audit history. Never drop these records to roll
back presentation. The existing processing disable procedure remains independent.

Local evidence: complete unit regression 2,074 passed; focused lifecycle/API/cache
checks including the newest rate-limit case passed; 300 security regressions and
five security gates passed; native macOS ARM64 PostgreSQL replay and restricted
role checks passed. Typecheck, lint and build are required before publication.
Native codec/sandbox qualification is reused, not repeated or relabeled.

Current pre-release production baseline: cold 2231.3ms, warm 6.3ms; original
selection audition stopped at exactly 45.000s without media errors. This is the
previous implementation, not the new release or a generated AAC result.
