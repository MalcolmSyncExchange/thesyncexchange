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
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}

const defaultLicenseTypes = [
  {
    id: "99999999-0000-0000-0000-000000000001",
    name: "Digital Campaign",
    slug: "digital-campaign",
    description: "Ideal for paid social, web spots, and short-form branded content.",
    exclusive: false,
    default_price_cents: 120000,
    terms_summary: "12-month campaign use, digital only.",
    active: true
  },
  {
    id: "99999999-0000-0000-0000-000000000002",
    name: "Broadcast",
    slug: "broadcast",
    description: "For TV, streaming spots, and regional or national campaign rollouts.",
    exclusive: false,
    default_price_cents: 480000,
    terms_summary: "Broadcast and streaming usage, term defined at checkout.",
    active: true
  },
  {
    id: "99999999-0000-0000-0000-000000000003",
    name: "Trailer / Promo",
    slug: "trailer-promo",
    description: "Built for cinematic promo placements and high-impact cutdowns.",
    exclusive: false,
    default_price_cents: 680000,
    terms_summary: "Promo/trailer use, non-exclusive.",
    active: true
  },
  {
    id: "99999999-0000-0000-0000-000000000004",
    name: "Exclusive Buyout",
    slug: "exclusive-buyout",
    description: "Full exclusive negotiation scaffold for premium placements.",
    exclusive: true,
    default_price_cents: 1800000,
    terms_summary: "Exclusive placement placeholder terms. TODO: legal review.",
    active: true
  }
];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const { data: existingRows, error: existingError } = await supabase
  .from("license_types")
  .select("id, slug")
  .in(
    "slug",
    defaultLicenseTypes.map((licenseType) => licenseType.slug)
  );

if (existingError) {
  fail(`Unable to inspect existing license types: ${existingError.message}`);
}

const existingBySlug = new Map((existingRows || []).map((licenseType) => [licenseType.slug, licenseType.id]));

for (const licenseType of defaultLicenseTypes) {
  const row = {
    ...licenseType,
    id: existingBySlug.get(licenseType.slug) || licenseType.id,
    code: licenseType.slug
  };

  const { error } = await supabase.from("license_types").upsert(row, { onConflict: "id" });
  if (error) {
    fail(`Unable to seed license type ${licenseType.slug}: ${error.message}`);
  }
}

const { data, error: readError } = await supabase
  .from("license_types")
  .select("slug, active, default_price_cents")
  .in(
    "slug",
    defaultLicenseTypes.map((licenseType) => licenseType.slug)
  )
  .order("slug");

if (readError) {
  fail(`License types were written, but verification read failed: ${readError.message}`);
}

console.log("Default license types are present.");
console.table(
  (data || []).map((licenseType) => ({
    slug: licenseType.slug,
    active: licenseType.active ? "yes" : "no",
    defaultPriceCents: licenseType.default_price_cents
  }))
);

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

function fail(message) {
  console.error(message);
  process.exit(1);
}
