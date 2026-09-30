import type { DeploymentTarget } from "./deployment-target.mjs";

export type PaymentMode = "test" | "live";
export type ReleaseMode = "local" | "preview" | "production_beta" | "production_live" | "invalid";
export type OperationalReleaseMode = Exclude<ReleaseMode, "invalid">;
export type StripeObjectMode = PaymentMode | "unknown";

export type PaymentConfiguration = {
  paymentMode: PaymentMode | "missing" | string;
  releaseMode: ReleaseMode;
  livePaymentsEnabled: boolean;
  expectedLivemode: boolean;
  valid: boolean;
  issueCode: string | null;
  message: string | null;
};

export function resolvePaymentConfiguration(rawPaymentMode: string | undefined, deploymentTarget: DeploymentTarget): PaymentConfiguration;
export function getStripeCheckoutSessionMode(sessionId: string | null | undefined): StripeObjectMode;
export function canReusePendingOrderForPaymentMode(sessionId: string | null | undefined, paymentMode: PaymentMode): boolean;
export function assertStripeObjectMode(input: {
  context: string;
  paymentMode: string;
  livemode: boolean | undefined;
  checkoutSessionId?: string | null;
}): void;
export function buildPaymentClassification(paymentMode: PaymentMode, releaseMode: OperationalReleaseMode): {
  paymentMode: PaymentMode;
  releaseMode: OperationalReleaseMode;
  livemode: boolean;
  commercialRightsGranted: boolean;
};
