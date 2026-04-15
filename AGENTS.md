# AGENTS.md

## Project Overview

The Sync Exchange is a premium sync licensing marketplace built for three user roles:

- `artist`: submit music, manage catalog and rights, configure payouts
- `buyer`: search approved tracks, save favorites, purchase licenses
- `admin`: review submissions, manage users/orders, handle compliance

Main app areas:

- marketing site
- auth and account recovery
- onboarding
- artist workspace
- buyer workspace
- admin workspace
- API routes for checkout, agreements, webhooks, and auth confirmation

---

## Repo Structure

- `app/`: Next.js App Router routes
  - `app/(marketing)`: public marketing pages
  - `app/(auth)`: `/login`, `/signup`, `/forgot-password`, `/reset-password`
  - `app/onboarding`: canonical onboarding routes
  - `app/(app)/artist`, `app/(app)/buyer`, `app/(app)/admin`: main workspaces
  - `app/dashboard/*`: dashboard alias routes that redirect into canonical workspaces
  - `app/auth/confirm/route.ts`: Supabase email confirmation / recovery callback
  - `app/api/*`: checkout, agreements, Stripe webhook handlers
- `components/`: reusable UI grouped by domain
- `services/`: auth, Supabase, Stripe, domain logic
- `lib/`: env config, validation, helpers
- `middleware.ts`: protected-route gate

---

## Tech Stack

- Next.js 14 App Router
- TypeScript
- Tailwind CSS + shadcn UI
- React Hook Form + Zod
- Supabase (auth, DB, storage)
- Stripe (payments)
- Vercel-style deployment
- npm

---

## Decision Hierarchy

When rules conflict, follow this priority order:

1. Auth and routing rules  
2. Supabase and environment rules  
3. Existing code patterns  
4. UI/UX expectations  
5. Engineering standards  

Never override auth or routing rules for convenience.

---

# The Sync Exchange brand asset rules

All approved brand assets live in:

/public/brand/the-sync-exchange/

## Logos
- /public/brand/the-sync-exchange/logos/Full Logo.png
- /public/brand/the-sync-exchange/logos/Icon_Gold.png

## App icons
- /public/brand/the-sync-exchange/app/AppIcon_1024.png
- /public/brand/the-sync-exchange/app/AppIcon_512.png
- /public/brand/the-sync-exchange/app/AppIcon_256.png

## Watermark
- /public/brand/the-sync-exchange/watermark/Watermark.png

## Usage rules
- Use /public/brand/the-sync-exchange/logos/Full Logo.png as the primary logo across marketing, auth, onboarding, dashboard, and platform surfaces unless a compact icon is more appropriate
- Use /public/brand/the-sync-exchange/logos/Icon_Gold.png for compact icon placements, favicon-style references, auth screens, badges, and UI areas where the full horizontal logo is too large
- Use /public/brand/the-sync-exchange/app/AppIcon_1024.png, /AppIcon_512.png, and /AppIcon_256.png for app icon and metadata references where appropriate
- Use /public/brand/the-sync-exchange/watermark/Watermark.png for licensing, export, delivery, confirmation, and downloaded asset experiences
- Do not invent new logo treatments
- Do not redraw the logo using text
- Do not crop, stretch, rotate, recolor, or restyle the logo assets
- Preserve aspect ratio
- Remove any mismatched background containers, cards, pills, shadows, borders, or surface styling behind logo images if they make the logo appear boxed in
- If a PNG has a baked-in background that cannot be fixed in code, implement it as cleanly as possible and report where a transparent replacement asset is needed