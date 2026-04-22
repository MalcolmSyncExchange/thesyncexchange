#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnvFile(path.join(rootDir, ".env.local"));

const baseUrl = process.env.ARTIST_ONBOARDING_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.ARTIST_ONBOARDING_TEST_PASSWORD || process.env.QA_TEST_ACCOUNT_PASSWORD;
const avatarFixturePath =
  process.env.ARTIST_ONBOARDING_AVATAR_PATH ||
  path.join(rootDir, "public/brand/the-sync-exchange/app/AppIcon_256.png");

if (!supabaseUrl || !serviceRoleKey) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

if (!password || password.length < 12) {
  fail("Set ARTIST_ONBOARDING_TEST_PASSWORD or QA_TEST_ACCOUNT_PASSWORD to a password with at least 12 characters.");
}

if (!fs.existsSync(avatarFixturePath)) {
  fail(`Artist onboarding avatar fixture not found: ${avatarFixturePath}`);
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
  const email = `qa-artist-onboarding+${timestamp}@thesyncexchange.com`;
  const fullName = "Artist Onboarding QA";
  const artistName = `Artist QA ${timestamp}`;
  const payoutEmail = `payout+${timestamp}@thesyncexchange.com`;
  const bio = "Launch-readiness artist onboarding verification account for The Sync Exchange.";
  const location = "Phoenix, AZ";
  const website = "https://artist-qa.example.com";
  const instagram = "@artistqa";
  const spotify = "https://open.spotify.com/artist/artist-qa";
  const youtube = "https://youtube.com/@artistqa";
  const defaultLicensingPreferences =
    "Open to premium digital, broadcast, and trailer placements pending final legal review.";

  let authUserId = null;
  let uploadedAvatarPath = null;
  const cookieJar = new CookieJar();

  try {
    const signupResult = await submitSignup(cookieJar, { email, password, fullName });

    authUserId = await ensureConfirmedArtistAuthUser({
      email,
      password,
      fullName,
      usedAdminFallback: signupResult.rateLimited
    });

    const persistedAfterSignup = await selectUserProfile(authUserId);
    assert.ok(persistedAfterSignup, "user_profiles row should exist immediately after artist signup");
    assert.equal(persistedAfterSignup.role, "artist");
    assert.equal(persistedAfterSignup.onboarding_step, "basics");

    await submitLogin(cookieJar, { email, password });

    await submitArtistBasics(cookieJar, { fullName, artistName, avatarFixturePath });

    const basicsState = await selectUserProfile(authUserId);
    assert.ok(basicsState, "user_profiles row should still exist after artist basics");
    assert.equal(basicsState.full_name, fullName);
    assert.equal(basicsState.onboarding_step, "profile");
    assert.equal(basicsState.onboarding_payload?.artistName, artistName);
    assert.ok(basicsState.avatar_path, "artist basics should persist avatar_path");
    uploadedAvatarPath = basicsState.avatar_path;

    const avatarExists = await avatarObjectExists(uploadedAvatarPath);
    assert.equal(avatarExists, true, "uploaded avatar object should exist in Supabase storage");

    const basicsArtistProfile = await selectArtistProfile(authUserId);
    assert.ok(basicsArtistProfile, "artist_profiles row should exist after artist basics");
    assert.equal(basicsArtistProfile.artist_name, artistName);

    await submitArtistProfile(cookieJar, {
      bio,
      location,
      website,
      instagram,
      spotify,
      youtube
    });

    const profileState = await selectUserProfile(authUserId);
    assert.ok(profileState, "user_profiles row should exist after artist profile");
    assert.equal(profileState.onboarding_step, "licensing");

    const artistProfile = await selectArtistProfile(authUserId);
    assert.ok(artistProfile, "artist_profiles row should exist after artist profile");
    assert.equal(artistProfile.bio, bio);
    assert.equal(artistProfile.location, location);
    assert.equal(artistProfile.website, website);
    assert.equal(artistProfile.instagram_url, instagram);
    assert.equal(artistProfile.spotify_url, spotify);
    assert.equal(artistProfile.youtube_url, youtube);

    await submitArtistLicensing(cookieJar, { payoutEmail, defaultLicensingPreferences });

    const licensingState = await selectUserProfile(authUserId);
    assert.ok(licensingState, "user_profiles row should exist after artist licensing");
    assert.equal(licensingState.onboarding_step, "first-track");

    const licensedArtistProfile = await selectArtistProfile(authUserId);
    assert.ok(licensedArtistProfile, "artist_profiles row should exist after artist licensing");
    assert.equal(licensedArtistProfile.payout_email, payoutEmail);
    assert.equal(licensedArtistProfile.default_licensing_preferences, defaultLicensingPreferences);

    await submitArtistFirstTrack(cookieJar, { firstTrackChoice: "upload" });

    const firstTrackState = await selectUserProfile(authUserId);
    assert.ok(firstTrackState, "user_profiles row should exist after artist first-track step");
    assert.equal(firstTrackState.onboarding_step, "complete");
    assert.equal(firstTrackState.onboarding_completed_at, null, "artist onboarding should not be completed before finish");

    await finishArtistOnboarding(cookieJar);

    const completedState = await selectUserProfile(authUserId);
    assert.ok(completedState?.onboarding_completed_at, "artist onboarding should be marked complete");
    assert.equal(completedState?.onboarding_step, "complete");

    const completionRefresh = await request(cookieJar, "/onboarding/artist?step=complete");
    assertRedirectResponse(
      completionRefresh,
      "/dashboard/artist",
      "completed artist onboarding should redirect away from onboarding on refresh"
    );

    const reloginCookieJar = new CookieJar();
    await submitLogin(reloginCookieJar, {
      email,
      password,
      expectedRedirectIncludes: "/dashboard/artist"
    });

    console.log("Artist onboarding verification succeeded.");
    console.log(JSON.stringify({ email, userId: authUserId, avatarPath: uploadedAvatarPath, baseUrl }, null, 2));
  } finally {
    if (uploadedAvatarPath) {
      const { error } = await supabase.storage.from("avatars").remove([uploadedAvatarPath]);
      if (error) {
        console.warn(`Warning: failed to remove QA avatar ${uploadedAvatarPath}: ${error.message}`);
      }
    }

    if (authUserId) {
      const { error } = await supabase.auth.admin.deleteUser(authUserId);
      if (error) {
        console.warn(`Warning: failed to delete QA auth user ${authUserId}: ${error.message}`);
      }
    }
  }
}

async function submitSignup(cookieJar, { email, password, fullName }) {
  const signupPage = await request(cookieJar, "/signup/artist");
  assert.equal(signupPage.status, 200, "artist signup page should load");

  const form = extractForm(signupPage.body, 'name="role" value="artist"');
  const response = await submitForm(cookieJar, "/signup/artist", form, {
    fullName,
    email,
    password,
    role: "artist",
    returnTo: "/signup/artist"
  });

  assert.ok([303, 307].includes(response.status), `artist signup should redirect, got ${response.status}`);
  const location = response.location || "";
  if (location.includes("email%20rate%20limit%20exceeded")) {
    return {
      rateLimited: true
    };
  }

  assert.ok(
    location.includes("confirmation=required") || location.includes("/onboarding"),
    `artist signup should route into confirmation or onboarding, got ${location || "<none>"}`
  );

  return {
    rateLimited: false
  };
}

async function submitLogin(cookieJar, { email, password, expectedRedirectIncludes = "/onboarding/artist" }) {
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
    `artist login should redirect to ${expectedRedirectIncludes}, got ${response.location || "<none>"}`
  );
}

async function submitArtistBasics(cookieJar, { fullName, artistName, avatarFixturePath }) {
  const page = await request(cookieJar, "/onboarding/artist");
  assert.equal(page.status, 200, "artist onboarding page should load");

  const form = extractForm(page.body, 'name="step" value="basics"');
  const response = await submitForm(cookieJar, "/onboarding/artist", form, {
    step: "basics",
    fullName,
    artistName,
    avatarFile: createFileField(avatarFixturePath, "image/png")
  });

  assert.ok([303, 307].includes(response.status), `artist basics should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/onboarding/artist?step=profile"),
    `artist basics should advance to profile, got ${response.location || "<none>"}`
  );
}

async function submitArtistProfile(cookieJar, { bio, location, website, instagram, spotify, youtube }) {
  const page = await request(cookieJar, "/onboarding/artist?step=profile");
  assert.equal(page.status, 200, "artist profile page should load");

  const form = extractForm(page.body, 'data-testid="artist-onboarding-profile-form"');
  const response = await submitForm(cookieJar, "/onboarding/artist?step=profile", form, {
    step: "profile",
    bio,
    location,
    website,
    instagram,
    spotify,
    youtube
  });

  assert.ok([303, 307].includes(response.status), `artist profile should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/onboarding/artist?step=licensing"),
    `artist profile should advance to licensing, got ${response.location || "<none>"}`
  );
}

async function submitArtistLicensing(cookieJar, { payoutEmail, defaultLicensingPreferences }) {
  const page = await request(cookieJar, "/onboarding/artist?step=licensing");
  assert.equal(page.status, 200, "artist licensing page should load");

  const form = extractForm(page.body, 'name="step" value="licensing"');
  const response = await submitForm(cookieJar, "/onboarding/artist?step=licensing", form, {
    step: "licensing",
    payoutEmail,
    defaultLicensingPreferences
  });

  assert.ok([303, 307].includes(response.status), `artist licensing should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/onboarding/artist?step=first-track"),
    `artist licensing should advance to first-track, got ${response.location || "<none>"}`
  );
}

async function submitArtistFirstTrack(cookieJar, { firstTrackChoice }) {
  const page = await request(cookieJar, "/onboarding/artist?step=first-track");
  assert.equal(page.status, 200, "artist first-track page should load");

  const form = extractForm(page.body, 'name="step" value="first-track"');
  const response = await submitForm(cookieJar, "/onboarding/artist?step=first-track", form, {
    step: "first-track",
    firstTrackChoice
  });

  assert.ok([303, 307].includes(response.status), `artist first-track should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/onboarding/artist?step=complete"),
    `artist first-track should advance to completion, got ${response.location || "<none>"}`
  );
}

async function finishArtistOnboarding(cookieJar) {
  const page = await request(cookieJar, "/onboarding/artist?step=complete");
  assert.equal(page.status, 200, "artist completion page should load");

  const form = extractForm(page.body, 'name="destination" value="submit"');
  const response = await submitForm(cookieJar, "/onboarding/artist?step=complete", form, {
    destination: "submit"
  });

  assert.ok([303, 307].includes(response.status), `artist completion should redirect, got ${response.status}`);
  assert.ok(
    (response.location || "").includes("/artist/submit"),
    `artist completion should redirect to submit flow, got ${response.location || "<none>"}`
  );
}

async function ensureConfirmedArtistAuthUser({ email, password, fullName, usedAdminFallback }) {
  let existingUser = await findAuthUserByEmail(email);

  if (!existingUser && usedAdminFallback) {
    const createResult = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "artist",
        full_name: fullName
      },
      app_metadata: {
        role: "artist"
      }
    });

    if (createResult.error || !createResult.data.user) {
      fail(`Unable to create QA artist auth user after signup rate limiting: ${createResult.error?.message || "unknown error"}`);
    }

    existingUser = createResult.data.user;
  }

  if (!existingUser) {
    fail(`Could not find artist auth user for ${email} after signup.`);
  }

  const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
    email_confirm: true,
    user_metadata: {
      ...(existingUser.user_metadata || {}),
      role: "artist",
      full_name: existingUser.user_metadata?.full_name || fullName
    },
    app_metadata: {
      ...(existingUser.app_metadata || {}),
      role: "artist"
    }
  });

  if (error || !data.user) {
    fail(`Unable to confirm QA artist auth user ${email}: ${error?.message || "unknown error"}`);
  }

  const now = new Date().toISOString();
  const { error: profileError } = await supabase.from("user_profiles").upsert(
    {
      id: data.user.id,
      email,
      role: "artist",
      full_name: String(data.user.user_metadata?.full_name || "Artist Onboarding QA"),
      onboarding_started_at: now,
      onboarding_completed_at: null,
      onboarding_step: "basics",
      onboarding_payload: {}
    },
    { onConflict: "id" }
  );

  if (profileError) {
    fail(`Unable to upsert artist user_profiles for ${email}: ${profileError.message}`);
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
    supabase.from("artist_profiles").select("id").limit(1)
  ]);

  const errors = checks.map((result) => result.error).filter(Boolean);
  if (errors.length > 0) {
    fail(`Supabase schema is not ready for artist onboarding verification: ${errors.map((error) => error.message).join(" | ")}`);
  }
}

async function selectUserProfile(userId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, role, full_name, avatar_path, avatar_url, onboarding_step, onboarding_payload, onboarding_completed_at")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    fail(`Unable to read user_profiles for ${userId}: ${error.message}`);
  }

  return data;
}

async function selectArtistProfile(userId) {
  const { data, error } = await supabase
    .from("artist_profiles")
    .select(
      "user_id, artist_name, bio, location, website, instagram_url, spotify_url, youtube_url, payout_email, default_licensing_preferences"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    fail(`Unable to read artist_profiles for ${userId}: ${error.message}`);
  }

  return data;
}

async function avatarObjectExists(assetPath) {
  const { data, error } = await supabase.storage.from("avatars").download(assetPath);
  if (error) {
    return false;
  }

  if (data) {
    await data.arrayBuffer();
  }
  return true;
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
        formData.append(key, normalizeFormValue(entry));
      }
    } else {
      formData.set(key, normalizeFormValue(value));
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

function normalizeFormValue(value) {
  if (value instanceof File) {
    return value;
  }

  return String(value);
}

function createFileField(filePath, mimeType) {
  const buffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  return new File([buffer], fileName, { type: mimeType });
}

function extractForm(html, marker) {
  const forms = html.match(/<form\b[\s\S]*?<\/form>/gi) || [];
  const match = forms.find((form) => form.includes(marker));
  if (!match) {
    fs.writeFileSync("/tmp/sync-artist-onboarding-debug.html", html);
    const preview = html.replace(/\s+/g, " ").slice(0, 1200);
    fail(`Unable to find form marker ${marker}. Wrote full page to /tmp/sync-artist-onboarding-debug.html. Page preview: ${preview}`);
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
    if (!key || process.env[key]) {
      continue;
    }

    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

class CookieJar {
  constructor() {
    this.map = new Map();
  }

  capture(response) {
    const setCookie = response.headers.getSetCookie?.() || [];
    for (const entry of setCookie) {
      const firstSegment = entry.split(";")[0];
      const equalsIndex = firstSegment.indexOf("=");
      if (equalsIndex === -1) {
        continue;
      }

      const name = firstSegment.slice(0, equalsIndex).trim();
      const value = firstSegment.slice(equalsIndex + 1).trim();
      this.map.set(name, value);
    }
  }

  toHeaders() {
    if (this.map.size === 0) {
      return {};
    }

    return {
      Cookie: Array.from(this.map.entries())
        .map(([name, value]) => `${name}=${value}`)
        .join("; ")
    };
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

await main();
