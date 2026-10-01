# UI refinement production reconciliation

Status: review candidate
Base commit: dda7378184c1f2ce5a78928c51767b9e7f855d08
Frozen implementation authority: 1ef2438313bdcd15928fe24063d4c75065a6dca1

## Approved authorities

1. Public Website Design V1, Direction 2 — Music Index.
2. Public Website Design V1 messaging revision, frozen September 29, 2026.
3. Public Website Design V1 brand asset conformance revision, frozen September 29, 2026.
4. UI Refinement V1 implementation, frozen at 1ef2438.

The messaging and brand revisions are approved design overlays newer than the frozen implementation commit. This release ports them onto current production code without replacing the PR #24 or PR #25 security behavior.

## Delta matrix

| Area | Current production | Latest approved design | Action |
| --- | --- | --- | --- |
| Homepage | Earlier product headline and three-step copy | “Find it. Clear it. License it.” with rights limits | Port approved copy into current responsive layout; retain approved sound-sculpture art |
| Header | Six public links and Get started | Discover, For Artists, For Buyers, How It Works; Login; Sign up | Use the approved compact information architecture |
| Footer | Earlier grouping and “Discover. Save. License.” | Product, Company & help, Legal; master slogan | Port approved links and signoff |
| Logo | Legacy production assets | Corrected canonical rounded S with shared header/footer geometry | Port frozen assets and theme-aware logo component |
| Desktop/mobile logo | Legacy lockup | Dedicated responsive light/dark assets | Use picture sources and preserve aspect ratio |
| Favicons/app/social | Legacy symbol assets | Approved icon and social-share pack | Replace metadata and root icons |
| Login | Earlier workspace copy | “Pick up where you left off.” | Port copy only; retain session and redirect behavior |
| Signup | Earlier role copy | One person, one account; explicit permission note | Port copy only; retain current auth actions |
| Password recovery | Earlier dense copy | Plain recovery instructions | Port frozen implementation copy |
| About | Short marketplace summary | Disconnected-steps problem and two-sided explanation | Port approved messaging |
| For Artists | General upload benefits | Profile, separate rights layers, offer settings, payout timing | Port approved messaging |
| For Buyers | General search benefits | Find, understand the offer, license, retain record | Port approved messaging |
| How It Works | One shared three-step story | Separate buyer and artist paths | Port both paths |
| Pricing | Unapproved $39/mo value | Architecture with final amounts pending | Remove invented values |
| Rights & licensing | Missing | Plain-language rights and review limits | Add public explanatory page |
| FAQ | Missing | Rights, licensing, account questions | Add accessible disclosure list |
| Discover | No public entry route | Public discovery in approved design | Add public entry page; keep live catalog behind current buyer authorization |
| Public Artist/Track | Not present | Buyer-safe public pages | Defer until an approved anonymous data contract/RLS path exists |
| Typography/buttons/focus | Production baseline | Frozen refinement styling | Port CSS and component refinements |
| Cursor glow | Larger radius | Reduced radius | Port 140px frozen setting |
| Theme persistence | Route resets possible | One saved choice across surfaces | Port shared theme storage key |
| Buyer/artist shells | Legacy logo use | Canonical brand component | Port branding only; keep authorization and data behavior |

## Security reconciliation

PR #25 restricts buyer catalog views to authenticated buyer/admin roles and the server query requires buyer scope. The approved public design assumed anonymous search and preview. This branch does not loosen RLS, add service-role reads, or fetch private data on public routes. The Discover page is a marketing entry that sends users through login to the authorized buyer catalog.

Public data-backed Artist and Track pages remain deferred until the product has an approved anonymous buyer-safe contract and matching database policies. This is an application/security dependency, not a remaining visual decision.

No Supabase migration, Stripe code, authentication action, middleware rule, API route, storage policy, or data contract is changed by this reconciliation.
