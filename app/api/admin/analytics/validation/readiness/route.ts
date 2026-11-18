import { getAnalyticsActor } from '@/services/analytics/actor';
import { createAdminSupabaseClient } from '@/services/supabase/admin';
import { env, getDeploymentTarget } from '@/lib/env';
import { isDedicatedStagingDeploymentIdentity } from '@/lib/staging-identity';
import { boundedValidationConfig } from '@/lib/analytics/bounded-validation';
import { parseCapabilityFlags } from '@/lib/admin-v2/payment-readiness';

const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Netlify-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie, Authorization'
};

export async function GET() {
  // getAnalyticsActor verifies Auth and the canonical user_profiles.role.
  const actor=await getAnalyticsActor();
  if (actor?.role !== 'admin') {
    return Response.json({ status: 'forbidden' }, { status: 403, headers });
  }
  const target = getDeploymentTarget();
  const vars: Record<string, string | undefined> = {
    ...process.env,
    TSE_BUILD_NETLIFY_SITE_ID: process.env.TSE_BUILD_NETLIFY_SITE_ID,
    NEXT_PUBLIC_APP_URL: env.appUrl,
    NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: env.supabaseAnonKey,
    SYNC_EXCHANGE_DEMO_MODE: String(env.demoMode)
  };
  if (!isDedicatedStagingDeploymentIdentity(vars, target)) {
    return Response.json({ status: 'unavailable' }, { status: 404, headers });
  }
  const config = boundedValidationConfig(vars, target);
  if(config && actor.id!==config.operator)return Response.json({status:'forbidden'},{status:403,headers});
  const checks = {
    validationEnabled: vars.STAGING_ANALYTICS_VALIDATION_ENABLED === 'true',
    authorizationMatches: false,
    artistMatches: false,
    operatorMatches: false,
    grantUsable: false,
    stagingIdentityValid: true,
    globalAnalyticsDisabled: vars.ANALYTICS_ENABLED === 'false',
    boundedConfigurationRecognized: config !== null,
    paymentCapabilitiesOff: false
  };
  // Read-only active-grant inspection; never arms, consumes or delivers.
  if (config) {
    try {
      const db = createAdminSupabaseClient();
      if (db) {
        const result = await db.rpc('get_admin_purchase_capabilities', {})
          .abortSignal(AbortSignal.timeout(3000));
        const flags = result.error ? null : parseCapabilityFlags(result.data);
        checks.paymentCapabilitiesOff = Boolean(flags && Object.values(flags).every(value => value === false));
        const grant=await db.rpc('get_staging_analytics_validation_readiness',{p_authorization:config.authorization,p_artist:config.artist,p_operator:actor.id}).abortSignal(AbortSignal.timeout(3000));
        const row=!grant.error && grant.data?.length===1?grant.data[0]:null;
        checks.authorizationMatches=Boolean(row?.authorization_matches);
        checks.artistMatches=Boolean(row?.artist_matches);
        checks.operatorMatches=Boolean(row?.operator_matches);
        checks.grantUsable=row?.grant_usable===true;
      }
    } catch { /* Fixed false result; never expose provider errors. */ }
  }
  const ready = Object.values(checks).every(value => value === true);
  return Response.json({ status: ready ? 'ready' : 'not_ready', ready, ...checks }, {
    status: ready ? 200 : 503, headers
  });
}
