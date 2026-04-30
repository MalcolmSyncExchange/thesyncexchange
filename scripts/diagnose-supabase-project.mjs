#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const requiredBuckets = ["avatars", "cover-art", "track-previews", "track-audio", "agreements"];
const tableChecks = ["tracks", "license_types", "user_profiles", "orders", "order_activity_log", "generated_licenses"];
const requiredLicenseTypeSlugs = ["digital-campaign", "broadcast", "exclusive-buyout"];

const bucketResult = await supabase.storage.listBuckets();
const tableDiagnostics = {};

for (const tableName of tableChecks) {
  const { error } = await supabase.from(tableName).select("id").limit(1);
  tableDiagnostics[tableName] = error
    ? {
        ok: false,
        code: error.code || "",
        message: error.message || "",
        details: error.details || "",
        hint: error.hint || ""
      }
    : { ok: true };
}

const licenseSeedResult = await supabase.from("license_types").select("slug").in("slug", requiredLicenseTypeSlugs);
const availableLicenseTypeSlugs = new Set((licenseSeedResult.data || []).map((licenseType) => licenseType.slug));
const missingLicenseTypes = requiredLicenseTypeSlugs.filter((slug) => !availableLicenseTypeSlugs.has(slug));

const presentBuckets = new Set((bucketResult.data || []).map((bucket) => bucket.name));
const missingBuckets = requiredBuckets.filter((bucket) => !presentBuckets.has(bucket));

const foundationVisible = tableDiagnostics.tracks.ok && tableDiagnostics.license_types.ok;
const finalizationReady =
  foundationVisible &&
  tableDiagnostics.user_profiles.ok &&
  tableDiagnostics.orders.ok &&
  tableDiagnostics.order_activity_log.ok &&
  tableDiagnostics.generated_licenses.ok;
const referenceDataReady = !licenseSeedResult.error && missingLicenseTypes.length === 0;
const fullReady = finalizationReady && missingBuckets.length === 0 && referenceDataReady;

let recommendedAction = "none";
let recommendedBundle = null;

if (missingBuckets.length > 0) {
  recommendedAction = "run_storage_setup";
  recommendedBundle = "supabase/manual-apply/2026-04-foundation-bootstrap.sql";
} else if (!finalizationReady) {
  recommendedAction = "apply_finalization_bundle";
  recommendedBundle = "supabase/manual-apply/2026-04-foundation-bootstrap.sql";
} else if (!referenceDataReady) {
  recommendedAction = "seed_license_types";
}

const result = {
  ready: fullReady,
  supabaseProjectHost: new URL(supabaseUrl).host,
  missingBuckets,
  licenseTypeDiagnostics: licenseSeedResult.error
    ? {
        ok: false,
        message: licenseSeedResult.error.message || "Unable to verify required license types."
      }
    : {
        ok: missingLicenseTypes.length === 0,
        missingSlugs: missingLicenseTypes
      },
  tableDiagnostics,
  recommendedAction,
  recommendedBundle,
  runbook: "docs/supabase-finalization.md",
  nextSteps:
    recommendedAction === "apply_finalization_bundle"
      ? [
          "Run npm run setup:storage",
          "Open the Supabase SQL Editor",
          "Paste supabase/manual-apply/2026-04-foundation-bootstrap.sql",
          "Run the query once",
          "Re-check with npm run verify:supabase or /api/health/readiness"
        ]
      : recommendedAction === "seed_license_types"
        ? ["Run npm run seed:license-types and then re-check readiness."]
      : recommendedAction === "run_storage_setup"
          ? ["Run npm run setup:storage and then re-check readiness."]
          : ["Supabase storage and table visibility look healthy from the service-role client."]
};

console.log(JSON.stringify(result, null, 2));

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
