# System 07 licensing contract

`PurchaseSchedule.licenseContract` is an optional, immutable extension for newly reviewed offers. Previously accepted PK03/PK06 schedules retain their original schema and behavior. No migration seeds legal text, prices, approvals, offers or commercial capabilities.

## Configuration

THE SEC → License oversight accepts an existing track/license pair, loads its current offer and records a new reviewed contract version. Both API and SQL require a canonical Admin, an active session and MFA AAL2. Updates serialize on the track and compare the expected offer ID. A material change requires a new document version. The original offer, acceptance and generated agreement remain immutable.

The new head has **no automatically copied source or delivery review**. An authorized operator must explicitly complete the existing PK08 deliverable and PK04 source review procedures. Catalog approval, rights and assets must still be current. Configuration alone cannot make a new offer purchasable, issue a license or activate commerce. In-flight accepted purchases keep their original evidence; there is no rebase or automatic replacement agreement.

The JSON contract fields are:

| Field | Meaning / validation |
| --- | --- |
| `version` | Reviewed contract version; material configuration changes also create a new exact terms version. |
| `category` | Configured category identifier/label. No hardcoded commercial taxonomy or implicit grant. Film, television, advertising, online/social/platform video, games, podcasts, corporate/branded, trailers and other approved categories are supported as data. |
| `media`, `distribution` | Explicit nonempty fixed scope for this offer. Each distinct commercial scope can use a separate reviewed offer/license type. |
| `audience`, `campaign` | Explicit fixed audience/campaign boundaries; no unreviewed client expansion. |
| `restrictions` | Additional restrictions, retained alongside rights exclusions and accepted legal text. |
| `maxDurationDays` | Integer 1–36,500. Existing independent rights-duration and validity checks also apply; the narrower limit wins. |
| `exclusive` | Boolean, must match the reviewed license and independently approved authority. |
| `renewal`, `termination` | Explicit reviewed provisions. No assumed perpetual term, automatic renewal, refund termination or governing law. |
| `approval.mode`, `approval.reference` | `synthetic` with a `SYNTHETIC…` reference, or an explicit `approved` reference. An Admin-supplied reference is an audit pointer, **not proof of counsel approval**. Synthetic references cannot masquerade as approved. |
| `pricing.version`, `sellerTier` | Reviewed pricing policy and fixed seller-tier input. This is not an automatic subscription entitlement or subscription billing change. |
| `pricing.currency` | Explicit `USD`. Other currencies fail closed until their payment/ledger rails are separately implemented and approved. |
| `basePriceCents` | Positive reviewed reference/base amount, maximum 999,999,999 minor units. It is evidence, not a fallback for a missing usage rule. |
| `commissionBps` | Must equal the independently reviewed allocation policy; existing 0–10,000 validation applies. |
| `rules` | 1–200 uniquely identified exact `use`/`territory` rules, constrained to cleared rights and excluding prohibited uses. Each records `amountCents`, `discountCents`, and an approval reference. Gross is amount minus approved discount; zero/negative totals, ambiguous selectors and unsupported currency are rejected. No client amount, override, scope multiplier or free-form formula is accepted. |

Each policy fixes category/media/distribution/audience/campaign/restrictions/tier/exclusivity. The Buyer selects use, territory, project and dates within that fixed scope. Pricing evidence freezes those inputs, the full policy, chosen rule, contract hash, exact gross/currency and rounding. Separate scopes require separate reviewed offers rather than hidden client-controlled variables.

A synthetic-only example is executable in `tests/helpers/licensing-system-fixture.mjs`. It is not imported by application code or seeded by a migration. The $55 fixture, 20% commission and allocation percentages are **test values, not founder-approved commercial policy**.

## Money and historical integrity

The database creates the authoritative price before quote insertion completes. Platform fee uses half-up rounding to a minor unit. Contributor allocations floor in declared order; the final payee receives the exact remainder. Gross equals fee plus allocations. The final quote hash includes PK04 source evidence, System05 catalog evidence and System07 pricing/terms. Acceptance copies that exact receipt; order payment amount and existing PK09 books use those frozen amounts.

Buyer comparison shows the minimum configured rule price prefixed **From**. Internal rule/approval references are withheld from public catalog projections. The actual transaction-specific review presents exact scope, price, fee, policy, discount, consent statements and terms before assent. A missing matching rule blocks quoting.

## Lifecycle and records

`licensing_private.lifecycle_events` is append-only, FORCE RLS, with no table/sequence grants to API or service callers. An Admin command records actor, database time, request UUID, expected revision, action, reason and authority reference. Repeated identical requests have one effect; conflicts/stale revisions fail. Actions are `annotate`, `terminate`, `revoke`. There is no restore, reprice, reassignment or historical document rewrite operation.

Contractual states derive as pending / issued (future accepted start) / active / expired / terminated / revoked. Issuance and payment states are separate. Verified adverse evidence remains visible even when a legacy order status still says fulfilled. Refunds/disputes impose existing payment/delivery holds; they do not themselves assert contractual termination. A reviewed contractual termination/revocation fences issuance and every broker/ticket authorization. Already received bytes cannot be remotely erased. Historical agreements remain downloadable by the original Buyer and MFA Admin as retained evidence, including after refund/termination.

Buyer records expose only owned transaction evidence. Artists receive bounded own-catalog summaries tied to both current catalog ownership and the original accepted seller, with no Buyer identity/project, private agreement, rights evidence, contacts or contributor allocations. Order value is labeled separately from payable earnings. SEC exact-evidence access requires MFA; internal correction reasons and authority references are not exposed in Buyer lifecycle history.

Material amendments and renewals require a separately reviewed agreement and fresh assent. This package does not invent a renewal price or automate renewal checkout.

## PDF behavior

The active agreement worker uses the exact accepted schedule. PDFKit 0.20.2 embeds bundled, pinned SIL OFL Noto fonts; there are no runtime font downloads, system-font dependencies or user-controlled file paths. Fonts cover Latin/Greek/Cyrillic, Arabic, Devanagari and CJK scripts. Unsupported glyphs, invalid surrogate/control text and documents above the existing 10 MB secure-delivery limit fail generation and retain recoverable job state. Coverage is not claimed for every Unicode script or emoji.

PDFs include exact accepted legal text and the complete immutable transaction/acceptance receipt, with independent master/composition pools. The renderer no longer substitutes ASCII spaces or displays Unicode escapes instead of legal names. It uses measured text wrapping, pagination, approved logo/watermark assets, page numbers and a noncommercial label on every synthetic page. The repository's actual approved light horizontal logo is used; the older `Primary_Logo_Light_Mode.png` reference is absent from this baseline.

PDF/HTML byte hashes remain recorded by the existing fenced worker. Existing fulfilled artifacts are not regenerated. This is an authenticated assent receipt, not a rightsholder signature, cryptographic signature, PDF/UA certification or legal approval. Browser PDF bytes are authorized through a deliberate POST against the trusted configured public origin, then ownership, integrity and persistent audit checks. Internal proxy URL normalization cannot substitute for that trusted origin.

Font revisions, SHA-256 values, sizes and redistribution notices are in `assets/license-fonts/manifest.json`, `OFL.txt` and `OFL-CJK.txt`. Renderer API reference: https://pdfkit.org/docs/text.html.

## Session and attribution corrections

A provider-valid JWT can survive session revocation. Quote creation, quote reads, acceptance (including repeat acceptance), and Buyer acceptance reads now use the same canonical active-session check. Agreement inspection/download also verifies the active session before acquiring privileged access. Synthetic fixtures create an active Buyer session only when callers omit the session parameter; explicitly empty/deleted/malformed sessions remain negative cases.

The agreement's Artist display comes from the immutable approved catalog metadata when present. Legal seller/rightsholder identities remain separately identified; a label or seller company is not silently substituted for the approved Artist credit.

New delivery contracts use the exact accepted amount, license identity and separate master/publishing pools after all existing purchase checks. Legacy contracts without acceptance retain the original strict catalog-price fence and cannot acquire newly fabricated assent. Existing frozen contracts are never repriced. This is licensing evidence integration with the existing adapter, not System 08 checkout implementation.
