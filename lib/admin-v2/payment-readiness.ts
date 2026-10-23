/** Safe Admin DTO: no configuration values, diagnostic strings or provider payloads. */
export const CAPABILITY_LABELS = {
  foundation_enabled: "Purchase foundation",
  asset_preparation_enabled: "Asset preparation",
  receipt_generation_enabled: "Receipt generation",
  entitlement_activation_enabled: "Entitlement activation",
  transaction_projection_enabled: "Transaction projection",
  payment_adapter_enabled: "Payment adapter"
} as const;
export type CapabilityName = keyof typeof CAPABILITY_LABELS;
export type CapabilityFlags = Record<CapabilityName, boolean>;
export const READINESS_MESSAGES = {
  configuration_missing: "Required payment or application configuration is missing.",
  configuration_invalid: "Payment configuration does not satisfy the current checkout rules.",
  demo_mode: "Marketplace payment execution is disabled in demo mode.",
  maintenance_active: "Application access is blocked by maintenance mode.",
  evaluation_unavailable: "Payment readiness could not be evaluated. Admin operations remain available.",
  capabilities_unavailable: "Purchase capability evidence is unavailable.",
  adapter_capabilities_disabled: "The configured purchase adapter requires the foundation and payment adapter capabilities.",
  fulfillment_capabilities_disabled: "Some purchase fulfillment capabilities are disabled.",
  provider_unverified: "Payment provider availability has not been checked.",
  checkout_unverified: "End-to-end checkout availability has not been verified."
} as const;
export type ReadinessReason = keyof typeof READINESS_MESSAGES;
export type PaymentConfiguration = {
  status: "ready" | "blocked" | "unknown";
  mode: "test" | "live" | "unavailable";
  reasons: ReadinessReason[];
};
export type PaymentReadiness = {
  paymentConfiguration: PaymentConfiguration;
  paymentProvider: { status: "available" | "unavailable" | "unknown" };
  purchaseCapabilities: {
    status: "enabled" | "disabled" | "partial" | "unknown";
    enabledCount: number | null;
    totalCount: 6;
    flags: CapabilityFlags | null;
  };
  checkoutReadiness: { status: "ready" | "blocked" | "unknown"; reasons: ReadinessReason[] };
};

/** Reject missing/partial/malformed evidence. Extra fields are never projected. */
export function parseCapabilityFlags(rows: unknown): CapabilityFlags | null {
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || typeof rows[0] !== "object") return null;
  const row = rows[0] as Record<string, unknown>;
  const result = {} as CapabilityFlags;
  for (const key of Object.keys(CAPABILITY_LABELS) as CapabilityName[]) {
    if (typeof row[key] !== "boolean") return null;
    result[key] = row[key];
  }
  return result;
}

export function buildPaymentReadiness(
  configuration: PaymentConfiguration,
  rows: unknown,
  adapterRequested: boolean
): PaymentReadiness {
  // Sanitize even the typed boundary: diagnostics are not an allowlist.
  const reasons = configuration.reasons.filter(reason => Object.hasOwn(READINESS_MESSAGES, reason));
  const paymentConfiguration: PaymentConfiguration = {
    status: configuration.status,
    mode: configuration.mode,
    reasons: [...new Set(reasons)]
  };
  const flags = parseCapabilityFlags(rows);
  const enabledCount = flags ? Object.values(flags).filter(Boolean).length : null;
  const purchaseCapabilities: PaymentReadiness["purchaseCapabilities"] = {
    status: enabledCount === null ? "unknown" : enabledCount === 0 ? "disabled" : enabledCount === 6 ? "enabled" : "partial",
    enabledCount, totalCount: 6, flags
  };
  const checkoutReasons = [...paymentConfiguration.reasons];
  let blocked = paymentConfiguration.status === "blocked";
  if (!flags) checkoutReasons.push("capabilities_unavailable");
  // The legacy route does not require Phase 2 capabilities. Do not claim that
  // six OFF flags disable it. Only an explicitly requested adapter needs these.
  if (adapterRequested && flags) {
    if (!flags.foundation_enabled || !flags.payment_adapter_enabled) {
      blocked = true;
      checkoutReasons.push("adapter_capabilities_disabled");
    } else if (enabledCount !== 6) {
      // Session creation may work while delivery workers are intentionally OFF.
      checkoutReasons.push("fulfillment_capabilities_disabled");
    }
  }
  checkoutReasons.push("provider_unverified", "checkout_unverified");
  return {
    paymentConfiguration,
    // No provider probe is performed. Valid key syntax is not provider evidence.
    paymentProvider: { status: "unknown" },
    purchaseCapabilities,
    // This observation-only version cannot prove READY; known blockers still win.
    checkoutReadiness: { status: blocked ? "blocked" : "unknown", reasons: [...new Set(checkoutReasons)] }
  };
}

export function unknownPaymentReadiness(): PaymentReadiness {
  return buildPaymentReadiness({ status: "unknown", mode: "unavailable", reasons: ["evaluation_unavailable"] }, null, false);
}
