#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sharedPassword = process.env.QA_TEST_ACCOUNT_PASSWORD;
const resetPasswords = process.env.QA_RESET_PASSWORDS === "true";

if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before seeding QA accounts.");
}

if (!sharedPassword) {
  fail("Missing QA_TEST_ACCOUNT_PASSWORD. Set it in your shell or .env.local before running QA account bootstrap.");
}

if (sharedPassword.length < 12) {
  fail("QA_TEST_ACCOUNT_PASSWORD must be at least 12 characters long.");
}

const qaAccounts = [
  {
    email: process.env.QA_ADMIN_EMAIL || "qa-admin@thesyncexchange.com",
    fullName: process.env.QA_ADMIN_FULL_NAME || "QA Admin",
    role: "admin",
    onboardingStep: "complete"
  },
  {
    email: process.env.QA_ARTIST_EMAIL || "qa-artist@thesyncexchange.com",
    fullName: process.env.QA_ARTIST_FULL_NAME || "QA Artist",
    role: "artist",
    onboardingStep: "complete",
    artistProfile: {
      artist_name: process.env.QA_ARTIST_NAME || "QA Artist",
      bio: "Launch-verification artist account for The Sync Exchange.",
      location: "Phoenix, AZ",
      website: "https://artist.example.com",
      instagram_url: "@qaartist",
      spotify_url: "https://open.spotify.com/artist/qa-artist",
      youtube_url: "https://youtube.com/@qaartist",
      payout_email: process.env.QA_ARTIST_EMAIL || "qa-artist@thesyncexchange.com",
      default_licensing_preferences: "Pre-cleared for marketplace QA and test sync licensing verification.",
      verification_status: "verified",
      social_links: {
        instagram: "@qaartist",
        spotify: "https://open.spotify.com/artist/qa-artist",
        youtube: "https://youtube.com/@qaartist"
      }
    }
  },
  {
    email: process.env.QA_BUYER_EMAIL || "qa-buyer@thesyncexchange.com",
    fullName: process.env.QA_BUYER_FULL_NAME || "QA Buyer",
    role: "buyer",
    onboardingStep: "complete",
    buyerProfile: {
      company_name: "QA Sync Buyer",
      buyer_type: "music-supervisor",
      industry_type: "film-tv",
      billing_email: process.env.QA_BUYER_EMAIL || "qa-buyer@thesyncexchange.com",
      music_preferences: {
        genres: ["Electronic", "Pop"],
        moods: ["Driving", "Bright"],
        intended_use: "Marketplace verification and happy-path purchase QA."
      }
    }
  },
  {
    email: process.env.QA_WRONG_BUYER_EMAIL || "qa-buyer-two@thesyncexchange.com",
    fullName: process.env.QA_WRONG_BUYER_FULL_NAME || "QA Wrong Buyer",
    role: "buyer",
    onboardingStep: "complete",
    buyerProfile: {
      company_name: "QA Wrong Buyer",
      buyer_type: "brand",
      industry_type: "advertising",
      billing_email: process.env.QA_WRONG_BUYER_EMAIL || "qa-buyer-two@thesyncexchange.com",
      music_preferences: {
        genres: ["Rock"],
        moods: ["Aggressive"],
        intended_use: "Negative authorization testing for agreement delivery."
      }
    }
  }
];

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

await ensureSchemaIsReady(supabase);

const summary = [];
for (const account of qaAccounts) {
  const result = await ensureQaAccount(supabase, account);
  summary.push(result);
}

console.log("");
console.log("QA account bootstrap succeeded.");
console.table(
  summary.map((item) => ({
    role: item.role,
    email: item.email,
    userId: item.userId,
    created: item.created ? "yes" : "no",
    passwordReset: item.passwordReset ? "yes" : "no"
  }))
);
console.log("");
console.log("Password source: QA_TEST_ACCOUNT_PASSWORD");
console.log("Next steps:");
console.log("1. Use the seeded accounts in docs/happy-path-qa.md or docs/e2e.md.");
console.log("2. Remove QA_TEST_ACCOUNT_PASSWORD from .env.local when you are done seeding local QA accounts.");

async function ensureQaAccount(client, account) {
  const existingUser = await findAuthUserByEmail(client, account.email);
  const now = new Date().toISOString();

  let user = existingUser;
  let created = false;

  if (!user) {
    const createResult = await client.auth.admin.createUser({
      email: account.email,
      password: sharedPassword,
      email_confirm: true,
      user_metadata: {
        role: account.role,
        full_name: account.fullName
      },
      app_metadata: {
        role: account.role
      }
    });

    if (createResult.error || !createResult.data.user) {
      fail(`Unable to create QA auth user ${account.email}: ${createResult.error?.message || "unknown error"}`);
    }

    user = createResult.data.user;
    created = true;
  } else {
    const updatePayload = {
      user_metadata: {
        ...(user.user_metadata || {}),
        role: account.role,
        full_name: user.user_metadata?.full_name || account.fullName
      },
      app_metadata: {
        ...(user.app_metadata || {}),
        role: account.role
      }
    };

    if (resetPasswords) {
      updatePayload.password = sharedPassword;
    }

    const updateResult = await client.auth.admin.updateUserById(user.id, updatePayload);
    if (updateResult.error || !updateResult.data.user) {
      fail(`Unable to update QA auth user ${account.email}: ${updateResult.error?.message || "unknown error"}`);
    }

    user = updateResult.data.user;
  }

  const userProfile = {
    id: user.id,
    email: account.email,
    role: account.role,
    full_name: String(user.user_metadata?.full_name || account.fullName),
    onboarding_started_at: now,
    onboarding_completed_at: now,
    onboarding_step: account.onboardingStep,
    onboarding_payload:
      account.role === "artist"
        ? { firstTrackChoice: "upload" }
        : account.role === "buyer"
          ? { intendedUse: account.buyerProfile?.music_preferences?.intended_use || "" }
          : {}
  };

  const { error: userProfileError } = await client.from("user_profiles").upsert(userProfile, { onConflict: "id" });
  if (userProfileError) {
    fail(`Unable to upsert QA user profile for ${account.email}: ${userProfileError.message}`);
  }

  if (account.role === "artist" && account.artistProfile) {
    const { error: artistProfileError } = await client.from("artist_profiles").upsert(
      {
        user_id: user.id,
        ...account.artistProfile
      },
      { onConflict: "user_id" }
    );

    if (artistProfileError) {
      fail(`Unable to upsert artist profile for ${account.email}: ${artistProfileError.message}`);
    }
  }

  if (account.role === "buyer" && account.buyerProfile) {
    const { error: buyerProfileError } = await client.from("buyer_profiles").upsert(
      {
        user_id: user.id,
        ...account.buyerProfile
      },
      { onConflict: "user_id" }
    );

    if (buyerProfileError) {
      fail(`Unable to upsert buyer profile for ${account.email}: ${buyerProfileError.message}`);
    }
  }

  return {
    email: account.email,
    role: account.role,
    userId: user.id,
    created,
    passwordReset: resetPasswords
  };
}

async function ensureSchemaIsReady(client) {
  const checks = await Promise.all([
    client.from("tracks").select("id").limit(1),
    client.from("license_types").select("id").limit(1),
    client.from("user_profiles").select("id").limit(1),
    client.from("artist_profiles").select("id").limit(1),
    client.from("buyer_profiles").select("id").limit(1)
  ]);

  const errors = checks.map((result) => result.error).filter(Boolean);
  if (errors.length === 0) {
    return;
  }

  const schemaCacheErrors = errors.every((error) =>
    String(error?.message || "").toLowerCase().includes("schema cache")
  );

  if (schemaCacheErrors) {
    fail(
      "Supabase app tables are not visible through PostgREST yet. Run npm run verify:supabase and apply supabase/manual-apply/2026-04-foundation-bootstrap.sql before seeding QA accounts."
    );
  }

  fail(`Supabase schema check failed before QA account bootstrap: ${errors.map((error) => error.message).join(" | ")}`);
}

async function findAuthUserByEmail(client, email) {
  let page = 1;

  while (true) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      fail(`Unable to list auth users: ${error.message}`);
    }

    const users = data?.users || [];
    const match = users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) {
      return match;
    }

    if (!data?.nextPage || users.length === 0) {
      return null;
    }

    page = data.nextPage;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
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
