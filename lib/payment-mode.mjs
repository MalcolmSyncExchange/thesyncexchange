const PAYMENT_MODES = new Set(["test", "live"]);

export function resolvePaymentConfiguration(rawPaymentMode, deploymentTarget) {
  const normalized = typeof rawPaymentMode === "string" ? rawPaymentMode.trim().toLowerCase() : "";
  const hosted = deploymentTarget === "production" || deploymentTarget === "preview";

  if (!normalized && deploymentTarget === "local") {
    return buildConfiguration("test", deploymentTarget, false);
  }

  if (!PAYMENT_MODES.has(normalized)) {
    return {
      paymentMode: normalized || "missing",
      releaseMode: deploymentTarget === "production" ? "invalid" : deploymentTarget,
      livePaymentsEnabled: false,
      expectedLivemode: false,
      valid: false,
      issueCode: normalized ? "invalid_payment_mode" : "missing_payment_mode",
      message: hosted
        ? "SYNC_EXCHANGE_PAYMENT_MODE must be explicitly set to test or live for hosted deployments."
        : "SYNC_EXCHANGE_PAYMENT_MODE must be test or live."
    };
  }

  if (normalized === "live" && deploymentTarget !== "production") {
    return {
      paymentMode: "live",
      releaseMode: deploymentTarget,
      livePaymentsEnabled: false,
      expectedLivemode: true,
      valid: false,
      issueCode: "live_payments_outside_production",
      message: "Stripe live mode is allowed only for an explicit production deployment."
    };
  }

  return buildConfiguration(normalized, deploymentTarget, true);
}

function buildConfiguration(paymentMode, deploymentTarget, valid) {
  return {
    paymentMode,
    releaseMode:
      deploymentTarget === "production"
        ? paymentMode === "test"
          ? "production_beta"
          : "production_live"
        : deploymentTarget,
    livePaymentsEnabled: deploymentTarget === "production" && paymentMode === "live",
    expectedLivemode: paymentMode === "live",
    valid,
    issueCode: null,
    message: null
  };
}

export function getStripeCheckoutSessionMode(sessionId) {
  if (typeof sessionId !== "string" || !sessionId) return "unknown";
  if (sessionId.startsWith("cs_test_")) return "test";
  if (sessionId.startsWith("cs_live_")) return "live";
  return "unknown";
}

export function canReusePendingOrderForPaymentMode(sessionId, paymentMode) {
  return getStripeCheckoutSessionMode(sessionId) === paymentMode;
}

export function assertStripeObjectMode({
  context,
  paymentMode,
  livemode,
  checkoutSessionId
}) {
  if (!PAYMENT_MODES.has(paymentMode)) {
    throw new Error(`${context} is blocked because the configured payment mode is invalid.`);
  }

  const expectedLivemode = paymentMode === "live";
  if (typeof livemode !== "boolean" || livemode !== expectedLivemode) {
    throw new Error(`${context} livemode does not match the configured ${paymentMode} payment mode.`);
  }

  if (checkoutSessionId) {
    const sessionMode = getStripeCheckoutSessionMode(checkoutSessionId);
    if (sessionMode === "unknown" || sessionMode !== paymentMode) {
      throw new Error(`${context} checkout session identity does not match the configured ${paymentMode} payment mode.`);
    }
  }
}

export function buildPaymentClassification(paymentMode, releaseMode) {
  const test = paymentMode === "test";
  return {
    paymentMode,
    releaseMode,
    livemode: !test,
    commercialRightsGranted: !test
  };
}
