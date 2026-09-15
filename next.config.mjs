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
  return {
    // next start reloads config without build metadata; keep the compiled target.
    env: phase === PHASE_PRODUCTION_SERVER ? {} : {
      TSE_BUILD_DEPLOYMENT_TARGET: resolveDeploymentTarget(process.env)
    },
    images: {
      remotePatterns
    }
  };
}
