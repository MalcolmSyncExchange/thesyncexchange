import { getDeploymentTarget } from "@/lib/env";
import { getPurchaseCompletionAdapterConfiguration } from "@/lib/server-env";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

export type PurchaseCompletionPaymentState =
  | "PAID"
  | "PAYMENT_FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED"
  | "DISPUTED";

export type VerifiedStripePaymentEvidence = {
  providerEventId: string;
  eventType:
    | "checkout.session.completed"
    | "checkout.session.async_payment_succeeded"
    | "checkout.session.async_payment_failed"
    | "charge.refunded"
    | "charge.dispute.created";
  paymentState: PurchaseCompletionPaymentState;
  checkoutSessionId?: string;
  paymentIntentId: string;
  amountMinor: number;
  refundedMinor: number;
  currency: string;
  evidenceSha256: string;
  providerCreatedAt: string;
  livemode: boolean;
};

type RpcResult<T> = PromiseLike<{ data: T | null; error: { message: string } | null }>;
type PurchaseCompletionRpcClient = {
  rpc<T>(name: string, args: Record<string, unknown>): RpcResult<T>;
};

function requireEnabledAdapter() {
  const config = getPurchaseCompletionAdapterConfiguration();
  if (!config.requested) return null;
  if (!config.enabled || !config.providerAccount) {
    throw new Error(`Purchase-completion adapter is fail-closed (${config.reason}).`);
  }
  return config;
}

function requireAdminRpcClient(): PurchaseCompletionRpcClient {
  const client = createAdminSupabaseClient();
  if (!client) {
    throw new Error("Purchase-completion adapter requires the server-only Supabase credential.");
  }
  return client as unknown as PurchaseCompletionRpcClient;
}

export async function preparePurchaseCompletionCheckout(orderId: string) {
  const config = requireEnabledAdapter();
  if (!config) return { enabled: false as const };

  const { data, error } = await requireAdminRpcClient().rpc<Array<{
    contract_id: string;
    entitlement_id: string | null;
    asset_version_id: string | null;
    synthetic_qa: boolean;
  }>>("prepare_purchase_completion_checkout", {
    p_order: orderId,
    p_environment: getDeploymentTarget(),
    p_provider_account: config.providerAccount
  });
  if (error) throw new Error(`Purchase-completion checkout preparation failed: ${error.message}`);
  const result = data?.[0];
  if (!result?.contract_id) throw new Error("Purchase-completion checkout preparation returned no contract.");
  return { enabled: true as const, ...result };
}

export async function recordVerifiedPurchaseCompletionEvent(orderId: string, evidence: VerifiedStripePaymentEvidence) {
  const config = requireEnabledAdapter();
  if (!config) return { enabled: false as const };
  if (evidence.livemode) throw new Error("Purchase-completion adapter accepts TEST events only.");
  if (!/^evt_[A-Za-z0-9]+$/.test(evidence.providerEventId)) throw new Error("Invalid Stripe event identity.");
  const providerStateWithoutSession = evidence.eventType === "charge.refunded" || evidence.eventType === "charge.dispute.created";
  if (!providerStateWithoutSession && !/^cs_test_[A-Za-z0-9]+$/.test(evidence.checkoutSessionId || "")) {
    throw new Error("Invalid TEST Checkout Session identity.");
  }
  if (!/^pi_[A-Za-z0-9]+$/.test(evidence.paymentIntentId)) throw new Error("Invalid PaymentIntent identity.");
  if (!/^[a-f0-9]{64}$/.test(evidence.evidenceSha256)) throw new Error("Invalid signed-event evidence digest.");
  if (!Number.isInteger(evidence.amountMinor) || evidence.amountMinor <= 0) throw new Error("Invalid payment amount.");
  if (!Number.isInteger(evidence.refundedMinor) || evidence.refundedMinor < 0) throw new Error("Invalid refund amount.");

  const { data, error } = await requireAdminRpcClient().rpc<string>("record_purchase_completion_event", {
    p_order: orderId,
    p_provider_account: config.providerAccount,
    p_provider_event: evidence.providerEventId,
    p_checkout_session: evidence.checkoutSessionId || null,
    p_payment_intent: evidence.paymentIntentId,
    p_event_type: evidence.eventType,
    p_payment_state: evidence.paymentState,
    p_amount_minor: evidence.amountMinor,
    p_refunded_minor: evidence.refundedMinor,
    p_currency: evidence.currency.toUpperCase(),
    p_evidence_sha256: evidence.evidenceSha256,
    p_provider_created_at: evidence.providerCreatedAt
  });
  if (error) throw new Error(`Purchase-completion payment recording failed: ${error.message}`);
  if (!data) throw new Error("Purchase-completion payment recording returned no event identity.");
  return { enabled: true as const, paymentEventId: data };
}

export async function placePurchaseCompletionSecurityHold(orderId: string, reasonCode: string) {
  const config = requireEnabledAdapter();
  if (!config) return { enabled: false as const };
  if (!/^[a-z0-9_]{1,80}$/.test(reasonCode)) throw new Error("Invalid security-hold reason.");
  const { error } = await requireAdminRpcClient().rpc<null>("hold_purchase_completion", {
    p_order: orderId,
    p_reason: reasonCode
  });
  if (error) throw new Error(`Purchase-completion hold failed: ${error.message}`);
  return { enabled: true as const };
}

export async function claimPurchaseCompletionJob(task: "asset_preparation" | "receipt_generation" | "entitlement_activation" | "transaction_projection") {
  const config = requireEnabledAdapter();
  if (!config) return { enabled: false as const, job: null };
  const { data, error } = await requireAdminRpcClient().rpc<Array<{
    id: string;
    contract_id: string;
    task: string;
    revision: number;
    event_id: string;
    lease_token: string;
    lease_until: string;
  }>>("claim_purchase_completion_job", { p_task: task });
  if (error) throw new Error(`Purchase-completion job claim failed: ${error.message}`);
  return { enabled: true as const, job: data?.[0] || null };
}

export async function preparePurchaseCompletionReceipt(jobId: string, leaseToken: string) {
  const config = requireEnabledAdapter();
  if (!config) return { enabled: false as const };
  const { data, error } = await requireAdminRpcClient().rpc<string>("prepare_purchase_completion_receipt", {
    p_job: jobId,
    p_lease_token: leaseToken
  });
  if (error) throw new Error(`Purchase-completion receipt preparation failed: ${error.message}`);
  if (!data) throw new Error("Purchase-completion receipt preparation returned no receipt identity.");
  return { enabled: true as const, receiptId: data };
}

export async function sealPurchaseCompletionReceipt({
  jobId,
  leaseToken,
  sha256,
  byteSize
}: {
  jobId: string;
  leaseToken: string;
  sha256: string;
  byteSize: number;
}) {
  const config = requireEnabledAdapter();
  if (!config) return { enabled: false as const };
  if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(byteSize) || byteSize <= 0) {
    throw new Error("Invalid receipt artifact evidence.");
  }
  const { error } = await requireAdminRpcClient().rpc<null>("seal_purchase_completion_receipt", {
    p_job: jobId,
    p_lease_token: leaseToken,
    p_sha256: sha256,
    p_size: byteSize
  });
  if (error) throw new Error(`Purchase-completion receipt sealing failed: ${error.message}`);
  return { enabled: true as const };
}

export async function finishPurchaseCompletionJob({
  jobId,
  leaseToken,
  success,
  retryable = false,
  errorCode
}: {
  jobId: string;
  leaseToken: string;
  success: boolean;
  retryable?: boolean;
  errorCode?: string;
}) {
  const config = requireEnabledAdapter();
  if (!config) return { enabled: false as const };
  if (errorCode && !/^[a-z0-9_]{1,80}$/.test(errorCode)) throw new Error("Invalid fulfillment error code.");
  const { error } = await requireAdminRpcClient().rpc<null>("finish_purchase_completion_job", {
    p_job: jobId,
    p_lease_token: leaseToken,
    p_success: success,
    p_retryable: retryable,
    p_error: errorCode || null
  });
  if (error) throw new Error(`Purchase-completion job completion failed: ${error.message}`);
  return { enabled: true as const };
}
