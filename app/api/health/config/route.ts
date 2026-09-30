import { NextResponse } from "next/server";

import { env, getMissingCoreEnvKeys, getPublicEnvironmentDiagnostics } from "@/lib/env";
import { getMissingOperationalEnvKeys, getServerEnvironmentDiagnostics } from "@/lib/server-env";
import { resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";

export async function GET() {
  const missingCore = getMissingCoreEnvKeys();
  const missingOperational = getMissingOperationalEnvKeys();
  const publicDiagnostics = getPublicEnvironmentDiagnostics();
  const serverDiagnostics = getServerEnvironmentDiagnostics();
  const maintenance = resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE);
  const ok = maintenance.valid && missingCore.length === 0 && missingOperational.length === 0 && serverDiagnostics.errors.length === 0;

  return NextResponse.json(
    {
      ok,
      missingCore,
      missingOperational,
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
