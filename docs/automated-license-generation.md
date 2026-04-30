# Automated License Generation

The Sync Exchange now generates a finalized sync-license agreement only after verified payment is confirmed through the Stripe webhook flow.

## What happens on a paid order

1. Buyer starts checkout for an approved track + license type.
2. Stripe Checkout creates or reuses an `orders` row before payment completes.
3. `POST /api/webhooks/stripe` receives a signed Stripe event.
4. `services/stripe/server.ts` updates the order to `paid`.
5. `services/agreements/server.ts` generates exactly one agreement artifact per order.
6. The app stores:
   - order-level agreement metadata on `public.orders`
   - a frozen purchase-time terms record on `public.generated_licenses`
   - a private PDF in the `agreements` bucket
7. Buyer and admin can download the agreement through the private delivery route.

## Database contract

Migration:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/migrations/0013_generated_licenses.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/migrations/0013_generated_licenses.sql)

Manual hosted bundle:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/supabase/manual-apply/2026-04-foundation-bootstrap.sql)

`public.generated_licenses` stores:

- one row per completed order
- `agreement_number`
- `terms_snapshot_json`
- `pdf_storage_path`
- `html_snapshot`
- `generation_error`
- `generated_at`
- `downloaded_at`

Important constraints:

- `order_id` is unique
- `agreement_number` is unique
- RLS allows:
  - buyers to read only their own generated licenses
  - admins to read all generated licenses
  - no public access

Service-role writes happen server-side only.

## Storage contract

Bucket:

- `agreements` (private)

Object path inside the bucket:

```text
{buyer_id}/{order_id}/sync-license-agreement.pdf
```

Example:

```text
agreements/0f4.../56372f0f-6e27-4ff5-aada-9756f9faa5e0/sync-license-agreement.pdf
```

The bucket must remain private. Buyer/admin delivery uses signed URLs or server-streamed fallback responses.

## Purchase-time terms snapshot

Snapshot builder:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/lib/licenses/generated-license-snapshot.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/lib/licenses/generated-license-snapshot.ts)

Snapshot rendering:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/lib/licenses/templates/sync-license-template.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/lib/licenses/templates/sync-license-template.ts)

The snapshot freezes:

- buyer legal name / company / email
- track title / artist name / rights holders
- order id
- Stripe checkout session id
- payment intent id
- license type and summary
- price paid and currency
- territory
- term length
- permitted media
- exclusivity
- restrictions
- agreement number

This means later edits to catalog/license configuration do not rewrite a completed purchase record.

## Webhook behavior and idempotency

Webhook route:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/app/api/webhooks/stripe/route.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/app/api/webhooks/stripe/route.ts)

Order/payment sync:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/services/stripe/server.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/services/stripe/server.ts)

Agreement generation:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/services/agreements/server.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/services/agreements/server.ts)

Safety rules:

- only signed Stripe webhook events can fulfill orders
- the checkout success page is not treated as proof of payment
- duplicate webhook events are deduped through `order_activity_log`
- an existing generated license row prevents duplicate agreement creation
- existing agreement numbers are preserved on retries

## Buyer download flow

Agreement route:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/app/api/orders/[orderId]/agreement/route.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/app/api/orders/%5BorderId%5D/agreement/route.ts)

The route:

- verifies the user is authenticated
- verifies the user owns the order or is admin
- resolves the generated license record
- creates a short-lived signed URL when possible
- falls back to a server-side stream when needed
- updates `downloaded_at`

HTTP behavior:

- `401` unauthenticated
- `403` wrong buyer
- `409` paid order with failed/incomplete agreement generation

## Admin visibility and retry

Admin order UI:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/app/(app)/admin/orders/page.tsx`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/app/%28app%29/admin/orders/page.tsx)

Retry action:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/services/admin/actions.ts`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/services/admin/actions.ts)

Admins can:

- see generated license status
- see agreement number
- download the agreement
- retry generation safely

Retries preserve the existing agreement number when one already exists.

## Email follow-up readiness

Core agreement generation is intentionally independent from email delivery.

When you add post-purchase email delivery later, use the generated-license success point as the trigger for:

- order confirmation
- agreement available
- receipt / next steps

Do not tie license creation to SMTP availability.

## Manual setup required

1. Apply migration `0013_generated_licenses.sql` or the hosted-safe bootstrap bundle.
2. Confirm the private `agreements` bucket exists.
3. Confirm Stripe webhook delivery is live in the target environment.
4. Re-run:

```bash
npm run verify:supabase
curl -s http://127.0.0.1:3000/api/health/readiness
```

5. Run the marketplace E2E:

```bash
QA_TEST_ACCOUNT_PASSWORD="LaunchQApass123!" E2E_REUSE_EXISTING_SERVER=true npm run e2e:one
```

## Legal review

The agreement template is production-structured but still needs attorney review for:

- governing law / venue
- exclusivity tiers
- restrictions language
- termination / breach wording
- refund / chargeback handling
- any credit requirements that must become binding

See:

- [`/Users/malcolmw/Documents/The Sync Exchange.2/docs/legal-review-notes.md`](/Users/malcolmw/Documents/The%20Sync%20Exchange.2/docs/legal-review-notes.md)
