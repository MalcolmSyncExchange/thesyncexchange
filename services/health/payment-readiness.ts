import "server-only";

import { getMissingOperationalEnvKeys, getServerEnvironmentDiagnostics } from "@/lib/server-env";
import { canObserveDisabledPayments, classifyHealthPayments, isDedicatedStagingIdentity } from "@/lib/health/payment-readiness";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

/** Public health may expose this aggregate only; never keys or raw RPC rows. */
export async function getHealthPaymentReadiness() {
  const diagnostics = getServerEnvironmentDiagnostics();
  const eligible = canObserveDisabledPayments({
    target: diagnostics.deploymentTarget, mode: diagnostics.paymentMode,
    adapterFlag: process.env.SYNC_EXCHANGE_PHASE2B_PAYMENT_ADAPTER_ENABLED,
    billingPortalFlag: process.env.SYNC_EXCHANGE_BILLING_PORTAL_ENABLED,
    missingOperational: getMissingOperationalEnvKeys(),
    stagingIdentityVerified: isDedicatedStagingIdentity({ ...process.env, TSE_BUILD_NETLIFY_SITE_ID: process.env.TSE_BUILD_NETLIFY_SITE_ID }, diagnostics.deploymentTarget)
  });
  if (!eligible) return classifyHealthPayments(false, null);
  try {
    const client = createAdminSupabaseClient();
    if (!client) return classifyHealthPayments(true, null);
    const result = await client.rpc("get_admin_purchase_capabilities", {})
      .abortSignal(AbortSignal.timeout(3000));
    return classifyHealthPayments(true, result.error ? null : result.data);
  } catch {
    return classifyHealthPayments(true, null);
  }
}
