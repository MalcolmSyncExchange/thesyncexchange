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

## Local Development

Install:

```bash
npm install