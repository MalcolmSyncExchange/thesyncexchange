# Gate D D5 code-removal manifest

This is a review artifact only. No removal has been performed.

Remove the unlinked `GET`/`POST` route at `app/api/gate-d/checkout/route.ts`, remove `services/gate-d/server.ts`, and remove `lib/gate-d/receipt.ts`. Remove the Gate D classifier, payment recorder, revocation request, and job-runner imports and branches from `app/api/webhooks/stripe/route.ts`; the existing ordinary webhook switch remains.

Remove the three Gate D unit suites and the dedicated concurrency suite after the executable code is removed. Retain a cleanup regression that proves every Gate D RPC is absent or non-executable and that retained evidence tables remain RLS-enabled, directly inaccessible, append-only, and delete-protected.

Apply the separately reviewed cleanup SQL only after the application removal is published and every grant is terminal. Retain both evidence tables, their constraints/FKs/indexes/RLS, the grant no-delete/state guard, initial audit trigger, append-only audit guard, and receipt Storage immutability guard.
