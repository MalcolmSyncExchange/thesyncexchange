# Phase 15A — source and migration inventory

Baseline: `f730174e5ce20d12c3f09a7e9281d582ec4ebdcb`. Each source below is an ancestor of that commit; integration started from its complete tree. No cherry-pick, merge, shared-branch change or conflict resolution was needed. The new candidate adds only the notification-worker adapter and qualification coverage.

| Completed system branch | Exact accepted source commit | Contained |
|---|---|---|
| `codex/system01-authentication` | `b87e943f6e2d5c7245b31149107bf0cce0150ff6` | Yes |
| `codex/system02-artist-onboarding` | `d34add3ebab4ff03fe877d2687ea4c085868cbdd` | Yes |
| `codex/system03-music-uploads` | `0899704634b4cbf08d0b255191d0c8611f051981` | Yes |
| `codex/system04-rights-verification` | `c1d23a41ef77e26a73514f0261aedd9a3d78239a` | Yes |
| `codex/system05-catalog-management` | `05e19f2b44ac12c0d7f1c2c5bb4c1b552bc5041b` | Yes |
| `codex/system06-buyer-marketplace` | `8c3d12af98441b06b0a52875a41353c06a833fc7` | Yes |
| `codex/system07-licensing` | `566979cd332b8b2cf17f6e6856cba4634450279e` | Yes |
| `codex/system08-checkout-payments` | `745f9f7c4b7cc6c0740f18e513b2e8218395ce82` | Yes |
| `codex/system09-secure-delivery` | `659bd0eb6d1be2def6c5cd866d59b7d8820c1487` | Yes |
| `codex/system10-financial-accounting` | `38c68e780da51d0667d15bf4362c7bacd1a45686` | Yes |
| `codex/system11-sec-admin` | `5c40d6858ba69dd51492cdcfc38fe2feb8af1e63` | Yes |
| `codex/system12-posthog-analytics` | `2e5c58c724805852269d2ae52e6081b67b7e0c53` | Yes |
| `codex/system13-email-notifications` | `e24b5a89aa4781a66adce772fedc5a5a724dae04` | Yes |
| `codex/system14-security-hardening` | `f730174e5ce20d12c3f09a7e9281d582ec4ebdcb` | Yes |

All67 migration files are byte-identical to the System14 baseline. No migration was added or rewritten. `output/phase15a-final-integration-2026-10-24/migration-manifest.json` records every ordered filename and SHA-256; `source-commits.json` records the ancestry proof. Existing PK03/04/06/07/08/09, ingestion/recovery and independent-review corrections are retained through these cumulative ancestors. Source tips include acceptance reports, not just implementation commits.
