import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type Stripe from "stripe";

import { env, getDeploymentTarget } from "@/lib/env";
import {
  assertStripeServerConfiguration,
  getPaymentRuntimeConfiguration,
  getPurchaseCompletionAdapterConfiguration,
  serverEnv
} from "@/lib/server-env";
import { gateDReceiptObjectPath, renderGateDReceipt } from "@/lib/gate-d/receipt";
import { getStripeServerClient } from "@/services/stripe/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import type { AppSupabaseClient } from "@/services/supabase/types";

export const GATE_D_QA_BUYER_ID = "8ffc95e8-0e8f-428e-ac26-925d6bc98fcd";
export const GATE_D_CSRF_COOKIE = "__Host-gate-d-csrf";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RpcError = { message: string; code?: string };
type RpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): PromiseLike<{ data: T | null; error: RpcError | null }>;
};

export type GateDReservation = {
  result_code: string;
  grant_id: string | null;
  attempt_id: string | null;
  lease_epoch: number | null;
  checkout_session_id: string | null;
  provider_expires_at: string | null;
};

export type GateDPreparedCheckout = {
  grant_id: string;
  attempt_id: string;
  reservation_lease_token: string;
  reservation_lease_epoch: number;
  stripe_idempotency_key: string;
  stripe_request_spec: string;
  stripe_parameters_sha256: string;
  provider_expires_at: string;
  order_id: string;
  amount_minor: number;
  currency: string;
  track_title: string;
  track_slug: string;
  license_name: string;
};

type GateDJob = {
  job_id: string;
  contract_id: string;
  task: "asset_preparation" | "receipt_generation" | "transaction_projection";
  revision: number;
  event_id: string;
  lease_token: string;
  lease_until: string;
};

type GateDReceiptSnapshot = {
  receipt_id: string;
  object_path: string;
  order_id: string;
  payment_date: string;
  track_title: string;
  license_name: string;
  amount_minor: number;
  currency: string;
  payment_intent_id: string;
};

export type GateDWebhookRoute = {
  route_code: "gate_d" | "ordinary" | "conflict";
  grant_id: string | null;
  order_id: string | null;
  grant_state: string | null;
};

function rpc(client: AppSupabaseClient | NonNullable<ReturnType<typeof createAdminSupabaseClient>>) {
  return client as unknown as RpcClient;
}

function requireAdminClient() {
  const client = createAdminSupabaseClient();
  if (!client) throw new Error("Gate D requires the server-only Supabase credential.");
  return client;
}

function requireGateDRuntime() {
  assertStripeServerConfiguration("Gate D TEST acceptance", { requireWebhook: true });
  const runtime = getPaymentRuntimeConfiguration();
  const adapter = getPurchaseCompletionAdapterConfiguration();
  if (
    runtime.deploymentTarget !== "production" ||
    runtime.releaseMode !== "production_beta" ||
    runtime.paymentMode !== "test" ||
    runtime.livePaymentsEnabled ||
    adapter.requested ||
    getDeploymentTarget() !== "production"
  ) {
    throw new Error("Gate D runtime classification is unavailable.");
  }
  if (!serverEnv.stripeAccountId || !/^acct_[A-Za-z0-9]{1,240}$/.test(serverEnv.stripeAccountId)) {
    throw new Error("Gate D requires the reviewed direct TEST Stripe account.");
  }
  return { runtime, providerAccount: serverEnv.stripeAccountId };
}

type GateDCheckoutFacts = {
  orderId: string;
  amountMinor: number;
  currency: string;
  providerExpiresAt: string;
  trackTitle: string;
  trackSlug: string;
  licenseName: string;
  appUrl: string;
};

export class GateDCheckoutParameterDriftError extends Error {
  constructor() {
    super("Gate D Checkout parameter drift.");
    this.name = "GateDCheckoutParameterDriftError";
  }
}

export function gateDCheckoutRequestSpecification(input: GateDCheckoutFacts): Stripe.Checkout.SessionCreateParams {
  const expires = Math.floor(new Date(input.providerExpiresAt).getTime() / 1000);
  if (
    !UUID.test(input.orderId) ||
    !Number.isSafeInteger(input.amountMinor) ||
    input.amountMinor <= 0 ||
    !/^[A-Z]{3}$/.test(input.currency) ||
    !Number.isSafeInteger(expires) ||
    expires <= 0 ||
    !input.trackTitle ||
    !input.licenseName ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(input.trackSlug) ||
    !/^https:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(input.appUrl)
  ) {
    throw new Error("Invalid Gate D Checkout parameter source.");
  }
  return {
    cancel_url: `${input.appUrl}/buyer/checkout/${input.trackSlug}?error=Gate%20D%20TEST%20checkout%20was%20canceled.`,
    client_reference_id: input.orderId,
    expires_at: expires,
    line_items: [{
      price_data: {
        currency: input.currency.toLowerCase(),
        product_data: {
          description: "The Sync Exchange production-beta TEST acceptance checkout.",
          name: `${input.trackTitle} - ${input.licenseName}`
        },
        unit_amount: input.amountMinor
      },
      quantity: 1
    }],
    mode: "payment",
    payment_method_types: ["card"],
    success_url: `${input.appUrl}/license-confirmation/${input.orderId}?session_id={CHECKOUT_SESSION_ID}`
  };
}

export function gateDCanonicalCheckoutParameters(request: Stripe.Checkout.SessionCreateParams) {
  return stableJson(request);
}

export function gateDCheckoutParameterDigest(request: Stripe.Checkout.SessionCreateParams) {
  return createHash("sha256").update(gateDCanonicalCheckoutParameters(request)).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    return `{${Object.keys(source).filter((key) => source[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(source[key])}`).join(",")}}`;
  }
  throw new Error("Gate D Checkout specification contains an unsupported value.");
}

function checkoutFacts(prepared: GateDPreparedCheckout): GateDCheckoutFacts {
  return {
    orderId: prepared.order_id,
    amountMinor: prepared.amount_minor,
    currency: prepared.currency,
    providerExpiresAt: prepared.provider_expires_at,
    trackTitle: prepared.track_title,
    trackSlug: prepared.track_slug,
    licenseName: prepared.license_name,
    appUrl: env.appUrl
  };
}

function verifyCheckoutSpecification(prepared: GateDPreparedCheckout) {
  const request = gateDCheckoutRequestSpecification(checkoutFacts(prepared));
  const canonical = gateDCanonicalCheckoutParameters(request);
  const digest = gateDCheckoutParameterDigest(request);
  if (!safeEqual(canonical, prepared.stripe_request_spec) || !safeEqual(digest, prepared.stripe_parameters_sha256)) {
    throw new GateDCheckoutParameterDriftError();
  }
  return request;
}

export async function reserveGateDAcceptance(authClient: AppSupabaseClient, orderId: string) {
  if (!UUID.test(orderId)) return { result_code: "unavailable" } as GateDReservation;
  const { data, error } = await rpc(authClient).rpc<GateDReservation[]>("gate_d_reserve_acceptance", {
    p_order_id: orderId
  });
  if (error) throw new Error("Gate D acceptance is unavailable.");
  return data?.[0] || ({ result_code: "unavailable" } as GateDReservation);
}

export async function prepareGateDCheckout(reservation: GateDReservation) {
  if (!reservation.grant_id || !reservation.attempt_id || !reservation.lease_epoch) {
    throw new Error("Gate D reservation is incomplete.");
  }
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<GateDPreparedCheckout[]>("gate_d_prepare_checkout", {
    p_grant_id: reservation.grant_id,
    p_attempt_id: reservation.attempt_id,
    p_expected_lease_epoch: reservation.lease_epoch,
    p_app_url: env.appUrl
  });
  if (error) throw new Error(`Gate D checkout preparation failed: ${error.message}`);
  const prepared = data?.[0];
  if (!prepared) throw new Error("Gate D checkout preparation returned no trusted parameters.");
  verifyCheckoutSpecification(prepared);
  return prepared;
}

export async function createGateDStripeCheckout(prepared: GateDPreparedCheckout) {
  requireGateDRuntime();
  const request = verifyCheckoutSpecification(prepared);
  const stripe = getStripeServerClient();
  if (!stripe) throw new Error("Stripe TEST client is unavailable.");
  const expiresAt = Math.floor(new Date(prepared.provider_expires_at).getTime() / 1000);
  const session = await stripe.checkout.sessions.create(
    request,
    { idempotencyKey: prepared.stripe_idempotency_key }
  );
  if (
    session.livemode ||
    !/^cs_test_[A-Za-z0-9]{1,240}$/.test(session.id) ||
    session.client_reference_id !== prepared.order_id ||
    session.amount_total !== prepared.amount_minor ||
    String(session.currency || "").toUpperCase() !== prepared.currency ||
    session.expires_at !== expiresAt ||
    !session.url
  ) {
    throw new Error("Stripe returned a mismatched Gate D TEST Checkout Session.");
  }
  return session;
}

export async function recoverBoundGateDCheckout(reservation: GateDReservation) {
  if (!reservation.grant_id || !reservation.attempt_id) {
    throw new Error("Gate D bound Checkout recovery is incomplete.");
  }
  requireGateDRuntime();
  const client = requireAdminClient();
  const bound = await rpc(client).rpc<Array<{
    checkout_session_id: string;
    provider_expires_at: string;
    order_id: string;
    amount_minor: number;
    currency: string;
  }>>("gate_d_get_bound_checkout", {
    p_grant_id: reservation.grant_id,
    p_attempt_id: reservation.attempt_id
  });
  const trusted = bound.data?.[0];
  if (bound.error || !trusted) {
    throw new Error(`Gate D bound Checkout recovery failed: ${bound.error?.message || "no binding"}`);
  }
  const stripe = getStripeServerClient();
  if (!stripe) throw new Error("Stripe TEST client is unavailable.");
  const session = await stripe.checkout.sessions.retrieve(trusted.checkout_session_id);
  if (
    session.livemode ||
    session.id !== trusted.checkout_session_id ||
    session.client_reference_id !== trusted.order_id ||
    session.amount_total !== trusted.amount_minor ||
    String(session.currency || "").toUpperCase() !== trusted.currency ||
    session.expires_at !== Math.floor(new Date(trusted.provider_expires_at).getTime() / 1000) ||
    !session.url
  ) {
    throw new Error("Recovered Gate D Checkout Session does not match its binding.");
  }
  return session;
}

export async function bindGateDCheckout(prepared: GateDPreparedCheckout, session: Stripe.Checkout.Session) {
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<string>("gate_d_bind_checkout", {
    p_grant_id: prepared.grant_id,
    p_attempt_id: prepared.attempt_id,
    p_lease_token: prepared.reservation_lease_token,
    p_lease_epoch: prepared.reservation_lease_epoch,
    p_parameter_sha256: prepared.stripe_parameters_sha256,
    p_checkout_session_id: session.id,
    p_provider_expires_at: prepared.provider_expires_at
  });
  if (error || data !== "checkout_bound") {
    throw new Error(`Gate D Checkout Session binding failed: ${error?.message || "unexpected result"}`);
  }
}

export async function recordGateDCheckoutFailure(
  prepared: GateDPreparedCheckout,
  errorCode: "provider_timeout" | "database_binding_failed" | "parameter_drift" | "idempotency_window_uncertain" | "provider_mismatch",
  requiresReconciliation: boolean
) {
  const client = requireAdminClient();
  await rpc(client).rpc<string>("gate_d_record_checkout_failure", {
    p_grant_id: prepared.grant_id,
    p_attempt_id: prepared.attempt_id,
    p_lease_token: prepared.reservation_lease_token,
    p_lease_epoch: prepared.reservation_lease_epoch,
    p_error_code: errorCode,
    p_requires_reconciliation: requiresReconciliation
  });
}

export async function routeGateDWebhook(input: {
  checkoutSessionId: string;
  orderHint: string | null;
  livemode: boolean;
  connectAccount?: string | null;
}) {
  const runtime = getPaymentRuntimeConfiguration();
  if (runtime.deploymentTarget !== "production" || runtime.releaseMode !== "production_beta") {
    return {
      route_code: "ordinary",
      grant_id: null,
      order_id: null,
      grant_state: null
    } satisfies GateDWebhookRoute;
  }
  const { providerAccount } = requireGateDRuntime();
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<GateDWebhookRoute[]>("gate_d_route_webhook", {
    p_checkout_session_id: input.checkoutSessionId,
    p_order_hint: input.orderHint,
    p_provider_account: providerAccount,
    p_livemode: input.livemode,
    p_connect_account: input.connectAccount || null
  });
  if (error) throw new Error(`Gate D webhook routing failed: ${error.message}`);
  const route = data?.[0];
  if (!route) throw new Error("Gate D webhook routing returned no classification.");
  return route;
}

export async function recordGateDVerifiedPayment(input: {
  grantId: string;
  providerEventId: string;
  checkoutSessionId: string;
  paymentIntentId: string;
  eventType: "checkout.session.completed" | "checkout.session.async_payment_succeeded";
  amountMinor: number;
  currency: string;
  evidenceSha256: string;
  providerCreatedAt: string;
}) {
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<string>("gate_d_record_verified_payment", {
    p_grant_id: input.grantId,
    p_provider_event_id: input.providerEventId,
    p_checkout_session_id: input.checkoutSessionId,
    p_payment_intent_id: input.paymentIntentId,
    p_event_type: input.eventType,
    p_amount_minor: input.amountMinor,
    p_currency: input.currency.toUpperCase(),
    p_evidence_sha256: input.evidenceSha256,
    p_provider_created_at: input.providerCreatedAt
  });
  if (error || !data) throw new Error(`Gate D payment recording failed: ${error?.message || "no event"}`);
  return data;
}

export async function requestGateDRevocation(grantId: string, reason: "payment_failed" | "provider_uncertain") {
  const client = requireAdminClient();
  const { error } = await rpc(client).rpc<string>("gate_d_request_revocation", {
    p_grant_id: grantId,
    p_reason: reason
  });
  if (error) throw new Error(`Gate D revocation request failed: ${error.message}`);
}

export async function runGateDAcceptanceJobs(grantId: string) {
  await runSimpleJob(grantId, "asset_preparation");
  await runReceiptJob(grantId);
  await runSimpleJob(grantId, "transaction_projection");
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<string>("gate_d_consume_acceptance", {
    p_grant_id: grantId
  });
  if (error || data !== "consumed") {
    throw new Error(`Gate D final invariant failed: ${error?.message || data || "unknown"}`);
  }
  return data;
}

async function claimJob(grantId: string, task: GateDJob["task"]) {
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<GateDJob[]>("gate_d_claim_job", {
    p_grant_id: grantId,
    p_task: task
  });
  if (error) throw new Error(`Gate D ${task} claim failed: ${error.message}`);
  return data?.[0] || null;
}

async function finishJob(grantId: string, job: GateDJob, success: boolean, errorCode?: string) {
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<string>("gate_d_finish_job", {
    p_grant_id: grantId,
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_success: success,
    p_retryable: !success,
    p_error_code: errorCode || null
  });
  if (error) throw new Error(`Gate D ${job.task} completion failed: ${error.message}`);
  return data;
}

async function runSimpleJob(grantId: string, task: "asset_preparation" | "transaction_projection") {
  const job = await claimJob(grantId, task);
  if (!job) return;
  await finishJob(grantId, job, true);
}

async function runReceiptJob(grantId: string) {
  const job = await claimJob(grantId, "receipt_generation");
  if (!job) return;
  const client = requireAdminClient();
  const { data, error } = await rpc(client).rpc<GateDReceiptSnapshot[]>("gate_d_prepare_receipt", {
    p_grant_id: grantId,
    p_job_id: job.job_id,
    p_lease_token: job.lease_token
  });
  const snapshot = data?.[0];
  if (error || !snapshot) {
    await finishJob(grantId, job, false, "receipt_snapshot_failed");
    throw new Error(`Gate D receipt snapshot failed: ${error?.message || "no snapshot"}`);
  }
  if (snapshot.object_path !== gateDReceiptObjectPath(grantId)) {
    await applyReceiptHold(grantId, "receipt_business_fact_mismatch");
    throw new Error("Gate D receipt path mismatch.");
  }
  const artifact = renderGateDReceipt({
    orderId: snapshot.order_id,
    paymentDate: snapshot.payment_date,
    trackTitle: snapshot.track_title,
    licenseName: snapshot.license_name,
    amountMinor: snapshot.amount_minor,
    currency: snapshot.currency,
    paymentIntentId: snapshot.payment_intent_id
  });

  let adopted = false;
  const upload = await client.storage.from("order-receipts").upload(snapshot.object_path, artifact.bytes, {
    contentType: artifact.mimeType,
    upsert: false
  });
  if (upload.error) adopted = true;

  const readback = await client.storage.from("order-receipts").download(snapshot.object_path);
  if (readback.error) {
    await failReceiptJobRetryably(grantId, job, "receipt_readback_retryable");
    throw new Error("Gate D receipt readback transport failed.");
  }
  if (!readback.data) {
    await applyReceiptHold(grantId, "receipt_readback_evidence_missing");
    throw new Error("Gate D receipt readback evidence is missing.");
  }
  const readbackBytes = Buffer.from(await readback.data.arrayBuffer());
  const readbackHash = createHash("sha256").update(readbackBytes).digest("hex");
  if (
    readback.data.type !== artifact.mimeType ||
    readbackBytes.byteLength !== artifact.byteSize ||
    !safeEqual(readbackHash, artifact.sha256) ||
    !safeEqual(readbackBytes.toString("base64"), artifact.bytes.toString("base64"))
  ) {
    await applyReceiptHold(grantId, "receipt_readback_mismatch");
    throw new Error("Gate D receipt readback mismatch.");
  }

  const sealed = await rpc(client).rpc<Array<{ object_id: string; object_version: string }>>("gate_d_seal_receipt", {
    p_grant_id: grantId,
    p_job_id: job.job_id,
    p_lease_token: job.lease_token,
    p_sha256: artifact.sha256,
    p_byte_size: artifact.byteSize,
    p_mime_type: artifact.mimeType,
    p_adopted: adopted
  });
  if (sealed.error) {
    if (isReceiptIntegrityError(sealed.error)) {
      await applyReceiptHold(grantId, "receipt_seal_integrity_conflict");
    } else {
      await failReceiptJobRetryably(grantId, job, "receipt_seal_retryable");
    }
    throw new Error(`Gate D receipt seal failed: ${sealed.error.message}`);
  }
  if (!sealed.data?.[0]?.object_id || !sealed.data[0].object_version) {
    await applyReceiptHold(grantId, "receipt_storage_identity_missing");
    throw new Error("Gate D receipt seal returned no Storage identity.");
  }
  await finishJob(grantId, job, true);
}

function isReceiptIntegrityError(error: RpcError) {
  return ["22023","23514","42501","P0002"].includes(error.code || "");
}

async function failReceiptJobRetryably(grantId: string, job: GateDJob, errorCode: string) {
  try {
    await finishJob(grantId, job, false, errorCode);
  } catch {
    // The lease remains reclaimable if the database is also unavailable here.
  }
}

async function applyReceiptHold(grantId: string, reason: string) {
  const client = requireAdminClient();
  await rpc(client).rpc<string>("gate_d_apply_security_hold", {
    p_grant_id: grantId,
    p_reason: reason
  });
}

export function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes,rightBytes);
}
