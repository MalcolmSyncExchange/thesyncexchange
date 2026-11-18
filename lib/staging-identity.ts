/** Reused platform/build and project-claim binding. Claims are metadata checks;
 * cryptographic credential validity is verified separately by Supabase health RPC. */
export function isDedicatedStagingDeploymentIdentity(vars: Record<string, string | undefined>, target: string) {
  const site = "d8e851a6-ab37-4b0e-9403-9b2c1be65f13";
  const project = "oppijylbkcbiqfuvckgj";
  function claims(value: string | undefined, role: string) {
    try {
      const parts = value?.split(".");
      if (!parts || parts.length !== 3) return false;
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      return payload.ref === project && payload.role === role;
    } catch { return false; }
  }
  return target === "production" && vars.SYNC_EXCHANGE_DEPLOYMENT_CLASS === "dedicated-staging" &&
    vars.SITE_ID === site && vars.TSE_BUILD_NETLIFY_SITE_ID === site &&
    vars.URL === "https://sync-exchange-posthog-staging.netlify.app" &&
    (vars.CONTEXT === undefined || vars.CONTEXT === "production") &&
    vars.NEXT_PUBLIC_APP_URL === "https://sync-exchange-posthog-staging.netlify.app" &&
    vars.NEXT_PUBLIC_SUPABASE_URL === `https://${project}.supabase.co` &&
    vars.SYNC_EXCHANGE_DEMO_MODE === "false" &&
    claims(vars.NEXT_PUBLIC_SUPABASE_ANON_KEY, "anon") && claims(vars.SUPABASE_SERVICE_ROLE_KEY, "service_role");
}
