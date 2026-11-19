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

## Local audition and timing follow-up

A separate local-only audition component uses the selected File's Blob URL and the existing bounded PCM overview; it never uploads bytes or grants approval. Full-track playback, preview audition, region dragging, keyboard seeking and volume remain usable while transfers run. Blob URLs, timers and audio references are cleaned on replacement/unmount. A region selected locally is carried into the exact source's validated player as an unsaved selection; the existing save/revision and AAC acceptance gates still apply. No automatic extra generation is authorized by the local choice.

Actual Chrome local tests, excluding automation's file-selection transfer: representative45,547,778-byte music195.5ms/786,484sampled bytes;100MB186.5ms/524,332bytes;150MB187.6ms/524,332bytes. All native audio playback paths reached ready state without error;150MB preview stopped at30.000s. These single runs are different synthetic sample rates/durations from the earlier fixture set and are not a controlled throughput speedup claim.

Local Performance measures (prefix `tse.audio.`) record selection, reservation, initialization, fingerprint, transfer acknowledgments, confirmation and observed asset readiness. Entries are capped at128 and contain only a trace number, sizes and timings: no filenames, storage paths, signed URLs, credentials or audio. No analytics service or persistent diagnostic storage is introduced. Per-chunk throughput measures acknowledged HTTP elapsed time, not isolated link capacity. Upload wall time can include intentional pauses; it must not be represented as active-wire throughput. Backend phase timing still requires a separately verified worker observer/image; historical run wall times alone cannot separate decode, download and publication.
