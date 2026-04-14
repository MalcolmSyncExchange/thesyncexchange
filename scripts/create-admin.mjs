#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const ADMIN_EMAIL = process.env.ADMIN_BOOTSTRAP_EMAIL || "malcolm@thesyncexchange.com";
const ADMIN_FULL_NAME = process.env.ADMIN_BOOTSTRAP_FULL_NAME || "Malcolm";
const ADMIN_PASSWORD = process.env.ADMIN_BOOTSTRAP_PASSWORD;
const RESET_PASSWORD = process.env.ADMIN_BOOTSTRAP_RESET_PASSWORD === "true";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to .env.local before running admin bootstrap.");
}

if (!ADMIN_PASSWORD) {
  fail(
    "Missing ADMIN_BOOTSTRAP_PASSWORD. Set it in your shell or temporarily in .env.local before running the bootstrap script."
  );
}

if (ADMIN_PASSWORD.length < 12) {
  fail("ADMIN_BOOTSTRAP_PASSWORD must be at least 12 characters long.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

await ensureSchemaIsReady(supabase);

const existingUser = await findAuthUserByEmail(supabase, ADMIN_EMAIL);
const now = new Date().toISOString();

let authUser = existingUser;

if (!authUser) {
  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      role: "admin",
      full_name: ADMIN_FULL_NAME
    },
    app_metadata: {
      role: "admin"
    }
  });

  if (error || !data.user) {
    fail(`Unable to create auth user for ${ADMIN_EMAIL}: ${error?.message || "unknown error"}`);
  }

  authUser = data.user;
  log(`Created auth user ${ADMIN_EMAIL}.`);
} else {
  const updatePayload = {
    user_metadata: {
      ...(authUser.user_metadata || {}),
      role: "admin",
      full_name: authUser.user_metadata?.full_name || ADMIN_FULL_NAME
    },
    app_metadata: {
      ...(authUser.app_metadata || {}),
      role: "admin"
    }
  };

  if (RESET_PASSWORD) {
    updatePayload.password = ADMIN_PASSWORD;
  }

  const { data, error } = await supabase.auth.admin.updateUserById(authUser.id, updatePayload);

  if (error || !data.user) {
    fail(`Unable to update auth user ${ADMIN_EMAIL}: ${error?.message || "unknown error"}`);
  }

  authUser = data.user;
  log(
    RESET_PASSWORD
      ? `Updated existing auth user ${ADMIN_EMAIL} and reset the password from ADMIN_BOOTSTRAP_PASSWORD.`
      : `Updated existing auth user ${ADMIN_EMAIL}. Password was left unchanged. Set ADMIN_BOOTSTRAP_RESET_PASSWORD=true if you need to rotate it.`
  );
}

const profilePayload = {
  id: authUser.id,
  email: ADMIN_EMAIL,
  role: "admin",
  full_name: String(authUser.user_metadata?.full_name || ADMIN_FULL_NAME),
  onboarding_started_at: now,
  onboarding_completed_at: now,
  onboarding_step: "complete",
  onboarding_payload: {}
};

const { error: profileError } = await supabase.from("user_profiles").upsert(profilePayload, { onConflict: "id" });

if (profileError) {
  fail(`Auth user exists, but user_profiles upsert failed for ${ADMIN_EMAIL}: ${profileError.message}`);
}

const { data: profileRow, error: profileReadError } = await supabase
  .from("user_profiles")
  .select("id, email, role, full_name, onboarding_completed_at")
  .eq("id", authUser.id)
  .maybeSingle();

if (profileReadError) {
  fail(`Admin profile verification failed for ${ADMIN_EMAIL}: ${profileReadError.message}`);
}

if (!profileRow || profileRow.role !== "admin") {
  fail(`Admin profile verification failed for ${ADMIN_EMAIL}: role was not persisted as admin.`);
}

console.log("");
console.log("Admin bootstrap succeeded.");
console.log(`Email: ${ADMIN_EMAIL}`);
console.log(`User ID: ${authUser.id}`);
console.log("Role: admin");
console.log("Login path: /login");
console.log("");
console.log("Next steps:");
console.log("1. Remove ADMIN_BOOTSTRAP_PASSWORD from .env.local or unset it in your shell.");
if (!RESET_PASSWORD && existingUser) {
  console.log("2. If this account existed already and you do not know the password, rerun with ADMIN_BOOTSTRAP_RESET_PASSWORD=true.");
} else {
  console.log("2. Sign in through the normal /login flow.");
}

async function ensureSchemaIsReady(client) {
  const checks = await Promise.all([
    client.from("tracks").select("id").limit(1),
    client.from("license_types").select("id").limit(1),
    client.from("user_profiles").select("id").limit(1)
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
      "Supabase app tables are not visible through PostgREST yet. Run npm run verify:supabase and apply supabase/manual-apply/2026-04-foundation-bootstrap.sql before bootstrapping the admin account."
    );
  }

  fail(`Supabase schema check failed before admin bootstrap: ${errors.map((error) => error.message).join(" | ")}`);
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

function log(message) {
  console.log(message);
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
