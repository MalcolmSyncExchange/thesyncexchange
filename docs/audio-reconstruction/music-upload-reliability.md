# Music upload reliability and 150 MB candidate

Production acceptance remains pending. No Supabase spending protection has been disabled.

## Confirmed founder-upload cause

Read-only production inspection on 2026-11-18 UTC found two complete private 45,547,778-byte WAV assets on draft `47958cbe-30eb-463e-aa2d-33298ffe6933`. They are `0eeaee45-b608-48c0-acf8-0fec65d79a77` and `7e7b1b7c-e1be-4ffe-a343-e4a5bde533b4`. Their validation jobs are queued at attempt zero. The three successful jobs belong to the earlier two-second synthetic master, not these files. Neither founder upload was overwritten, removed or downloaded during this investigation.

The DigitalOcean admission window expired at `2026-11-18T05:27:38.980Z`, before either upload. Read-only strict SSH confirmed the broker inactive/failed and launcher active. Thus transfer succeeded but validation did not begin. Source validation is not evidence of a codec failure. The application previously listed unrelated historical job outcomes together.

## Candidate behavior

150,000,000 decimal bytes is the new source ceiling in browser validation, reserve API, authenticated TUS, database reservation, DigitalOcean admission and transfers, and parser input preparation. Artwork remains 10 MB; waveform 2 MB and preview 4 MB remain unchanged. Parser output-file ceiling remains 50 MB. The 15-minute duration ceiling, 480-second tool timeout, 768 MiB parser address-space ceiling, 1 GiB container ceiling, 32 PIDs, network denial, Landlock, seccomp, non-root UID and credential separation remain unchanged. Source hashing and decoding stream; no full source Buffer is introduced. 150 MB source plus at most 4 MB output leaves over 100 MB within the existing 256 MB temporary-file budget and fits the 512 MiB scratch mount. Root launcher still rejects hosts with less than 2 GiB free disk and starts only one parser.

The current-master progress projection excludes retired master jobs and previews for other sources/regions. Transfer progress separates local identity hashing from acknowledged uploaded chunks, uses decimal MB, measured-only ETA and bounded TUS chunks. Pause preserves the server-verified offset and exact full-file fingerprint; same-tab Resume retains the File handle. Cancellation retires only the unsubmitted reservation, never deletes private Storage. Historical versions stay in a collapsible section. Preview acceptance remains revision-bound and separate from SEC review.

## Material deployment gate: Supabase spend cap

Authenticated Supabase Storage Settings explicitly shows Global file size limit 50 MB and “Reduced max upload file size limit due to spend cap. Disable your spend cap to allow file uploads of up to 500 GB.” The organization is already Pro. Bucket `submission-source` is private with a 50,000,000-byte limit. Increasing application or bucket limits alone cannot satisfy a 100 MB upload.

Founder approval is required before disabling the organization's spending protection. Do not silently bypass this gate by chunk-object storage, another service or weakening the cap. After that decision, set the project global maximum to exactly 150 MB, apply the reviewed private-bucket migration and verify readback. Other buckets remain unchanged. Do not publish a 150 MB UI before these gates pass.

## Worker availability gate

Keep the existing signed one-hour host binding, independent hard shutdown and accounting/fencing gates. A bounded renewed founder-testing window can verify this release. It does not establish unattended availability outside that window. Do not silently remove expiration or install an automatic signing-key renewal bypass. Continuous operation needs a separately reviewed renewal/scheduling design retaining independent root authority and the $15 monthly ceiling. Historical Google holds and liabilities remain untouched; Clean Media Recovery remains HOLD.

## Release and rollback order

1. Finish local/native runtime validation and seal both changed image identities.
2. Obtain explicit PR merge approval under AGENTS.md and a specific spend-cap decision.
3. Verify global 150 MB Storage configuration, then apply the reviewed non-destructive migration. Preserve all records, grants, history, policies and old job attempts.
4. Install only verified immutable images in a fresh bounded DigitalOcean founder window. Update the signed exact-host/image binding and public admission digests together; retain previous images/configuration.
5. Publish the approved-main Linux Netlify build only after CI, permission and rollback checks.
6. Verify the existing full-length founder master and one private synthetic 100 MB master through validation, waveform and AAC preview; test interruption, resume and replacement without deleting originals. Check unauthorized originals remain inaccessible. Do not submit false rights attestations or approve SEC review.
7. On mandatory failure, stop the worker first and keep durable job/permit/accounting records. Restore prior image/configuration and deploy a reviewed source revert as needed. Do not reset attempts or expose/erase 100+ MB originals. Keep processing disabled until a forward-compatible runtime can process retained large assets. Re-enabling the spend cap is a founder billing decision, not an automatic cleanup action.

100 MB production end-to-end acceptance is NOT passed until observed and recorded. Local size validation or simulated transfer is insufficient.

## Verification completed for this candidate

- Full local unit suite: 2,033 passed (including authenticated reservation boundaries, current-source/region filtering, TUS pause/resume and security regressions). The earlier old-50-MB assertion was updated to require rejection above 150 MB; no assertion was removed.
- Local typecheck and production build passed. Lint passed with the existing unrelated React Hook Form compiler warning.
- Disposable native macOS ARM64 PostgreSQL 17.11: complete migrations and restricted-login denial checks passed. This is database syntax/role evidence, not native AMD64 media evidence.
- Local AMD64 emulation failed at sandbox startup before fixture processing. It is not counted as runtime acceptance; no controls were relaxed.
- Existing approved DigitalOcean host `620470021`, native `x86_64`: isolated candidate validation passed for exact 50 MB (2.108 s), 75 MB (2.830 s), 100 MB and 150 MB (4.298 s). The 100 MB test also generated the waveform and verified AAC preview in 14.011 s total. Source frames were 24,999,989 at 192 kHz stereo (130.208276 s). Parser peak RSS was 15,454,208 bytes across the first run. The 150 MB run's Node peak RSS was 152,068,096 bytes and parser peak RSS 15,114,240 bytes. Container was network-none, read-only, UID 1000, cap-drop ALL, no-new-privileges, 1 CPU/1 GiB, 32 PIDs, 512 MiB scratch, no credentials or broker mount. Existing Landlock/seccomp installation remained mandatory in MediaTools.
- Native fixture SHA-256: 50 MB `302d54b2ea261c28441c2140ced36e9de2035188be5b4d345d5937fc2a0d3078`; 75 MB `86b0f700d6927c8b4333e58dbfd884ce519acaca0124c6feb63aef38e14d8220`; 100 MB `88b67158b902f40ba363627e813d08558b2f12114208fc23e62b744cf6644f75`; 150 MB `b1a0a1c32b935251292c7d7dfe0d3d619bf571d0374b3bbbe42f457c68dc0f61`.
- Test container and temporary host script/archive were independently confirmed removed; configured production parser and broker digests remained unchanged. No production jobs, permits or credentials were used. Candidate image remains inert in the existing Docker cache; no new infrastructure was created.
- Both candidate OCI archives, descriptors, config architecture and all layer hashes were verified; immutable identities are recorded in `large-upload-image-identities.json`. These are candidate images, not an installed release.
- Live 100 MB TUS/Storage upload, live automatic job processing, live replacement/resume and desktop/mobile UI acceptance are blocked/pending, not passed. Founder spend-cap decision and reviewed release remain required.
