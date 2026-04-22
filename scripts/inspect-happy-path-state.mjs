#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const titlePrefix = process.env.HAPPY_PATH_TRACK_PREFIX || "E2E Launch Track";

if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const { data: trackRows, error: trackError } = await supabase
  .from("tracks")
  .select("id, title, status, slug, artist_user_id, preview_file_path, created_at")
  .ilike("title", `${titlePrefix}%`)
  .order("created_at", { ascending: false })
  .limit(10);

if (trackError) {
  fail(`Unable to inspect tracks: ${trackError.message}`);
}

const trackIds = (trackRows || []).map((track) => track.id);
const { data: rightsRows, error: rightsError } = trackIds.length
  ? await supabase.from("rights_holders").select("track_id, ownership_percent").in("track_id", trackIds)
  : { data: [], error: null };

if (rightsError) {
  fail(`Unable to inspect rights holders: ${rightsError.message}`);
}

const { data: licenseOptionRows, error: licenseOptionError } = trackIds.length
  ? await supabase.from("track_license_options").select("track_id, active, license_type_id").in("track_id", trackIds)
  : { data: [], error: null };

if (licenseOptionError) {
  fail(`Unable to inspect license options: ${licenseOptionError.message}`);
}

const rightsTotalByTrackId = new Map();
for (const row of rightsRows || []) {
  rightsTotalByTrackId.set(row.track_id, Number(rightsTotalByTrackId.get(row.track_id) || 0) + Number(row.ownership_percent || 0));
}

const licenseCountByTrackId = new Map();
for (const row of licenseOptionRows || []) {
  const current = licenseCountByTrackId.get(row.track_id) || { total: 0, active: 0 };
  current.total += 1;
  if (row.active !== false) {
    current.active += 1;
  }
  licenseCountByTrackId.set(row.track_id, current);
}

console.table(
  (trackRows || []).map((track) => {
    const licenseCounts = licenseCountByTrackId.get(track.id) || { total: 0, active: 0 };
    return {
      createdAt: track.created_at,
      title: track.title,
      status: track.status,
      slug: track.slug,
      previewReady: track.preview_file_path ? "yes" : "no",
      rightsTotal: rightsTotalByTrackId.get(track.id) || 0,
      activeLicenseOptions: licenseCounts.active,
      totalLicenseOptions: licenseCounts.total
    };
  })
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
