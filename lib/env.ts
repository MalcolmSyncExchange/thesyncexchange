export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  trackAssetsBucket: process.env.NEXT_PUBLIC_SUPABASE_TRACK_ASSETS_BUCKET || "track-assets",
  agreementsBucket: process.env.NEXT_PUBLIC_SUPABASE_AGREEMENTS_BUCKET || "agreements",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  stripePublishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  demoMode: process.env.SYNC_EXCHANGE_DEMO_MODE !== "false"
};

export const hasSupabaseEnv = Boolean(env.supabaseUrl && env.supabaseAnonKey);
export const hasStripeEnv = Boolean(env.stripeSecretKey);
