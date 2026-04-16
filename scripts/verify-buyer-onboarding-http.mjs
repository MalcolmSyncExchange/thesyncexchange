#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const baseUrl = process.env.BUYER_ONBOARDING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.BUYER_ONBOARDING_TEST_PASSWORD || process.env.QA_TEST_ACCOUNT_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

if (!password || password.length < 12) {
  fail("Set BUYER_ONBOARDING_TEST_PASSWORD or QA_TEST_ACCOUNT_PASSWORD to a password with at least 12 characters.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  await ensureServerIsReachable();
  await ensureSchemaIsReady();

  const timestamp = Date.now();
  const email = `qa-buyer-onboarding+${timestamp}@thesyncexchange.com`;
  const fullName = "Buyer Onboarding QA";
  const companyName = "Sync Buyer QA";
  const billingEmail = `billing+${timestamp}@thesyncexchange.com`;
  const buyerType = "Music Supervisor";
  const industryType = "Film & TV";

  let authUserId = null;

  const cookieJar = new CookieJar();

  try {
    const signupResult = await submitSignup(cookieJar, { email, password, fullName });

    authUserId = await ensureConfirmedBuyerAuthUser({
      email,
      password,
      fullName,
      usedAdminFallback: signupResult.rateLimited
    });

    const persistedAfterSignup = await selectUserProfile(authUserId);
    assert.ok(persistedAfterSignup, "user_profiles row should exist immediately after signup");
    assert.equal(persistedAfterSignup.role, "buyer");
    assert.equal(persistedAfterSignup.onboarding_step, "basics");

    await submitLogin(cookieJar, { email, password });

    await submitBuyerBasics(cookieJar, { fullName, companyName });

    const basicsState = await selectUserProfile(authUserId);
    assert.ok(basicsState, "user_profiles row should still exist after basics");
    assert.equal(basicsState.full_name, fullName);
    assert.equal(basicsState.onboarding_step, "profile");
    assert.equal(basicsState.onboarding_payload?.companyName, companyName);

    const profileAfterBasics = await selectBuyerProfile(authUserId);
    assert.equal(profileAfterBasics, null, "buyer_profiles row should not be created during basics anymore");

    await submitBuyerProfile(cookieJar, { buyerType, industryType, billingEmail });

    const profileState = await selectUserProfile(authUserId);
    assert.ok(profileState, "user_profiles row should exist after profile");
    assert.equal(profileState.onboarding_step, "interests");

    const buyerProfile = await selectBuyerProfile(authUserId);
    assert.ok(buyerProfile, "buyer_profiles row should be created on buyer profile step");
    assert.equal(buyerProfile.company_name, companyName);
    assert.equal(buyerProfile.buyer_type, buyerType);
    assert.equal(buyerProfile.industry_type, industryType);
    assert.equal(buyerProfile.billing_email, billingEmail);

    await submitBuyerInterests(cookieJar, {
      genres: ["Electronic", "Pop"],
      moods: ["Driving", "Bright"],
      intendedUse: "Launch-readiness buyer onboarding verification."
    });

    const interestsState = await selectUserProfile(authUserId);
    assert.ok(interestsState, "user_profiles row should exist after interests");
    assert.equal(interestsState.onboarding_step, "complete");

    const interestsProfile = await selectBuyerProfile(authUserId);
    assert.ok(interestsProfile, "buyer_profiles row should still exist after interests");
    assert.deepEqual(interestsProfile.music_preferences, {
      genres: ["Electronic", "Pop"],
      moods: ["Driving", "Bright"],
      intended_use: "Launch-readiness buyer onboarding verification."
    });

    await finishBuyerOnboarding(cookieJar);

    const completedState = await selectUserProfile(authUserId);
    assert.ok(completedState?.onboarding_completed_at, "buyer onboarding should be marked complete");
    assert.equal(completedState?.onboarding_step, "complete");

    const completionRefresh = await request(cookieJar, "/onboarding/buyer?step=complete");
    assertRedirectResponse(
      completionRefresh,
      "/dashboard/buyer",
      "completed buyer onboarding should redirect away from onboarding on refresh"
    );

    const reloginCookieJar = new CookieJar();
    await submitLogin(reloginCookieJar, {
      email,
      password,
      expectedRedirectIncludes: "/dashboard/buyer"
    });

    console.log("Buyer onboarding verification succeeded.");
    console.log(JSON.stringify({ email, userId: authUserId, baseUrl }, null, 2));
  } finally {
    if (authUserId) {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) {
        console.warn(`Warning: failed to delete QA auth user ${authUserId}: ${error.message}`);
      }
    }
  }
}

async function submitSignup(cookieJar, { email, password, fullName }) {
  const signupPage = await request(cookieJar, "/signup/buyer");
  assert.equal(signupPage.status, 200, "signup page should load");

  const form = extractForm(signupPage.body, 'name="role" value="buyer"');
  const response = await submitForm(cookieJar, "/signup/buyer", form, {
    fullName,
    email,
    password,
    role: "buyer",
    returnTo: "/signup/buyer"
  });

  assert.ok([303, 307].includes(response.status), `signup should redirect, got ${response.status}`);
  const location = response.location || "";
  if (location.includes("email%20rate%20limit%20exceeded")) {
    return {
      rateLimited: true
    };
  }

  assert.ok(
    location.includes("confirmation=required") || location.includes("/onboarding"),
    `signup should route into confirmation or onboarding, got ${location || "<none>"}`
  );

  return {
    rateLimited: false
  };
}

async function submitLogin(cookieJar, { email, password, expectedRedirectIncludes = "/onboarding/buyer" }) {
  const loginPage = await request(cookieJar, "/login");
  assert.equal(loginPage.status, 200, "login page should load");

  const form = extractForm(loginPage.body, 'data-testid="login-form"');
  const response = await submitForm(cookieJar, "/login", form, {
    email,
    password,
    redirectTo: ""
  });

  assert.ok([303, 307].includes(response.status), `login should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes(expectedRedirectIncludes),
    `buyer login should redirect to ${expectedRedirectIncludes}, got ${response.location || "<none>"}`
  );
}

async function submitBuyerBasics(cookieJar, { fullName, companyName }) {
  const page = await request(cookieJar, "/onboarding/buyer");
  assert.equal(page.status, 200, "buyer onboarding page should load");

  const form = extractForm(page.body, 'name="step" value="basics"');
  const response = await submitForm(cookieJar, "/onboarding/buyer", form, {
    step: "basics",
    fullName,
    companyName
  });

  assert.ok([303, 307].includes(response.status), `buyer basics should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/onboarding/buyer?step=profile"),
    `buyer basics should advance to profile, got ${response.location || "<none>"}`
  );
}

async function submitBuyerProfile(cookieJar, { buyerType, industryType, billingEmail }) {
  const page = await request(cookieJar, "/onboarding/buyer?step=profile");
  assert.equal(page.status, 200, "buyer profile page should load");

  const form = extractForm(page.body, 'name="step" value="profile"');
  const response = await submitForm(cookieJar, "/onboarding/buyer?step=profile", form, {
    step: "profile",
    buyerType,
    industryType,
    billingEmail
  });

  assert.ok([303, 307].includes(response.status), `buyer profile should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/onboarding/buyer?step=interests"),
    `buyer profile should advance to interests, got ${response.location || "<none>"}`
  );
}

async function submitBuyerInterests(cookieJar, { genres, moods, intendedUse }) {
  const page = await request(cookieJar, "/onboarding/buyer?step=interests");
  assert.equal(page.status, 200, "buyer interests page should load");

  const form = extractForm(page.body, 'name="step" value="interests"');
  const response = await submitForm(cookieJar, "/onboarding/buyer?step=interests", form, {
    step: "interests",
    genres,
    moods,
    intendedUse
  });

  assert.ok([303, 307].includes(response.status), `buyer interests should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/onboarding/buyer?step=complete"),
    `buyer interests should advance to completion, got ${response.location || "<none>"}`
  );
}

async function finishBuyerOnboarding(cookieJar) {
  const page = await request(cookieJar, "/onboarding/buyer?step=complete");
  assert.equal(page.status, 200, "buyer completion page should load");

  const form = extractForm(page.body, 'name="destination" value="catalog"');
  const response = await submitForm(cookieJar, "/onboarding/buyer?step=complete", form, {
    destination: "catalog"
  });

  assert.ok([303, 307].includes(response.status), `buyer completion should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/buyer/catalog"),
    `buyer completion should redirect to catalog, got ${response.location || "<none>"}`
  );
}

async function ensureConfirmedBuyerAuthUser({ email, password, fullName, usedAdminFallback }) {
  let existingUser = await findAuthUserByEmail(email);

  if (!existingUser && usedAdminFallback) {
    const createResult = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "buyer",
        full_name: fullName
      },
      app_metadata: {
        role: "buyer"
      }
    });

    if (createResult.error || !createResult.data.user) {
      fail(`Unable to create QA buyer auth user after signup rate limiting: ${createResult.error?.message || "unknown error"}`);
    }

    existingUser = createResult.data.user;
  }

  if (!existingUser) {
    fail(`Could not find auth user for ${email} after signup.`);
  }

  const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
    email_confirm: true,
    user_metadata: {
      ...(existingUser.user_metadata || {}),
      role: "buyer",
      full_name: existingUser.user_metadata?.full_name || fullName
    },
    app_metadata: {
      ...(existingUser.app_metadata || {}),
      role: "buyer"
    }
  });

  if (error || !data.user) {
    fail(`Unable to confirm QA buyer auth user ${email}: ${error?.message || "unknown error"}`);
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      id: data.user.id,
      email,
      role: "buyer",
      full_name: String(data.user.user_metadata?.full_name || "Buyer Onboarding QA"),
      onboarding_started_at: now,
      onboarding_completed_at: null,
      onboarding_step: "basics",
      onboarding_payload: {}
    },
    { onConflict: "id" }
  );

  if (profileError) {
    fail(`Unable to upsert user_profiles for ${email}: ${profileError.message}`);
  }

  return data.user.id;
}

async function ensureServerIsReachable() {
  const response = await fetch(new URL("/login", baseUrl), { redirect: "manual" });
  if (!response.ok) {
    fail(`Local app is not reachable at ${baseUrl}. Start it with npm run dev before running this verifier.`);
  }
}

async function ensureSchemaIsReady() {
  const checks = await Promise.all([
    supabase.from("user_profiles").select("id").limit(1),
    supabase.from("buyer_profiles").select("id").limit(1)
  ]);

  const errors = checks.map((result) => result.error).filter(Boolean);
  if (errors.length > 0) {
    fail(`Supabase schema is not ready for buyer onboarding verification: ${errors.map((error) => error.message).join(" | ")}`);
  }
}

async function selectUserProfile(userId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, role, full_name, onboarding_step, onboarding_payload, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    fail(`Unable to read user_profiles for ${userId}: ${error.message}`);
  }

  return data;
}

async function selectBuyerProfile(userId) {
  const { data, error } = await supabase
    .from("buyer_profiles")
    .select("user_id, company_name, buyer_type, industry_type, billing_email, music_preferences")
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    fail(`Unable to read buyer_profiles for ${userId}: ${error.message}`);
  }

  return data;
}

async function findAuthUserByEmail(email) {
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
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

async function request(cookieJar, route) {
  const response = await fetch(new URL(route, baseUrl), {
    headers: cookieJar.toHeaders(),
    redirect: "manual"
  });
  cookieJar.capture(response);

  return {
    status: response.status,
    location: response.headers.get("location"),
    body: await response.text()
  };
}

function assertRedirectResponse(response, expectedLocationIncludes, message) {
  if ([303, 307].includes(response.status)) {
    assert.ok(
      (response.location || "").includes(expectedLocationIncludes),
      `${message}, got ${response.location || "<none>"}`
    );
    return;
  }

  const redirectMarker = `NEXT_REDIRECT;replace;${expectedLocationIncludes};307;`;
  assert.ok(
    response.status === 200 && response.body.includes(redirectMarker),
    `${message}, got status ${response.status} with ${response.location || "<none>"}`
  );
}

async function submitForm(cookieJar, route, formHtml, overrides) {
  const formData = new FormData();

  for (const input of extractInputs(formHtml)) {
    if (input.type === "hidden") {
      formData.set(input.name, input.value);
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    formData.delete(key);
    if (Array.isArray(value)) {
      for (const entry of value) {
        formData.append(key, entry);
      }
    } else {
      formData.set(key, String(value));
    }
  }

  const response = await fetch(new URL(route, baseUrl), {
    method: "POST",
    body: formData,
    headers: cookieJar.toHeaders(),
    redirect: "manual"
  });

  cookieJar.capture(response);

  return {
    status: response.status,
    location: response.headers.get("location"),
    body: await response.text()
  };
}

function extractForm(html, marker) {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) || [];
  const match = forms.find((form) => form.includes(marker));
  if (!match) {
    fs.writeFileSync("/tmp/sync-buyer-onboarding-debug.html", html);
    const preview = html.replace(/\s+/g, " ").slice(0, 1200);
    fail(`Unable to find form marker ${marker}. Wrote full page to /tmp/sync-buyer-onboarding-debug.html. Page preview: ${preview}`);
  }
  return match;
}

function extractInputs(formHtml) {
  const matches = formHtml.matchAll(/<input\b([^>]+)>/gi);
  const inputs = [];

  for (const match of matches) {
    const attributes = match[1];
    const name = readAttribute(attributes, "name");
    if (!name) {
      continue;
    }

    inputs.push({
      type: readAttribute(attributes, "type") || "text",
      name,
      value: decodeHtml(readAttribute(attributes, "value") || "")
    });
  }

  return inputs;
}

function readAttribute(attributes, attributeName) {
  const match = attributes.match(new RegExp(`${attributeName}="([^"]*)"`, "i"));
  return match ? match[1] : null;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  capture(response) {
    const setCookies =
      typeof response.headers.getSetCookie === "function"
        ? response.headers.getSetCookie()
        : splitSetCookieHeader(response.headers.get("set-cookie"));

    for (const cookie of setCookies) {
      const firstPart = cookie.split(";")[0];
      const separatorIndex = firstPart.indexOf("=");
      if (separatorIndex === -1) {
        continue;
      }

      const name = firstPart.slice(0, separatorIndex);
      const value = firstPart.slice(separatorIndex + 1);
      this.cookies.set(name, value);
    }
  }

  toHeaders() {
    if (this.cookies.size === 0) {
      return {};
    }

    return {
      cookie: Array.from(this.cookies.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    };
  }
}

function splitSetCookieHeader(headerValue) {
  if (!headerValue) {
    return [];
  }

  return headerValue.split(/,(?=[^;]+=[^;]+)/g);
}

await main();
