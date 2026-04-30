import { NextResponse } from "next/server";

import { env, getDeploymentTarget, getPublicEnvironmentDiagnostics, hasSupabaseEnv } from "@/lib/env";
import { buildPasswordResetRedirectUrl, resolveAuthMode } from "@/services/auth/auth-flow";

export const dynamic = "force-dynamic";

export async function GET() {
  const authMode = resolveAuthMode({ hasSupabaseEnv, demoMode: env.demoMode });
  const diagnostics = getPublicEnvironmentDiagnostics();
  let resetPasswordRedirectUrl: string | null = null;
  let resetPasswordRedirectError: string | null = null;

  try {
    resetPasswordRedirectUrl = buildPasswordResetRedirectUrl({
      configuredAppUrl: env.configuredAppUrl,
      deploymentTarget: getDeploymentTarget(),
      requestOrigin: null
    });
  } catch (error) {
    resetPasswordRedirectError = error instanceof Error ? error.message : "Unable to resolve reset password redirect URL.";
  }

  return NextResponse.json({
    ok: authMode === "supabase" && diagnostics.errors.length === 0 && !resetPasswordRedirectError,
    authMode,
    demoMode: env.demoMode,
    supabaseUrlPresent: Boolean(env.supabaseUrl),
    supabaseAnonKeyPresent: Boolean(env.supabaseAnonKey),
    appUrl: env.appUrl,
    resetPasswordRedirectUrl,
    resetPasswordRedirectError,
    issues: diagnostics.issues
  });
}
