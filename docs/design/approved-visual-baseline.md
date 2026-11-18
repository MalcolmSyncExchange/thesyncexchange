# Approved visual baseline and homepage recovery

Recovered October 25, 2026. Scope: restore the homepage and canonical logo delivery; stop for founder review before fixing other visual issues. This reference preserves existing approved design, not a redesign mandate.

## Authority and source chain

- `a92d835`: approved blue logo-pack integration, an intermediate implementation. Its old two-column homepage and stacked logo are **not** the latest baseline.
- `fd19b58` → `623563e` → `02e9ae5` → `1ef2438`: horizontal lockups, theme-specific white/dark lettering, corrected rounded S, shared header/footer geometry. Frozen UI Refinement V1 authority: `1ef2438313bdcd15928fe24063d4c75065a6dca1`.
- `97706b5`: repository-documented approved Public Website Design V1 / Direction 2 Music Index, September 29 messaging and brand overlays, preserved security boundaries.
- `840bfbd`: full-width cinematic hero, staggered entrance and scroll depth, reduced motion and mobile styling.
- `54689dc`: final 1942×809 artwork and 800×809 / 400×404 mobile derivatives; restrained scale/blur.
- `e402edd`: removed custom global cursor/glow. Do not revive that retired experiment.
- `572bc80` → `e83831d7d488b7f01a63fdfcfd4d588f6e655731`: final buyer-first public header labels/order. PR26, authored and merged by the founder's GitHub account, describes these approved overlays and was merged as `70d3134` on October 1 Phoenix time.
- Later favicon `0bde1fa` remains preserved. Current 14-system production source `bce2abddcdfc90522b07ee0b5e05c3f0beeedda9` retains these homepage, logo and CSS sources. No source rollback is appropriate.

Primary records: [PR26](https://github.com/MalcolmSyncExchange/thesyncexchange/pull/26), `docs/ui-reconciliation-production-sync.md`, `docs/branding/logo-integration-v1.md`, `docs/onboarding-discovery-ux.md`. Repository approval evidence is strong for these public surfaces; this does not invent unavailable original workshop decisions or certify every subsequently built private workflow as visually founder-approved.

## Area reference

| Area | Recovered authority / relevant files | Expected appearance | Production comparison / confidence |
|---|---|---|---|
| Homepage | `54689dc` + `97706b5`; `components/marketing/homepage.{tsx,module.css}` | Full-width blue-glass/chrome sound waveform, quiet left copy, reflective floor; “Find it. Clear it. License it.” | Desktop incorrectly displayed enlarged light logo in hero. Layout/copy/CSS intact. High confidence. |
| Global navigation | `e83831d`; `components/layout/site-header.{tsx,module.css}` | Discover, For Buyers, For Artists, How It Works; Log in / Sign up; centered links and cyan hover/focus | Current labels/routing agree. Preserve. High. |
| Header logo | `1ef2438` / `97706b5`; `components/layout/brand-assets.tsx`, `public/brand/the-sync-exchange/logos/*horizontal*` | Complete blue S; white SYNC on dark, dark SYNC on light; cyan THE / EXCHANGE; dedicated mobile source | Desktop dark image URL delivered cached light-logo pixels. Mobile direct source was correct. High. |
| Typography | `39b6fa0` + `97706b5`; `app/globals.css`, `components/layout/sync-surface.module.css`, homepage CSS | Restrained sans-serif, large semibold headings, spaced eyebrows and muted explanatory text | Homepage source unchanged; no independent typography regression confirmed. High for public baseline. |
| Color palette | Same sources; CSS variables and `.dark` rules | Near-black/navy surfaces, cyan actions, fine borders; light variant and persisted theme | Current theme surfaces intact; logo delivery mismatched selected theme. High. |
| Buttons | `97706b5`; `components/ui/button.tsx`, homepage/header CSS | Cyan primary, outlined secondary; 44–48px actions, clear focus and restrained hover | Preserve sizes, labels, links and focus. No confirmed structural regression. High. |
| Background imagery | `54689dc`; three `public/images/sync-sound-sculpture-hero*.webp` files | Original waveform composition; no text/logo/UI baked into image | Originals match Git and direct production paths byte-for-byte. Query-optimized desktop request cached unrelated logo. High. |
| Animations | `840bfbd` / `54689dc`, header `572bc80`; homepage/header CSS | 0.72s staggered copy entrance; 1.008–1.018 scroll depth where supported; reduced-motion immediate content | Actual live browser reported entrance animations finished and scroll depth running. Animation was not removed; wrong image obscured intended effect. High. |
| Authentication | `97706b5`; `app/(auth)`, `components/forms`, shared auth shell | Matching dark/light treatment and approved login/recovery copy; current secure forms retained | Sign-in/MFA behavior changed under System01 intentionally. Compare shells only; no auth rollback. Private form-specific visual approval needs founder verification. |
| Artist Desk | `39b6fa0` and `docs/onboarding-discovery-ux.md`, approved artist option3; `components/artist/artist-workspace-shell*` | Full-height sidebar, grouped navigation, account-wide totals above track journey, thin borders | Current systems add new data/workflows. Do not replace them with historical prototype. Full current-screen visual match needs founder verification. |
| Buyer Marketplace | `39b6fa0` / `97706b5`; buyer shell/catalog/player components | Shared workspace direction, audition rows, filters, persistent player and canonical branding | System06 expands verified discovery/preview behavior. Current catalog is empty; populated comparison unavailable. Needs founder verification for detailed current screens. |
| Track detail | Historical `55ad5f0` / `bbca8d1` / `79d1e01` candidate work; `app/(app)/buyer/catalog/[slug]` | Existing workspace geometry; approved data-safe behavior preserved | No approved production track exists. No definitive final founder visual authority recovered for current System06/07 detail layout. Needs Founder Verification. |
| Licensing | System07 / PK03/06 functional acceptance; license-selection components | Preserve rights, exact terms, acceptance and legal evidence | Functional approval does not establish visual approval. No completed production license to capture. Needs Founder Verification. |
| Checkout | System08 / PK07 functional authority; `app/(app)/buyer/checkout` | Preserve payment/rights/acceptance recovery and disabled commerce | No production order; no purchase attempted. Historical styling is reference only. Needs Founder Verification. |
| THE SEC | Admin V2 branches and System11; admin shell/dashboard | Current canonical Admin/MFA controls and operational navigation | Read-only current Admin screenshot captured; logo affected by shared cached pixels. Exact original final visual approval for expanded modules not recovered. Needs Founder Verification. |
| Mobile responsiveness | `54689dc` / `e83831d`; 700px hero and 1000px header breakpoints | Dedicated mobile art, stacked full-width CTAs, responsive menu, no horizontal overflow | Mobile source already selected directly; preserve same crop, overlays and motion preference. High for public surfaces; other workflow coverage pending. |

## Confirmed root cause

The deployed commit has no homepage/brand-source delta from `e83831d`. Exact asset hashes also match. Browser CDP captured three distinct `/_next/image?url=...&w=...&q=...` requests returning the **same** 46,448-byte WebP (SHA256 `f11aa607fa1c5da40b506dda01a750a5a0ddd8856f58e454ae9a9f239be7aad4`): the light logo, dark logo and desktop hero. The returned `Netlify-Vary` names `__nextDataReq|_rsc`, omitting image `url`, `w`, `q`. The browser subsequently served those incorrect bytes from disk cache. No service worker was involved.

Direct original files and fresh independent optimizer requests return correct distinct images; those checks alone therefore missed the affected browser cache state. Native dimensions/pixels, not only HTTP200 or nonzero naturalWidth, are required visual evidence.

The production manual `--no-build` publication command in retained evidence did not use the repository's `withPreparedDeployConfig` wrapper; missing adapter routing is consistent with the image endpoint reaching the general Next handler. Do not claim that inferred upstream trigger is conclusively proven without the prior deployed configuration. The confirmed defect is response aliasing/cached wrong image content. Netlify's [cache-key documentation](https://docs.netlify.com/build/caching/caching-overview/) explains why omitted query fields cannot distinguish these assets.

## Focused correction and regression inventory

- **P1 / homepage hero:** serve the existing approved desktop WebP directly with `unoptimized`; retain native mobile picture sources, all CSS, layout, text, transitions and reduced-motion support.
- **P1 / shared header branding:** serve existing theme-specific PNG files directly in `BrandLogo`, `BrandHeaderLogo`, `BrandFooterLogo`. No recolor, crop, filter, substitution or new asset. This also avoids an already-cached bad optimizer response for existing visitors.
- **P2 / shared private-shell branding:** same canonical component correction; verify representative shell without changing its layout. Other private screen design differences remain verification items, not confirmed regressions to fix now.
- **P2 / qualification gap:** previous smoke accepted image loading/HTTP200 without proving image identity. New tests preserve seven exact approved asset hashes and render real Next Image logo output to reject query-cache delivery; production/local checks must inspect actual hero/logo pixels, native dimensions and mobile selection.
- Visible Sign up / List your music links while registration is closed are a separate pre-existing testing-message issue, not a design-recovery scope change. No correction here.

Tradeoff: direct desktop hero is209KB rather than an approximately126KB optimized1920 derivative; original responsive mobile30KB/102KB sources are preserved. Correct approved pixels and stable path-based delivery take precedence over that bounded optimization saving. Other product images keep existing optimization behavior.

## Release and preservation

No changes to auth, middleware, rights, checkout, payment verification, database, Storage policies, workers, analytics or account data. Keep all existing production safety restrictions and preview protection. Publish only the reviewed isolated correction, using the generated Netlify adapter configuration for manual upload. `.netlify/` is already ignored. Lock the new published deployment against automatic replacement by a later Git-CD push.

Validate asset identity, desktop/mobile and light/dark rendering, entrance/reduced motion, keyboard/mobile navigation, auth redirects, full unit suite, typecheck, lint and production build. Preserve the prior deployment; use a forward correction if a published change fails. Full formal QA remains separately Not Run.
