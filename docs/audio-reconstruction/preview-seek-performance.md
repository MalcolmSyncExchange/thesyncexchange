# Preview scrubber correction and performance evidence

## Focused release

The player previously clamped every seek to the active preview bounds. The waveform now resolves seeks in full-recording time. An outside seek changes to full mode before updating the native audio element; the saved selection and its overlay remain unchanged. Generated AAC uses its source offset for inside seeks and obtains the existing authorized original capability for outside seeks. Paused seeking remains paused; active playback continues. Pointer, touch and keyboard use the same resolver. Preview endpoint enforcement, revision-bound acceptance and private playback authorization remain intact.

No database, worker image, resource limit, admission, accounting, billing or private-storage policy changes are included. Rollback is a source revert and approved-main production rebuild; retain deployment 6afe5ac59cfe355b399eccd4 until production smoke verification succeeds.

## Measured baseline and limits

Existing retained browser evidence (actual selected files, worker analysis only): 45,547,778-byte music 277.8 ms; 100,000,000-byte synthetic WAV 257.6 ms; 150,000,000-byte synthetic WAV 297.4 ms. These measurements exclude network transfer and are not end-to-end results. Current preliminary display does not yet provide local audition/region editing; this remains performance follow-up work.

PR55 native AMD64 read-only reconciliation under unchanged 20% CPU/128MiB limits reduced 29-record scanning from 8.100 seconds/58 Docker commands to 0.611 seconds/2 commands: 13.25x for that operation only, not 30x end-to-end.

Production completed-run wall times read November19 UTC: before batch launcher, 45.5MB source validation 28.518/29.163/34.199s and waveforms 35.552–37.361s. After installation, a 45,547,778-byte recording admitted04:18:48.371Z completed validation04:19:00.054Z (11.682s), waveform04:19:05.137–04:19:16.359Z (11.223s), AAC04:19:21.436–04:19:35.162Z (13.726s). Admission-to-AAC publication/settlement was46.790s. Two inter-stage gaps were5.083/5.077s. These are observed runs, not controlled same-network upload benchmarks; no claim of codec speedup or 30x overall improvement is supported.

The existing dispatcher sleeps5seconds between every run, including consecutive eligible stages. Source validation, waveform and preview each re-download a fresh checksum-bound source in separate one-shot sandboxes. Changing that requires a separately tested immutable worker/broker release; this UI fix does not reuse untrusted cached input or bypass fencing. Provider-required serial6MiB TUS chunks, direct Storage host, resumable fingerprint and uncertainty reconciliation already exist. Upload initialization, throughput, storage publication and UI propagation require new explicit timing instrumentation; existing database run wall times cannot separate those components.

Full45/100/150MB end-to-end before/after measurements remain pending. Preserve the $20 operating gate and current window; do not extend runtime or release reservations to obtain benchmarks.
