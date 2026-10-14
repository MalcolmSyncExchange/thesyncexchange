import { getAnalyticsActor } from '@/services/analytics/actor';
import { createAdminSupabaseClient } from '@/services/supabase/admin';
import { env, getDeploymentTarget } from '@/lib/env';
import { isDedicatedStagingDeploymentIdentity } from '@/lib/staging-identity';
import { boundedValidationConfig } from '@/lib/analytics/bounded-validation';
import { parseCapabilityFlags } from '@/lib/admin-v2/payment-readiness';

const authorization = '82c44923-4522-41e2-99f2-e567e1570b4d';
const artist = '9e61c9ea-ed51-4328-8937-0b989dece2c9';
const headers = {
  'Cache-Control': 'private, no-store, max-age=0',
  'Netlify-CDN-Cache-Control': 'no-store',
  Vary: 'Cookie, Authorization'
};

export async function GET() {
  // getAnalyticsActor verifies Auth and the canonical user_profiles.role.
  if ((await getAnalyticsActor())?.role !== 'admin') {
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
  const checks = {
    validationEnabled: vars.STAGING_ANALYTICS_VALIDATION_ENABLED === 'true',
    authorizationMatches: vars.STAGING_ANALYTICS_VALIDATION_AUTHORIZATION === authorization,
    artistMatches: vars.STAGING_ANALYTICS_VALIDATION_ARTIST === artist,
    stagingIdentityValid: true,
    globalAnalyticsDisabled: vars.ANALYTICS_ENABLED === 'false',
    boundedConfigurationRecognized: config !== null,
    paymentCapabilitiesOff: false
  };
  // No grant query, claim, consumption, capture or transport path exists here.
  if (config && checks.authorizationMatches && checks.artistMatches) {
    try {
      const db = createAdminSupabaseClient();
      if (db) {
        const result = await db.rpc('get_admin_purchase_capabilities', {})
          .abortSignal(AbortSignal.timeout(3000));
        const flags = result.error ? null : parseCapabilityFlags(result.data);
        checks.paymentCapabilitiesOff = Boolean(flags && Object.values(flags).every(value => value === false));
      }
    } catch { /* Fixed false result; never expose provider errors. */ }
  }
  const ready = Object.values(checks).every(value => value === true);
  return Response.json({ status: ready ? 'ready' : 'not_ready', ready, ...checks }, {
    status: ready ? 200 : 503, headers
  });
}
