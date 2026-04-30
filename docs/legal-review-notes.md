# Legal Review Notes

This app now generates a real agreement PDF artifact, but engineering implementation is not the same thing as legal approval.

## Code areas that need legal review

- [`/Users/malcolmw/Documents/The Sync Exchange.2/lib/licenses/generated-license-snapshot.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/lib/licenses/generated-license-snapshot.ts)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/lib/licenses/templates/sync-license-template.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/lib/licenses/templates/sync-license-template.ts)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/services/agreements/server.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/services/agreements/server.ts)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/automated-license-generation.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/automated-license-generation.md)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/lib/demo-data.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/lib/demo-data.ts) for demo-mode fallback licensing language
- [`/Users/malcolmw/Documents/The Sync Exchange.2/app/(app)/artist/payout-settings/page.tsx`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/app/%28app%29/artist/payout-settings/page.tsx) for finance/tax collection expectations

## Items for counsel/product review

- final license language for each offered license type
- generated-license agreement numbering format and whether it should be contractually referenced
- exclusivity wording and carve-outs
- rights-holder representations and warranties
- indemnity language
- governing law / venue / dispute handling
- refund / revocation handling
- what happens to agreement state on refund or chargeback
- whether the generated agreement artifact is sufficient as a countersigned instrument or should remain a commercial confirmation only
- whether buyer/company identity requirements are sufficient for automated clickwrap sync purchases
- whether credit language should be binding for broadcast / trailer / exclusive tiers
- the artist payout/tax collection workflow that should exist before live royalty disbursement

## Visible issues already cleaned up in code

- removed an obvious `TODO` notice from the generated HTML agreement artifact
- removed user-facing placeholder language from the pricing page
- removed user-facing payout placeholder fields in the artist payout settings view
- replaced the demo-only exclusive buyout summary so it no longer shows raw placeholder text if demo mode is ever used

## Engineering status

- agreement generation is PDF-based and purchase-time terms are snapshotted in `public.generated_licenses`
- agreement artifacts are stored privately
- buyer delivery is authorization-gated
- admin visibility and manual retry exist for success/failure states

## Not yet represented as legal approval

- generated license snapshot presets in code
- automated sync-license template copy in code
- product-drafted agreement language that still needs counsel signoff
- launch readiness from a legal/commercial standpoint
