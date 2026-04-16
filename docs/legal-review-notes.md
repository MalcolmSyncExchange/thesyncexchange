# Legal Review Notes

This app now generates a real agreement PDF artifact, but engineering implementation is not the same thing as legal approval.

## Code areas that need legal review

- [`/Users/malcolmw/Documents/The Sync Exchange.2/lib/license.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/lib/license.ts)
- [`/Users/malcolmw/Documents/The Sync Exchange.2/services/agreements/server.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/services/agreements/server.ts)

## Items for counsel/product review

- final license language for each offered license type
- exclusivity wording and carve-outs
- rights-holder representations and warranties
- indemnity language
- governing law / venue / dispute handling
- refund / revocation handling
- what happens to agreement state on refund or chargeback

## Engineering status

- agreement generation is PDF-based
- agreement artifacts are stored privately
- buyer delivery is authorization-gated
- admin visibility exists for success/failure states

## Not yet represented as legal approval

- “default” agreement copy in code
- placeholder or product-drafted language
- launch readiness from a legal/commercial standpoint
