# Approved logo integration

This branch replaces the legacy gold/X logo family with the approved blue Sync Exchange logo pack. It changes branding assets and their presentation only.

## Audited reference points before migration

- Shared UI branding: `components/layout/brand-assets.tsx`.
- Public header and footer: `components/layout/site-header.tsx`, `components/layout/site-footer.tsx`.
- Auth, email action, onboarding, app shell, artist/buyer workspace, and license confirmation consume the shared logo component.
- Generated license HTML referenced the legacy primary logo directly in `lib/license.ts` and `lib/licenses/templates/sync-license-template.ts`.
- License confirmation and generated license HTML referenced `Watermark.png`.
- Browser/PWA icons were configured in `app/layout.tsx` and `app/manifest.ts` and served from the root of `public/`.
- Open Graph and Twitter used the legacy 1024 app icon.

## Canonical mapping

| Asset | Use |
| --- | --- |
| `website-header-horizontal-dark-transparent.png` | Dark-theme desktop public header; dark auth, onboarding, workspace, and confirmation headers |
| `website-header-horizontal-light-transparent.png` | Light-theme desktop public header; light auth, onboarding, workspace, email, confirmation, and generated license headers |
| `website-mobile-header-horizontal-dark-transparent.png` | Dark-theme mobile public header |
| `website-mobile-header-horizontal-light-transparent.png` | Light-theme mobile public header |
| `website-footer-horizontal-dark-transparent.png` | Dark-theme public footer |
| `website-footer-horizontal-light-transparent.png` | Light-theme public footer |
| `website-wordmark-transparent.png` | Cleaned approved wordmark source; not used alone in global headers or footers |
| `website-symbol-transparent.png` | Shared compact brand icon and licensing watermark source |
| `master-logo-transparent-2400x1400.png` | Canonical transparent master asset |
| `master-logo-dark-2400x1400.png` | Canonical dark-background master asset |
| `app-icon-1024x1024.png` | High-resolution app icon metadata |
| `apple-touch-icon-180x180.png` | Apple touch icon and root compatibility copy |
| `favicon-512x512.png` / `favicon-192x192.png` | PWA/manifest icons and root compatibility copies |
| `favicon-96x96.png` / `favicon-32x32.png` | Browser icon metadata and root compatibility copies |
| `social-profile-logo-1080x1080.png` | Canonical social profile asset |
| `social-share-og-1200x630.png` | Open Graph and Twitter summary image |

The theme-specific horizontal lockups are deterministic composites of the approved symbol and approved wordmark pixels. Dark assets preserve white `SYNC`; light assets contain a near-black `SYNC` while the approved S gradient, cyan `THE`, and cyan `EXCHANGE` remain unchanged. The defective partial-symbol fragment in the supplied wordmark source is absent from the cleaned repository copy and every horizontal output. Theme selection swaps actual PNG files; it does not use CSS filters, masks, blend modes, cropping, recoloring, or redraws. The required 16px, 48px, and `.ico` files are generated from the approved symbol/32px favicon without altering the mark.

## Browser evidence

The reconciliation browser suite in `e2e/ui-reconciliation.spec.mjs` captures the
desktop and mobile public, authentication, buyer, and artist surfaces to a local
temporary directory. It also verifies that header and footer render the same
canonical logo source in each theme, that theme choice survives navigation, and
that responsive navigation remains keyboard accessible. Generated screenshots
remain local review artifacts and are intentionally excluded from source control.
