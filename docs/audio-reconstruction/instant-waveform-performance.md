# Instant upload waveform and availability review — November 18, 2026

## Financial and runtime boundary

Read-only production accounting: 12 completed runs reserve $1.20 and record $0.0533760918441033 of transfer charges; 7 failed runs reserve $0.70 and record $0.01575576396. These recorded charges are not an authoritative provider invoice or a complete historical liability balance. The $12 fixed reserve and $1 carry-forward remain intact. The conservative projection is approximately $14.91/$15. Admission is intentionally disabled, with no issued runs. Original Google liabilities remain `UNKNOWN_PRESERVED_NOT_OFFSET`; Clean Media Recovery remains HOLD. Pending jobs remain queued/retry-wait, not deleted or reset.

The authenticated existing DigitalOcean billing dashboard displayed November estimated gross usage **$0.33**, credits applied $0.33, net estimate $0.00 and remaining credit $4.67. It explicitly updates daily; there were no finalized period line items or outbound-transfer totals and no complete-through cutoff. Net zero after credits is not gross zero. No billing settings or cloud resources changed.

Under the existing immutable run trigger and projection, **no settled run is automatically eligible for reservation release**: identities/reservations cannot be rewritten and full reservations remain after settlement. Releasing unused reserves needs an explicit, reviewed, append-only reconciliation mechanism backed by finalized usage and final transfer/permit evidence. This release does not introduce that mechanism or reset balances. Processing cannot be re-enabled safely from the present evidence while keeping the unchanged $15 guard. The safe browser/UI release is independent of that blocker.

## Implementation

- A separate same-origin module worker reads bounded PCM windows from selected File slices. It supports PCM WAV, AIFF and PCM AIFC NONE/twos/sowt; mono/stereo, supported PCM bit depths and float WAV. It scans bounded headers and at most four 128-frame windows in each of 256 bins: approximately 0.5–1 MB, not a whole 45–150 MB decode. No original bytes leave the device for visualization. Silence remains silent; bars come from measured samples with one shared visual gain.
- The component explicitly labels this a sampled, preliminary overview, never validation or complete peak evidence. Unsupported/compressed FLAC and unavailable/constrained workers fall back clearly; no unbounded whole-file Web Audio decode is attempted. Workers have a five-second UI deadline and terminate on result, failure, replacement or unmount. Stale file results cannot replace the current selection.
- Preliminary visualization remains until the exact current-source server waveform is ready. Retired-source and previous-region previews cannot be shown/accepted as the new selection. Buyer playback and authoritative server waveform APIs are unchanged.
- Three primary areas: Your Recording, Waveform & Preview, Submission Readiness. Recording options, additional upload and history are collapsible. Preview-region edits are secondary. Normal operation needs no manual refresh; reconnect is offered only after a status error.
- Serialized, abortable polling uses two seconds during active processing, 30 seconds when paused, 60 seconds when ready, bounded error backoff, visibility/online wake and cleanup. Paused processing has no running spinner. An interrupted connection is marked as stale/reconnecting rather than reported as current progress.
- TUS remains serial with the provider-required 6 MiB chunks and direct Storage hostname. Successful intermediate PATCH acknowledgements replace redundant HEAD calls; initial/final HEAD and mandatory HEAD after uncertainty remain. Resume requires the same full-file fingerprint and exact immutable path; only a completed fingerprint is weakly cached on the same immutable File/Blob object. A new object is hashed again. No mutable tags, service credentials or parallel assets are introduced.
- New reservations skip the unnecessary pre-upload confirm request; resumed reservations still reconcile possible completion. Checking, connecting/restoring offsets and confirmed transfer progress are distinct. Slow chunks show elapsed time since the last confirmation without inventing committed bytes or percentages. Fetch redirect denial is preserved rather than replaced by an XHR transport that follows redirects.

## Measured local evidence

Chrome on the founder workstation, measured worker creation→analysis result; DOM rendering was separately observed. Browser automation's file-transfer time is excluded and is not an artist upload-speed measurement.

| Actual selected file | Browser analysis | Audio bytes read | Result |
|---|---:|---:|---|
| Representative full-length music, 45,547,778 B | 277.8 ms | 786,484 | Real preliminary bars; 172.137937 s |
| Synthetic WAV, 100,000,000 B | 257.6 ms | 524,332 | Real preliminary bars; 130.208276 s |
| Synthetic WAV, 150,000,000 B | 297.4 ms | 524,332 | Real preliminary bars; trailing silence remains silent |

The full-length recording was used locally only. Its duration exactly matched the previously verified server waveform bound to source SHA-256 `36a77ab3ea55fd5bf67f1243aa02f5404896799aac8f657f9e3564b11b382e52`. Mean absolute normalized peak difference across 120 displayed bins was 0.071, consistent with a sampled overview; this is not a peak-complete accuracy claim. No private track was uploaded for this review. A local malformed/unsupported FLAC selection produced an actionable fallback without blocking upload. 390×844 responsive layout had document width390 and no horizontal overflow; this is desktop browser emulation, not physical mobile-device performance.

The prior native 100 MB codec-only reference (~14 seconds; corrected transport/codec regression20.183s) excludes production authorization, three separate source transfers and isolated executions. Actual completed production run wall times were28.669s validation,26.201s waveform and25.591s AAC, plus inter-stage scheduling. The existing dispatcher polls every5s, not30s; the separate30s interval refreshes accounting. Repeated fresh authorized source reads and per-job startup dominate that difference. No source cache, merged pipeline, sandbox relaxation or credential shortcut was introduced. Live runtime optimization/testing remains gated by admission/headroom.

## Release and rollback

No database migrations, production accounting mutations, worker image/configuration changes, admission renewal, payment/licensing changes or new services are part of this release. Preserve Supabase spend cap and the $15 DO allowance. Use approved-main production Netlify context after required CI and explicit AGENTS merge approval; retain the current production release. Rollback is a reviewed source revert and new production build. Temporary local QA routes/fetch mocks are removed before build/commit. Do not claim another hosted processing run or reservation release passed.

Focused tests cover PCM containers, silence, malformed/oversized inputs, bounded reads, timeout fallback, exact source/region transitions, paused/error polling, TUS acknowledgements, uncertainty, fingerprint reuse/replacement, cancellation and100MB resume. Previous server validation, waveform, AAC, private-access and sandbox evidence is retained rather than re-executed without financial authority.
