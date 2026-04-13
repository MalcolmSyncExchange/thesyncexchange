const hasSupabasePublicEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const explicitDemoMode = process.env.SYNC_EXCHANGE_DEMO_MODE;

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  avatarsBucket: process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET || "avatars",
  coverArtBucket: process.env.NEXT_PUBLIC_SUPABASE_COVER_ART_BUCKET || "cover-art",
  trackAudioBucket: process.env.NEXT_PUBLIC_SUPABASE_TRACK_AUDIO_BUCKET || "track-audio",
  trackPreviewsBucket: process.env.NEXT_PUBLIC_SUPABASE_TRACK_PREVIEWS_BUCKET || "track-previews",
  agreementsBucket: process.env.NEXT_PUBLIC_SUPABASE_AGREEMENTS_BUCKET || "agreements",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  demoMode: explicitDemoMode ? explicitDemoMode !== "false" : !hasSupabasePublicEnv
};

export const hasSupabaseEnv = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const hasStripeEnv = Boolean(env.stripeSecretKey);

export function getMissingCoreEnvKeys() {
  return [
    ["NEXT_PUBLIC_APP_URL", env.appUrl],
    ["NEXT_PUBLIC_SUPABASE_URL", env.supabaseUrl],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", env.supabaseAnonKey]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}

export function getMissingOperationalEnvKeys() {
  return [
    ["SUPABASE_SERVICE_ROLE_KEY", env.supabaseServiceRoleKey],
    ["STRIPE_SECRET_KEY", env.stripeSecretKey],
    ["STRIPE_WEBHOOK_SECRET", env.stripeWebhookSecret],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", env.stripePublishableKey]
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
