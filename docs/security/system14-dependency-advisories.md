# System 14 — inherited dependency advisory dispositions

Source: fresh `npm audit --json` and installed/lockfile tree at baseline and after `28ae5f2`. Six affected-package entries (three High, three Moderate; zero Critical) are not six distinct vulnerable packages requiring top-level upgrades: `postcss-nested` and `tailwindcss` inherit the selector-parser issue. There are six distinct GHSA identifiers across the underlying advisories.

| Affected package entry | Installed baseline | Narrow remediation / minimum safe version | Application relevance and compatibility | Final |
|---|---|---|---|---|
| `brace-expansion` | 1.1.18; nested 5.0.9 | Overrides 1.1.21 / 5.0.12 satisfy all three advisories below | Build/lint/glob tooling; no untrusted pattern route identified. No unrelated glob major upgrade. Full tests/build pass. | Resolved locally |
| `source-map-js` | 1.2.1 | Override 1.2.2 | CSS/source-map build consumer; no uploaded source-map execution route identified. Production build passes. | Resolved locally |
| `postcss-selector-parser` | 6.1.4 | Override 7.1.6 | Trusted local CSS selectors; parser major change required by patched boundary. Existing Tailwind 3 build and browser journeys pass. | Resolved locally |
| `postcss-nested` | 6.2.0 | Retain parent; patched transitive parser 7.1.6 | Inherited selector-parser range; no unrelated parent major upgrade. | Resolved locally |
| `tailwindcss` | 3.4.19 | Retain parent; patched transitive parser 7.1.6 | Inherited parser/nested chain; no Tailwind 4 migration. | Resolved locally |
| `zod` | 3.25.76 | 4.6.6; resolver 5.2.2 required for compatibility | Validates actual attacker input. Size limits reduce exposure but do not excuse vulnerable collection validation. Adapt enum/record/error/input contracts; oversized collection and form resolver regressions pass. | Resolved locally |

| Advisory | Minimum patched boundary | Disposition |
|---|---|---|
| [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr) | brace-expansion 1.1.21 / 5.0.12 | Installed both patched lines |
| [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7) | brace-expansion 1.1.20 / 5.0.11 | Superseded by selected safe versions |
| [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) | brace-expansion 1.1.19 / 5.0.10 | Superseded by selected safe versions |
| [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) | source-map-js 1.2.2 | Installed patched version |
| [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) | postcss-selector-parser 7.1.6 | Installed patched version; inherited parent entries cleared |
| [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) | zod 4.6.6 | Installed patched version + compatible resolver |

Next 16.4.1, React 19.3.0 and Sharp 0.35.5 were retained. `npm install --ignore-scripts --no-fund` changed six package entries and added two dependencies. The final installed tree, lockfile assertions and fresh audit agree; `audit-after.json` reports zero across all severities. Hosted artifacts remain unmodified and require a separately approved rebuild/deployment/acceptance process.
