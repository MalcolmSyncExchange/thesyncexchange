#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const publicAppUrl = normalizeOptionalEnv(process.env.NEXT_PUBLIC_APP_URL) || normalizeOptionalEnv(process.env.NEXT_PUBLIC_SITE_URL);
const requiredCore = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY"
];

const requiredOperational = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
];

const missingCore = requiredCore.filter((key) => !process.env[key]);
const missingOperational = requiredOperational.filter((key) => !process.env[key]);
const deprecatedAuthKeys = ["GOTRUE_JWT_DEFAULT_GROUP_NAME", "GOTRUE_JWT_ADMIN_GROUP_NAME"];
const presentDeprecatedAuthKeys = deprecatedAuthKeys.filter((key) => process.env[key]);
const deploymentTarget = getDeploymentTarget();
const stripeSecretKeyMode = getStripeKeyMode(process.env.STRIPE_SECRET_KEY, "sk");
const stripePublishableKeyMode = getStripeKeyMode(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, "pk");

const appUrlWarnings = [];
const blockingIssues = [];
if (!publicAppUrl) {
  blockingIssues.push("NEXT_PUBLIC_APP_URL is missing. NEXT_PUBLIC_SITE_URL may be used as a fallback, but one public app origin is required.");
}

if (publicAppUrl) {
  try {
    const appUrl = new URL(publicAppUrl);
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(appUrl.hostname)) {
      const message =
        "The public app URL is pointing at a local-only address. This is fine for local development, but production auth emails and Stripe redirects must use the public app domain.";

      if (deploymentTarget === "production") {
        blockingIssues.push(message);
      } else {
        appUrlWarnings.push(message);
      }
    }

    if (deploymentTarget === "production" && appUrl.protocol !== "https:") {
      blockingIssues.push("The public app URL must use https:// in production.");
    }
  } catch {
    blockingIssues.push("The public app URL is not a valid URL.");
  }
}

if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const supabaseUrl = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    if (deploymentTarget === "production" && supabaseUrl.protocol !== "https:") {
      blockingIssues.push("NEXT_PUBLIC_SUPABASE_URL must use https:// in production.");
    }
  } catch {
    blockingIssues.push("NEXT_PUBLIC_SUPABASE_URL is not a valid URL.");
  }
}

if (
  stripeSecretKeyMode !== "missing" &&
  stripePublishableKeyMode !== "missing" &&
  stripeSecretKeyMode !== "unknown" &&
  stripePublishableKeyMode !== "unknown" &&
  stripeSecretKeyMode !== stripePublishableKeyMode
) {
  blockingIssues.push("Stripe secret and publishable keys are mixing test/live modes. Use matching key modes in the same environment.");
}

if (deploymentTarget === "production" && (stripeSecretKeyMode === "test" || stripePublishableKeyMode === "test")) {
  blockingIssues.push("Stripe keys are still in test mode while the deployment target is production. Switch both keys to live mode before launch.");
}

if (missingCore.length === 0 && missingOperational.length === 0) {
  console.log(
    deploymentTarget === "production"
      ? "Environment looks ready for a production deployment."
      : "Environment looks ready for local marketplace QA."
  );
  if (!presentDeprecatedAuthKeys.length && !appUrlWarnings.length && !blockingIssues.length) {
    process.exit(0);
  }
}

if (missingCore.length) {
  console.error(`Missing core env keys: ${missingCore.join(", ")}`);
}

if (missingOperational.length) {
  console.error(`Missing operational env keys: ${missingOperational.join(", ")}`);
}

if (presentDeprecatedAuthKeys.length) {
  console.error(
    `Deprecated auth env keys detected: ${presentDeprecatedAuthKeys.join(", ")}. Remove these legacy GoTrue variables from local or deployment config.`
  );
}

for (const issue of blockingIssues) {
  console.error(`Configuration error: ${issue}`);
}

for (const warning of appUrlWarnings) {
  console.warn(`Auth URL warning: ${warning}`);
}

process.exit(missingCore.length || missingOperational.length || presentDeprecatedAuthKeys.length || blockingIssues.length ? 1 : 0);

function getDeploymentTarget() {
  if (process.env.VERCEL_ENV === "production" || process.env.CONTEXT === "production") {
    return "production";
  }

  if (process.env.VERCEL_ENV === "preview" || process.env.CONTEXT === "deploy-preview" || process.env.CONTEXT === "branch-deploy") {
    return "preview";
  }

  return "local";
}

function getStripeKeyMode(key, expectedPrefix) {
  if (!key) {
    return "missing";
  }

  if (key.startsWith(`${expectedPrefix}_test_`)) {
    return "test";
  }

  if (key.startsWith(`${expectedPrefix}_live_`)) {
    return "live";
  }

  return "unknown";
}

function normalizeOptionalEnv(value) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!key || process.env[key]) {
      continue;
    }

    const value = line.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}
