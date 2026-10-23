import "server-only";

import { env, getMissingCoreEnvKeys } from "@/lib/env";
import {
  assertStripeServerConfiguration, getMissingOperationalEnvKeys,
  getPaymentRuntimeConfiguration, getPurchaseCompletionAdapterConfiguration,
  getServerEnvironmentDiagnostics
} from "@/lib/server-env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import {
  buildPaymentReadiness, unknownPaymentReadiness,
  type PaymentConfiguration, type ReadinessReason
} from "@/lib/admin-v2/payment-readiness";
import { requireAccountScope } from "@/services/auth/authorization";
import { requireSession } from "@/services/auth/session";
import { createAdminSupabaseClient } from "@/services/supabase/admin";

/** Configuration observation aligned with checkout + webhook configuration gates. */
export function readPaymentConfiguration(): PaymentConfiguration {
  const diagnostics = getServerEnvironmentDiagnostics();
  const reasons: ReadinessReason[] = [];
  if (getMissingCoreEnvKeys().length || getMissingOperationalEnvKeys().length) reasons.push("configuration_missing");
  if (diagnostics.errors.length) reasons.push("configuration_invalid");
  try {
    assertStripeServerConfiguration("Readiness", { requireWebhook: true });
    getPaymentRuntimeConfiguration();
  } catch {
    reasons.push("configuration_invalid");
  }
  if (env.demoMode) reasons.push("demo_mode");
  if (resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE).blocksApplication) reasons.push("maintenance_active");
  return {
    status: reasons.length ? "blocked" : "ready",
    mode: diagnostics.paymentMode === "test" || diagnostics.paymentMode === "live" ? diagnostics.paymentMode : "unavailable",
    reasons: [...new Set(reasons)]
  };
}

export async function getAdminPaymentReadiness() {
  // Authorization errors must propagate; they must never become a status DTO.
  if (env.demoMode) await requireSession("admin");
  else await requireAccountScope("admin");

  try {
    const configuration = readPaymentConfiguration();
    const adapter = getPurchaseCompletionAdapterConfiguration();
    let rows: unknown = null;
    // Demo has no database evidence. Never fabricate six OFF switches.
    if (!env.demoMode) {
      try {
        const client = createAdminSupabaseClient();
        if (client) {
          const result = await client.rpc("get_admin_purchase_capabilities", {}).abortSignal(AbortSignal.timeout(3000));
          if (!result.error) rows = result.data;
        }
      } catch {
        // Missing migration, timeout and transport failures are UNKNOWN; no raw logging.
      }
    }
    return buildPaymentReadiness(configuration, rows, adapter.requested);
  } catch {
    return unknownPaymentReadiness();
  }
}
