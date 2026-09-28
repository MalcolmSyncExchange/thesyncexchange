# Storage contract — PR 2

## Live evidence versus proposed canonical state

Read-only capture on 2026-09-15, approximately 22:48 UTC: production has **0** object policies; staging has **3 restrictive** object policies and the referenced-media trigger. All five bucket visibility flags match the contract below. Neither database was changed.

The old repository's 12 permissive policies were not a safe deployment target: owner-wide UPDATE/DELETE could replace reviewed audio/artwork. The forward migration explicitly removes those named policies, installs the staging-derived restrictive guards, and adds only two permissive avatar-cleanup policies. Unexpected policies are a preflight failure requiring investigation; they are not dropped indiscriminately.

| Bucket / object class | Read / SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `avatars` | Public URL delivery; authenticated artist can SELECT its canonical `{uid}/profile/{timestamp}-{uuid-or-timestamp}.{jpg,jpeg,png,webp}` objects for cleanup | Authenticated artist → validated server upload; service Storage client | No direct client UPDATE; upload new unique path | Canonical owner artist through RLS; never another owner; referenced track media still protected |
| `cover-art` | Public URL delivery, including known draft artwork URLs | Artist/admin authorized server route; server-derived namespace/file validation | No direct client UPDATE; referenced bytes immutable even for service role | Authorized server cleanup of owned, unreferenced uploads only |
| `track-previews`: preview audio | Public URL delivery; only approved tracks listed in buyer catalog | Same guarded upload workflow | Same immutability rule | Same guarded unreferenced cleanup |
| `track-previews`: waveform JSON/images | Public URL delivery | Same guarded upload workflow | Same immutability rule | Same guarded unreferenced cleanup |
| `track-audio`: full audio | **Private**. Only owner artist or platform admin through authenticated, database-scoped signer; no ordinary direct SELECT | Authorized server upload / signed upload issuance after identity, role, namespace and file validation | New path required; persisted paths cannot be overwritten/recreated, even by an old signed upsert token | Authorized server cleanup only while unreferenced |
| `agreements`: generated PDFs/HTML | **Private**. Canonical buyer owner or platform admin via order-scoped delivery; generated artifact required; 60-second signed URL or authorized stream | Trusted verified-payment/agreement-generation workflow | Trusted generation/retry workflow; no direct client UPDATE | No user deletion; any operational deletion requires separate explicit approval |

A purchase currently authorizes the agreement download, **not full source-audio delivery**. PR 2 preserves this behavior; a future paid-audio delivery route needs its own paid-order/license entitlement check. Do not solve this by opening the bucket.

Public bucket delivery bypasses object SELECT RLS by design. Public assets must never contain legal, payout, review or team information. Draft preview/artwork links are public if known; they are not confidential upload channels. Object-name obscurity is not used for full audio or agreements.

## Canonical object policies (5)

1. `Referenced track media cannot be overwritten` — restrictive UPDATE.
2. `Referenced track media cannot be deleted` — restrictive DELETE.
3. `Referenced track media cannot be recreated` — restrictive INSERT.
4. `Artists can select own cleanup avatars` — permissive SELECT, canonical role + uid + strict path.
5. `Artists can delete own cleanup avatars` — permissive DELETE, same constraints.

The all-role `guard_referenced_media_version` trigger complements RLS because signed uploads use a privileged Storage connection. It blocks changed name, bucket or version, re-creation and deletion of referenced paths. Metadata-only reads/access-time changes remain possible. It recognizes raw object paths, Storage public/signed/authenticated URLs, render URLs, percent encoding and normalized dot segments. Cross-bucket matching is deliberately conservative, supporting legacy aliases at the cost of possibly protecting same-named objects in multiple buckets.

## Verification limits

PostgreSQL tests execute actual policies/triggers and service-role bypass behavior. Application tests exercise signing, upload path checks, ID substitution, cleanup and agreement authorization. Hosted Storage byte-write/token redemption and real Supabase Auth/PostgREST sessions were **not** exercised after these changes; perform those checks on approved staging before rollout. The guard assumes Storage's content-version mechanism; do not claim a local SQL test proves hosted blob behavior.

Bucket creation/visibility/MIME configuration remains a separately approved Storage API operation. Current limits: avatars/cover-art 10 MiB, previews 25 MiB, full audio 50 MiB, agreements 20 MiB. No legacy `track-assets` bucket was found in the captures. Configured bucket aliases require an explicit policy/path review.
