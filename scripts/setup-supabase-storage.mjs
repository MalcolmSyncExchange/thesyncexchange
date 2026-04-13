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
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in .env.local before running storage setup.");
  process.exit(1);
}

const bucketConfig = [
  { id: process.env.NEXT_PUBLIC_SUPABASE_AVATARS_BUCKET || "avatars", public: true, fileSizeLimit: "10485760", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  { id: process.env.NEXT_PUBLIC_SUPABASE_COVER_ART_BUCKET || "cover-art", public: true, fileSizeLimit: "10485760", allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"] },
  { id: process.env.NEXT_PUBLIC_SUPABASE_TRACK_PREVIEWS_BUCKET || "track-previews", public: true, fileSizeLimit: "26214400", allowedMimeTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/aiff", "audio/flac", "application/json", "image/jpeg", "image/png", "image/webp"] },
  { id: process.env.NEXT_PUBLIC_SUPABASE_TRACK_AUDIO_BUCKET || "track-audio", public: false, fileSizeLimit: "52428800", allowedMimeTypes: ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/aiff", "audio/flac"] },
  { id: process.env.NEXT_PUBLIC_SUPABASE_AGREEMENTS_BUCKET || "agreements", public: false, fileSizeLimit: "20971520", allowedMimeTypes: ["text/html", "application/pdf"] }
];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const { data: existingBuckets, error: listError } = await supabase.storage.listBuckets();
if (listError) {
  console.error(`Unable to list storage buckets: ${listError.message}`);
  process.exit(1);
}

const existingById = new Map((existingBuckets || []).map((bucket) => [bucket.id, bucket]));

for (const bucket of bucketConfig) {
  const existing = existingById.get(bucket.id);
  const bucketOptions = {
    public: bucket.public,
    fileSizeLimit: Number(bucket.fileSizeLimit),
    allowedMimeTypes: bucket.allowedMimeTypes
  };

  if (!existing) {
    const { error } = await createOrUpdateBucket("create", bucket.id, bucketOptions);

    if (error) {
      console.error(`Failed to create bucket ${bucket.id}: ${error.message}`);
      process.exit(1);
    }

    console.log(`Created bucket ${bucket.id} (${bucket.public ? "public" : "private"})`);
    continue;
  }

  const { error } = await createOrUpdateBucket("update", bucket.id, bucketOptions);

  if (error) {
    console.error(`Failed to update bucket ${bucket.id}: ${error.message}`);
    process.exit(1);
  }

  console.log(`Verified bucket ${bucket.id} (${bucket.public ? "public" : "private"})`);
}

console.log("");
console.log("Storage buckets are configured.");
console.log("Next step: apply the SQL in supabase/manual-apply/2026-04-storage-fulfillment-avatar.sql (or the matching migrations) to enforce object-level access rules.");

async function createOrUpdateBucket(mode, bucketId, options) {
  const run = (nextOptions) =>
    mode === "create" ? supabase.storage.createBucket(bucketId, nextOptions) : supabase.storage.updateBucket(bucketId, nextOptions);

  let result = await run(options);

  if (result.error && result.error.message.toLowerCase().includes("maximum allowed size")) {
    console.warn(`Bucket ${bucketId} rejected the requested file size limit; retrying with platform default.`);
    const fallbackOptions = {
      public: options.public,
      allowedMimeTypes: options.allowedMimeTypes
    };
    result = await run(fallbackOptions);
  }

  return result;
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
