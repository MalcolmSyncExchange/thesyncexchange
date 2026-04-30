import { NextResponse } from "next/server";

import { env, getMissingCoreEnvKeys, getPublicEnvironmentDiagnostics } from "@/lib/env";
import { getMissingOperationalEnvKeys, getServerEnvironmentDiagnostics } from "@/lib/server-env";

export async function GET() {
  const missingCore = getMissingCoreEnvKeys();
  const missingOperational = getMissingOperationalEnvKeys();
  const publicDiagnostics = getPublicEnvironmentDiagnostics();
  const serverDiagnostics = getServerEnvironmentDiagnostics();
  const ok = missingCore.length === 0 && missingOperational.length === 0 && serverDiagnostics.errors.length === 0;

  return NextResponse.json(
    {
      ok,
      missingCore,
      missingOperational,
      deploymentTarget: publicDiagnostics.deploymentTarget,
      appUrl: env.appUrl,
      stripe: serverDiagnostics.stripe,
      warnings: serverDiagnostics.warnings.map((issue) => issue.message),
      errors: serverDiagnostics.errors.map((issue) => issue.message)
    },
    { status: ok ? 200 : 500 }
  );
}
