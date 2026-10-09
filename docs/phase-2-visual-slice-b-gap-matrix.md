# Visual Slice B — current vs frozen design

Baseline: `97b3494286fa5e63c140652367734e2022ce7998` / tree `bb49dcd9dd887347090ae79a9f51e38942656e83`. This matrix was prepared before Slice B implementation. The frozen Phase 2 V1 prototype, handoff, status vocabulary, and applicable errata are the design reference; existing authorized data and security contracts determine truthful production adaptations.

| Surface / field | Frozen target | Baseline | Classification | Slice B disposition |
| --- | --- | --- | --- | --- |
| Catalog shell and first use | Editorial heading, compact working library, separate first-use state | Matching shell and Visual Slice A first-use state | MATCH | Preserve |
| Catalog summary | Lightweight counts; prototype also shows licenses and revenue | Total, discoverable, in review, drafts | BACKEND-TRUTH ADAPTATION | Keep only authoritative counts; no fabricated commerce metrics |
| Search | Title, version, ISRC | Title, slug, genre, subgenre; placeholder omits actual subgenre and implies no ISRC | BACKEND-TRUTH ADAPTATION | Label actual supported fields; version/ISRC deferred |
| Status filters | All, Discoverable, In review, Draft | Same, while rejected/archived remain in All | MATCH | Preserve; make exception status clear in rows |
| Catalog status | Scan-friendly canonical status | Buyer visibility pill first, review state in small secondary text; Draft reads as Not discoverable | MATERIAL DEVIATION | Show authoritative review/visibility status without conflating domains |
| Row density and artwork | Compact artwork-led library with explicit track entry and preview | Six columns; working thumbnail and preview action | MINOR DEVIATION | Tighten hierarchy and maintain play/Detail separation |
| Mobile Catalog | Track identity and primary status; secondary facts in Detail | Full stack of Assets, Rights, Licenses, Updated per row; 36px play target | MATERIAL DEVIATION | Compact cards, readable long titles, 44px preview target, clear Detail entry |
| Catalog rights | Recording and Composition separate; no generic split completion | Legacy records explicitly identified, no readiness claim | BACKEND-TRUTH ADAPTATION | Preserve truthful legacy label |
| Catalog assets and licensing | Honest current inventory and configured offers | Reference-derived counts and active option count | MATCH | Preserve; do not infer delivery or transaction readiness |
| Track Detail header | Artwork, identity, canonical status, metadata, Buyer Preview and edit | Most fields present; status is only Buyer visibility; no version or ISRC in model | MATERIAL DEVIATION / BACKEND-TRUTH ADAPTATION | Distinguish review state; omit unsupported version/ISRC |
| Track Detail player | Working shared Buyer preview player | Real shared play control plus decorative static progress graphic | MATERIAL DEVIATION | Remove implied playback progress; retain real shared player |
| Track Detail tabs | Read-first Overview, Audio & Assets, Rights & Splits, Licensing, Activity, Analytics | Present, with deferred Activity/Analytics and unavailable rights layers | MATCH / BACKEND-TRUTH ADAPTATION | Preserve |
| Track Detail readiness | Truthful domain statuses | Core metadata called Complete from only title, genre, duration; audio called Ready from references | MINOR DEVIATION | Phrase as recorded core fields/references, not verified readiness |
| Buyer Preview | Dedicated buyer-safe route, separate from internal Detail | Owner-scoped route and narrow buyer DTO | MATCH | Preserve; improve entry clarity only |
| Loading and error | Skeleton, recovery, no stale fixture content | Present on Catalog and Detail | MATCH | Preserve and test |
| Dark/light and accessibility | Related brand surfaces, textual statuses, keyboard/touch/focus | Present; mobile targets and long content need attention | MINOR DEVIATION | Check 1440/1024/390/320, both themes, axe and keyboard |
| Safari hard-load | No material delay | Existing ~40-second production Catalog hard reload at zero tracks | EXISTING FOLLOW-UP | Diagnose read-only; no unrelated rewrite |

The frozen prototype contains hypothetical revenue, play counts, rights completion, version, ISRC, and waveform detail. These are not production claims until authoritative data/contracts exist. Slice B will not create data, schema, payment, storage, authorization, or media processing behavior to imitate those examples.
