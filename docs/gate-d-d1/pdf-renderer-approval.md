# Gate D deterministic receipt renderer approval

## Decision

D1 uses Option B: the existing focused deterministic renderer in `lib/gate-d/receipt.ts` is approved for the dormant Gate D TEST receipt artifact. No browser, HTML-to-PDF system, external process, network client, or new PDF dependency is introduced.

This approval is limited to the single-page internal TEST receipt produced by D1. It does not approve the renderer for contracts, tax invoices, multi-page documents, arbitrary Unicode, external images, attachments, forms, JavaScript, links, or general PDF authoring. D1 adds no receipt download UI. Before external receipt delivery, the product review must confirm the approved Sync Exchange watermark/brand treatment.

## Approval basis

- The renderer emits a fixed five-object PDF 1.4 graph: Catalog, Pages, one Page, one content stream, and built-in Helvetica.
- It performs all work in memory and never parses HTML, opens a browser, runs script, reads a URL, fetches an asset, or launches a subprocess.
- Dynamic text is normalized to printable ASCII, collapses whitespace, removes angle brackets, and is bounded per field before interpolation.
- Backslashes and PDF literal-string parentheses are escaped before content-stream construction.
- Order and PaymentIntent identities are validated, amount is a positive safe integer, currency is exactly three uppercase letters, and the date must parse.
- The renderer caps the final output at 1 MiB and labels the single page `TEST - NOT A TAX INVOICE` at the top and bottom.
- Object offsets, stream byte length, xref location, object count, deterministic bytes, and forbidden active-content tokens are covered by executable tests.
- The Storage path is derived only from the validated grant UUID. Upload uses `upsert=false`; exact downloaded bytes, MIME, length, and SHA-256 are checked before the database seals Storage object ID/version.

## Security properties proved by tests

`tests/gate-d-receipt.test.mjs` proves deterministic output, maximum size, normalization, PDF escaping, one-page structure, correct xref/object offsets, exact stream length, and absence of JavaScript, OpenAction, URI, Launch, EmbeddedFile, HTTP URL, and raw HTML markers.

`tests/gate-d-application.test.mjs` proves exact pre-existing-object adoption, no-overwrite upload, transient seal retry, lost-response retry, readback transport retry, byte/hash/MIME mismatch hold, Storage-identity conflict hold, and no consume after an integrity conflict.

## Residual constraints

The built-in Type1 font and ASCII normalization are intentional for this narrow TEST artifact. Locale-sensitive currency formatting is fixed to `en-US` and covered by deterministic tests in the pinned runtime. A future user-facing receipt system should use the separately reviewed receipt architecture and approved brand assets rather than expanding this renderer silently.
