#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

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

if (missingCore.length === 0 && missingOperational.length === 0) {
  console.log("Environment looks ready for local marketplace QA.");
  process.exit(0);
}

if (missingCore.length) {
  console.error(`Missing core env keys: ${missingCore.join(", ")}`);
}

if (missingOperational.length) {
  console.error(`Missing operational env keys: ${missingOperational.join(", ")}`);
}

process.exit(missingCore.length ? 1 : 0);

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
