# System 13 — Email and notifications contract

Local implementation only. No provider send, SMTP change, DNS edit, hosted migration, cron, analytics or commerce activation is authorized. Systems 01–12 are inherited from `2e5c58c724805852269d2ae52e6081b67b7e0c53`. Stop before System 14.

## Baseline reviewed

System 01 owns signup/resend, single-use verification, scanner-safe email-action interstitial, safe callback redirects, recovery and password/email changes. Canonical roles, active provider sessions and current Admin MFA are preserved. Existing Supabase Auth transport is retained; the application had no Resend send adapter or transactional outbox. Buyer preferences previously defaulted marketing on and allowed receipts to be disabled. The System 13 migration/UI/API correct these boundaries. System 12 analytics collection and all financial/licensing safeguards stay independent.

## Source and recipient authority

`notifications_private.customer_sources`, `admin_signals` and `sources` project canonical retained evidence outside critical transactions. There is no general authenticated enqueue endpoint, arbitrary recipient API, user-supplied order/amount, webhook-triggered payment effect or critical-path mail trigger. Failed collection cannot roll back a purchase or license; source rows remain available for catch-up. The activation cutover is explicit: `configuration.source_from` defaults to installation time. Older source rows are not silently backfilled.

- Provider-confirmed account, Artist onboarding, media submission/processing, rights decisions/review requests and catalog review/publication transitions use the corresponding canonical subject account.
- Buyer purchase confirmation requires original signed PAID evidence, exact account/session/intent/amount/currency/order/track/license bindings, immutable acceptance hash and absence of QA waiver grants. Generated agreement and active licensed-asset notices require their respective records. Asset availability is coalesced per order.
- Signed failure/refund/partial-refund/dispute facts, fulfillment state history and original order ownership drive adverse/recovery notices. Independent contractual termination/revocation notifies the original Buyer and frozen seller; it cancels unsent agreement/asset availability even when the payment projection remains PAID. A later refund cancels unsent success notices; already sent history is never rewritten. Templates instruct users to check current authenticated records.
- Artist licensing activity uses the immutable purchase-time seller identity, preserving notification ownership after later catalog changes. Earnings reflect booked purchase and adjustment journals; contributor identity is bounded to the journal-time binding. Supported payout-workflow updates use the frozen payout request Artist/binding, never a later replacement payee. Synthetic ledger activity and simulated payouts are never represented as cash transfers.
- Public support replies notify only their case owner. Admin notes and full reply bodies never enter messages.
- Essential account access/permission changes use canonical SEC ownership. Admin review, moderation, media/checkout/delivery failures, reconciliation exceptions, disputes, escalations, worker recovery/dead letters and permissions alerts require current canonical Admin appointment access. Alerts coalesce per kind/Admin/UTC hour. No email contains Buyer/Artist identity, rights evidence, financial amount, conversation body or private asset URL. Detailed facts require authenticated SEC access with current MFA/full capability. Email-delivery alerts exclude their own failures to prevent recursive alert storms.

## Immutable request and reliable delivery

Private FORCE-RLS tables contain outbox, preferences, immutable attempt/provider-event/conflict history, suppressions and collection runs. No anon, authenticated or service API role has direct private-schema access. Narrow public RPCs explicitly require service-role claims or authenticated active canonical accounts; Admin operations also require current MFA/full scope. No broad null-Auth bypass is introduced.

Collection is serialized and deduped by canonical source identity. Queue recipient account/role/address, event time, template version and order association are immutable. Claim and immediate pre-send checks require current verified provider email, unchanged canonical role/address, eligible original source, preferences, restrictions, active Admin appointment when relevant and absence of suppression. Security restriction notices may reach the restricted account; ordinary notices are held. No pending email is retargeted to a replacement address.

`FOR UPDATE SKIP LOCKED` supplies one 60-second lease, six attempts and exponential 30-second backoff capped at one hour. Recovered requests retain one UUID/provider idempotency key. A SHA-256 seal binds the rendered subject/HTML/text/recipient and sender settings before HTTP. A changed request is dead-lettered before HTTP. The fixed Resend endpoint disallows redirects; credentials remain server-only; requests time out after ten seconds; response bodies and webhook bodies are bounded. Network errors, ambiguous successful responses, 429 and 5xx retry. Other 4xx are held; 401/403 require configuration review. Retries stop after twenty hours from first attempt, inside Resend's documented 24-hour idempotency period. Late unknown sends require provider reconciliation; there is no unsafe force-send control.

A failed DB acknowledgement after provider acceptance leaves a recoverable lease. Resend uses the same stable request/key. HTTP acceptance, recipient-server delivery and human receipt remain distinct. Raw-body Svix-compatible HMAC-SHA256 verification checks event ID, timestamp (five-minute tolerance), rotating v1 signatures and bounded supported event schema. Only a minimal ID/hash/provider ID/type/time projection is stored; no raw recipient lists or provider bodies. Concurrent duplicate events have one effect; conflicting signed bytes are retained for investigation. Delivery events received before HTTP acknowledgement are joined on later provider binding. Complaint/bounce/failure precedence prevents a late delivered event clearing a suppression. Unsupported open/click tracking is rejected; none is enabled.

## Auth-owned email templates

`supabase/templates/system13/manifest.json` inventories five account-action templates and six native security-notification templates with HTML and plain-text source. Provider-created TokenHash links use System 01's `/auth/email-action`, not a GET endpoint that consumes tokens. SiteURL is a reviewed provider setting; user metadata and arbitrary RedirectTo values are absent. Password/email/factor/identity security notices use native Auth notifications rather than application claims. No password, token, authenticator secret or pending email enters the application outbox.

Provider template installation, dual-address secure email change, SMTP MIME behavior, native security-notification toggles, actual token expiry/rate limits and delivery after provider-direct account changes require separately authorized hosted acceptance. Plain-text source does not prove the hosted Auth SMTP renderer uses multipart/alternative. No expiry duration is invented in templates.

## Preferences, suppression and retention

Essential security and transaction notices are always required. Artist operational notices can be disabled. Marketing consent is separate, versioned, off by default and reversible at `/account/notifications`; no marketing source, campaign or sending route exists. Existing Buyer settings use the same canonical preferences. Legacy database writes force required receipt/agreement/security flags; historical legacy marketing flags are not imported as consent. All preference mutations bind Auth UID/current canonical role/active session and reject stale notices. The JSON compatibility API uses bounded same-origin strict booleans.

Marketing campaigns remain outside this system. Before any campaign, obtain reviewed consent language, lawful sender identity/postal footer and applicable one-click unsubscribe/list headers. The authenticated preference page supports current opt-out; it is not claimed as a one-click marketing endpoint. No published legal document is changed and no new copy is represented as legally approved. Template copy and footer review remain part of hosted/legal acceptance.

Bounces and complaints suppress all application delivery to the exact frozen address, including essential emails, to avoid repeated unwanted sends. Essential preferences cannot override provider suppression; in-app access/support is the recovery channel. Auth SMTP suppression is separately provider managed.

An explicit service retention RPC removes terminal recipient addresses after a proposed 90-day period, preserving minimal source/ID tombstones so catch-up cannot recreate a sent message. Suppression addresses remain necessary to enforce suppression; immutable hashes/history and tombstone retention require privacy/legal disposition and eventual approved archival/erasure design. No cleanup schedule or approved legal retention period is inferred. No pending/uncertain event is pruned by this RPC. Late authenticated delivery events remain recordable after address pruning; a deleted recipient address is never reconstructed from webhook content. Provider suppression and independent hosted retention acceptance must cover this boundary.

## Operator runbook and hosted handoff

`/admin/notifications` shows state totals, retry-due count, last collection, conflicts and a bounded redacted attention list. Provider-assured current MFA and SQL full scope precede reads/retries. Retry requires a bounded reason and immutable SEC audit; it cannot bypass suppression, request changes, attempt ceilings or expired idempotency windows. A new source/receipt is never substituted for an uncertain send.

1. Keep DB `enabled=false` and `TSE_EMAIL_DELIVERY_ENABLED=false` until explicit hosted authorization. Preserve original Auth SMTP, application release and Phase A holds.
2. Obtain a separately approved isolated provider/environment manifest; pin candidate/migration hashes and private credentials. Register dedicated send-only key, verified sender and monitored reply-to; keep all values outside logs/client bundles. Bind webhook secret to the intended provider account.
3. Apply the exact reviewed migration chain only in the authorized isolated project. Install reviewed Auth template bodies and native security settings; configure exact SiteURL/redirect allowlist and provider token expiry/rate limits. Verify SPF/DKIM/DMARC/domain reputation/quotas without reusing production secrets.
4. Install an authenticated scheduler for `runNotificationBatch` (bounded ten messages), independently monitor collection staleness, leased expiries, retries, configuration failures, dead letters, suppressions and signed conflicts. No public worker endpoint exists. Infrastructure runner authorization and service-key custody require independent review.
5. Rehearse with separately authorized synthetic recipients/provider mocks first, then approved test inboxes only. Exercise lost ACK, expired lease, provider 429/5xx, out-of-order delivery, account email/role changes, MFA removal, complaint/bounce and privacy cleanup. Confirm provider response and independent mailbox receipt separately.
6. Before replaying an uncertain dead letter, correlate provider ID/idempotency key and signed history. Do not remove suppression or mint a new message ID to force delivery. Resolve manually with evidence and founder/operator authorization.
7. Roll back by disabling both gates and stopping scheduling; retain queue/provider evidence. Existing sent emails cannot be recalled. Restore the previously approved Auth templates/config only under the hosted rollback authorization. No destructive schema rollback is needed.
8. Obtain real-device/email-client (Gmail/Outlook/Apple Mail), screen-reader, independent security/privacy/deliverability review and formal acceptance. Local Chromium rendering is not mailbox compatibility. All 25 formal QA scenarios remain Not Run; Private Beta remains NO-GO; no automatic System 14.

## Primary references checked

- [Supabase Auth templates and native security notifications](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Resend sending contract](https://resend.com/docs/api-reference/emails/send-email)
- [Resend idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys)
- [Resend raw-body webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)

The Supabase changelog markdown fetch was unavailable through the browser; no SDK upgrade or new provider Auth API was introduced. Existing pinned SDK contracts are preserved.

## Brand reconciliation

Current founder AGENTS.md requires `Primary_Logo_Light_Mode.png` on light surfaces. This file was tracked in the founder workspace but absent from the inherited release lineage; one older website regression explicitly banned it. System 13 copies the exact approved source bytes for transactional email and removes that one obsolete absence assertion. Existing website asset mappings, other retired-file assertions and website rendering remain unchanged. Provenance hashes and actual browser image-loading checks are retained in local evidence.
