import { NextResponse } from "next/server";

import { env, getMissingCoreEnvKeys, getPublicEnvironmentDiagnostics } from "@/lib/env";
import { getMissingOperationalEnvKeys, getServerEnvironmentDiagnostics } from "@/lib/server-env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";
import { blockingOperationalKeys, blockingHealthIssues } from "@/lib/health/payment-readiness";
import { getHealthPaymentReadiness } from "@/services/health/payment-readiness";

export async function GET() {
  const missingCore = getMissingCoreEnvKeys();
  const missingOperational = getMissingOperationalEnvKeys();
  const publicDiagnostics = getPublicEnvironmentDiagnostics();
  const serverDiagnostics = getServerEnvironmentDiagnostics();
  const maintenance = resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE);
  const paymentReadiness = await getHealthPaymentReadiness();
  const blockingOperational = blockingOperationalKeys(missingOperational, !paymentReadiness.credentialsRequired);
  const ok = maintenance.valid && missingCore.length === 0 && blockingOperational.length === 0 && blockingHealthIssues(serverDiagnostics.errors, !paymentReadiness.credentialsRequired).length === 0;

  return NextResponse.json(
    {
      ok,
      missingCore,
      missingOperational,
      blockingOperational,
      paymentReadiness,
      deploymentTarget: publicDiagnostics.deploymentTarget,
      releaseMode: serverDiagnostics.releaseMode,
      paymentMode: serverDiagnostics.paymentMode,
      livePaymentsEnabled: serverDiagnostics.livePaymentsEnabled,
      maintenanceMode: maintenance.mode,
      stripePublishableKeyMode: serverDiagnostics.stripe.publishableKeyMode,
      stripeSecretKeyMode: serverDiagnostics.stripe.secretKeyMode,
      appUrl: env.appUrl,
      stripe: serverDiagnostics.stripe,
      warnings: serverDiagnostics.warnings.map((issue) => issue.message),
      errors: [
        ...serverDiagnostics.errors.map((issue) => issue.message),
        ...(!maintenance.valid ? ["Maintenance mode configuration is invalid."] : [])
      ]
    },
    { status: ok ? 200 : 500, headers: { "Cache-Control": "private, no-store, max-age=0", "Netlify-CDN-Cache-Control": "no-store" } }
  );
}
