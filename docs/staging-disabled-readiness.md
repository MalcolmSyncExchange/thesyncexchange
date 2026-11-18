# Disabled staging readiness remediation

Base application: `311300a3fddef3fa3241fa6500d7cdd45faf9bd9`, tree `41e78667cbc269deabdf61ccfb854152db6d960e`.
This branch changes local health reporting only. No deployment, bucket creation, migration, provider setting, signup, payment, analytics event or QA resumption is authorized by this document.

## Health contract

Previously config required every Stripe variable and readiness treated missing secret/webhook values as a critical application failure, even when staging payment execution was deliberately unconfigured. Preview TEST mode may now report `paymentReadiness.status=disabled` only when the adapter and billing flags are explicitly `false`, **all three** Stripe variables are absent, and a bounded service-role RPC returns exactly one well-formed row with all six purchase capabilities OFF. Raw RPC data and secrets are never returned.

Six OFF capabilities alone do not disable the legacy checkout route. Requiring complete credential absence ensures its unchanged strict Stripe execution validator remains closed. A partial credential set retains strict readiness requirements. Missing/denied/malformed/duplicate/timeout capability evidence is UNKNOWN and never enables the exception. Production, live/local modes, requested or invalid flags, core/service-role environment errors, maintenance errors and unrelated infrastructure failures retain their previous behavior. Configured payment execution still requires real credentials; no placeholders are supplied. Missing agreements Storage continues to block readiness.

Checkout, webhook, billing, Auth, onboarding, analytics, schema and RLS implementations are unchanged. The disabled state is a read-only readiness observation, not authorization to enable an execution path. Existing missing Stripe names remain visible in diagnostics; only the proven disabled subsystem is removed from the application's blocking credential list. Webhook/purchase domains explicitly report `disabled`; their missing-key warnings no longer make the whole application degraded.

## Agreements Storage creation proposal — separate authorization required

Target only `https://oppijylbkcbiqfuvckgj.supabase.co`. Bucket ID and name `agreements`; **private** (`public:false`); limit **20,971,520 bytes**; MIME allowlist `text/html`, `application/pdf`. This matches `scripts/setup-supabase-storage.mjs` and `docs/security-pr2/storage.md`. Historical `0006_agreements_bucket.sql` is deliberately a no-op, so 38 applied migrations do not imply the bucket exists.

Do not run the broad `npm run setup:storage`: it updates all buckets and permits a size-limit fallback. The scoped operation must create only this bucket and fail on drift rather than update existing configuration or remove a limit.

After founder authorization, a named operator uses an existing, verified staging-only server credential held privately. Confirm the exact project via provider metadata and the authenticated Storage API before mutation. List/get the bucket. If already present, compare its privacy, exact limit and MIME set; matching settings are a verified no-op, any drift stops for review. If absent, the exact supported SDK operation is:

```ts
await stagingClient.storage.createBucket("agreements", {
  public: false,
  fileSizeLimit: 20971520,
  allowedMimeTypes: ["text/html", "application/pdf"]
});
```

Equivalent single request: `POST https://oppijylbkcbiqfuvckgj.supabase.co/storage/v1/bucket`, JSON body:

```json
{"id":"agreements","name":"agreements","public":false,"file_size_limit":20971520,"allowed_mime_types":["text/html","application/pdf"]}
```

Authenticate in memory; never include credentials in command arguments, reports or logs. Read the bucket back and reconcile exact settings, zero newly created objects, existing bucket/object counts/fingerprints, and unchanged 38-entry history. No migration-history registration is required for this Storage API operation. Do not auto-delete the bucket on failure. No uploads, signed links, generated agreements or purchases belong to this scope.

Read-only hosted review confirms `storage.objects` RLS is enabled. The two permissive ordinary-user policies are confined to owner artist avatars; all other policies are restrictive. Thus anon/authenticated have no permissive agreement access, regardless of their table grants. `service_role` has required Storage table privileges and bypasses RLS only through trusted server workflows. Agreement creation remains verified-payment/server-only; delivery remains canonical buyer ownership/admin authorization with a 60-second signed URL or authorized stream. Do **not** add permissive agreement policies, widen grants, disable RLS or change existing policies. Review public URL denial and unauthorized Storage read denial after separately authorized creation; a public bucket would bypass SELECT RLS and is unacceptable.

References: [createBucket](https://supabase.com/docs/reference/javascript/storage-createbucket), [canonical Storage contract](security-pr2/storage.md).

## Credential verification limits and remaining gates

The configured Supabase URL and public anon JWT claim identify `oppijylbkcbiqfuvckgj`. Netlify's service-role and PostHog values are masked through the available API and scoped to Functions; presence/scopes alone do not prove destination identity. PostHog project 657650 is independently identified as `The Sync Exchange, Staging`; a masked configured token cannot be compared to it. No production token variable or inspectable live Stripe key is configured for this preview, but masked values prevent complete absence attestation.

A later authorized operator or deployment must prove the **actual** Functions credential with read-only calls to the exact staging origin: service-role-only capability RPC and private Storage listing (without returning records), plus comparison of the actual configured PostHog project-token fingerprint with project 657650's authoritative token in private memory. Do not send a capture event or use variable presence as proof. No temporary verification Function may be deployed under the current authorization.

The new health RPC is useful runtime evidence: an absent/wrong/unauthorized service key produces UNKNOWN and keeps readiness blocked. It does not certify a masked stored value in advance. Remaining gates are agreements creation authorization, effective private credential binding, approval of this new commit as the replacement candidate, one disabled deployment, and separately authorized Auth origin/callback/helper handover and controlled QA. Keep analytics disabled and QA held.
