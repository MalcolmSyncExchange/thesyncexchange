import { resolveDeploymentTarget } from "./lib/deployment-target.mjs";
import { PHASE_PRODUCTION_SERVER } from "next/constants.js";

const remotePatterns = [
  {
    protocol: "https",
    hostname: "images.unsplash.com"
  }
];

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

if (supabaseUrl) {
  try {
    remotePatterns.push({
      protocol: "https",
      hostname: new URL(supabaseUrl).hostname
    });
  } catch {
    // Ignore malformed local env here; runtime env validation handles it elsewhere.
  }
}

export default function nextConfig(phase) {
  const siteId = process.env.NETLIFY === "true" || process.env.NETLIFY_LOCAL === "true" ? process.env.SITE_ID || "" : "";
  if (phase !== PHASE_PRODUCTION_SERVER && process.env.SYNC_EXCHANGE_DEPLOYMENT_CLASS === "dedicated-staging" &&
      (siteId !== "d8e851a6-ab37-4b0e-9403-9b2c1be65f13" || resolveDeploymentTarget(process.env) !== "production")) {
    throw new Error("Dedicated staging build identity is missing or mismatched.");
  }
  return {
    // next start reloads config without build metadata; keep the compiled target.
    env: phase === PHASE_PRODUCTION_SERVER ? {} : {
      TSE_BUILD_NETLIFY_SITE_ID: siteId,
      TSE_BUILD_DEPLOYMENT_TARGET: resolveDeploymentTarget(process.env),
      TSE_BUILD_PREVIEW_PAYMENT_MODE: resolveDeploymentTarget(process.env) === "preview"
        ? process.env.SYNC_EXCHANGE_PAYMENT_MODE || "" : ""
    },
    async headers() {
      return [{ source: "/:path*", headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }
      ] }, { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store, max-age=0" }] }];
    },
    serverExternalPackages: ["pdfkit", "stripe"],
    outputFileTracingIncludes: { "/*": ["./assets/license-fonts/**/*", "./public/brand/the-sync-exchange/logos/website-header-horizontal-light-transparent.png", "./public/brand/the-sync-exchange/watermark/Watermark.png"] },
    images: {
      remotePatterns,
      qualities: [75, 90]
    }
  };
}
