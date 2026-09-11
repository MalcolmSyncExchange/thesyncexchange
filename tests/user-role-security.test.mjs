import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL("../supabase/migrations/0019_lock_down_user_profile_roles.sql", import.meta.url),
  "utf8"
);
const authActionsSource = readFileSync(new URL("../services/auth/actions.ts", import.meta.url), "utf8");
const sessionSource = readFileSync(new URL("../services/auth/session.ts", import.meta.url), "utf8");
const adminActionsSource = readFileSync(new URL("../services/admin/actions.ts", import.meta.url), "utf8");
const buyerSettingsSource = readFileSync(new URL("../services/buyer/settings.ts", import.meta.url), "utf8");
const buyerActionsSource = readFileSync(new URL("../services/buyer/actions.ts", import.meta.url), "utf8");
const buyerQueriesSource = readFileSync(new URL("../services/buyer/queries.ts", import.meta.url), "utf8");
const tracksActionsSource = readFileSync(new URL("../services/tracks/actions.ts", import.meta.url), "utf8");
const uploadUrlRouteSource = readFileSync(new URL("../app/api/storage/upload-url/route.ts", import.meta.url), "utf8");
const uploadRouteSource = readFileSync(new URL("../app/api/storage/upload/route.ts", import.meta.url), "utf8");
const deleteRouteSource = readFileSync(new URL("../app/api/storage/delete/route.ts", import.meta.url), "utf8");
const agreementRouteSource = readFileSync(new URL("../app/api/orders/[orderId]/agreement/route.ts", import.meta.url), "utf8");
const signupRoleFunction = authActionsSource.match(/function parseSignupRole[\s\S]*?\n}/)?.[0] || "";

const hardenedAuthorizationSources = [
  sessionSource,
  adminActionsSource,
  buyerSettingsSource,
  buyerActionsSource,
  buyerQueriesSource,
  tracksActionsSource,
  uploadUrlRouteSource,
  uploadRouteSource,
  deleteRouteSource,
  agreementRouteSource
].join("\n\n");

test("user profile role guard trusts only service role execution or verified admins", () => {
  assert.match(migrationSql, /if auth\.role\(\) = 'service_role' or public\.is_admin\(\) then/);
  assert.doesNotMatch(migrationSql, /auth\.uid\(\) is null\s+or\s+public\.is_admin\(\)/i);
  assert.doesNotMatch(migrationSql, /if auth\.uid\(\) is null\s+or/i);
});

test("direct authenticated profile inserts cannot assign application roles", () => {
  assert.match(migrationSql, /if tg_op = 'INSERT' and new\.role is not null then/);
  assert.match(migrationSql, /Role assignment is managed by trusted server workflows only/);
  assert.doesNotMatch(migrationSql, /new\.role not in \('artist', 'buyer'\)/);
});

test("direct authenticated profile updates cannot change application role", () => {
  assert.match(migrationSql, /if tg_op = 'UPDATE' and new\.role is distinct from old\.role then/);
  assert.match(migrationSql, /Role changes are managed by trusted server workflows only/);
});

test("normal authenticated profile ownership remains available for non-role fields", () => {
  assert.match(migrationSql, /if new\.id <> auth\.uid\(\) then/);
  assert.match(migrationSql, /return new;/);
  assert.doesNotMatch(migrationSql, /full_name is distinct from old\.full_name/);
  assert.doesNotMatch(migrationSql, /avatar_path is distinct from old\.avatar_path/);
});

test("signup and onboarding role assignment require trusted server role writes", () => {
  assert.match(authActionsSource, /function parseSignupRole\(rawRole: unknown\): "artist" \| "buyer" \| null/);
  assert.doesNotMatch(signupRoleFunction, /admin/);
  assert.match(authActionsSource, /function getTrustedRoleMutationClient\(\)/);
  assert.match(authActionsSource, /Trusted profile role assignment is unavailable/);
  assert.match(authActionsSource, /const client = getTrustedRoleMutationClient\(\);/);
  assert.match(authActionsSource, /const role = await resolvePersistedRole\(authUser\.id\);/);
  assert.doesNotMatch(authActionsSource, /resolvePersistedRole\(authUser\.id,\s*parseRole\(authUser\.user_metadata\?\.role\)\)/);
});

test("session role resolution is database backed and ignores mutable user metadata roles", () => {
  assert.match(sessionSource, /const role = resolveUserRole\(userRow\?\.role\) \|\| detectPersistedRole/);
  assert.doesNotMatch(sessionSource, /resolveUserRole\(user\.user_metadata\?\.role\)/);
  assert.doesNotMatch(sessionSource, /fallbackRole/);
});

test("privileged authorization does not use user_metadata or app_metadata role fallbacks", () => {
  assert.doesNotMatch(hardenedAuthorizationSources, /user_metadata\?\.role/);
  assert.doesNotMatch(hardenedAuthorizationSources, /user_metadata\.role/);
  assert.doesNotMatch(hardenedAuthorizationSources, /app_metadata\?\.role/);
  assert.doesNotMatch(hardenedAuthorizationSources, /app_metadata\.role/);
});

test("database persisted role remains the authorization source for admin artist and buyer checks", () => {
  assert.match(adminActionsSource, /const role = String\(profile\.data\?\.role \|\| ""\)/);
  assert.match(buyerSettingsSource, /const role = String\(persistedRole \|\| ""\)/);
  assert.match(tracksActionsSource, /const roleFromDatabase = await resolveArtistRole\(user\.id\)/);
  assert.match(uploadUrlRouteSource, /const role = profile\?\.role;/);
  assert.match(uploadRouteSource, /const role = profile\?\.role;/);
  assert.match(deleteRouteSource, /const isAdmin = profile\?\.role === "admin";/);
  assert.match(agreementRouteSource, /const role = String\(viewerProfile\?\.role \|\| ""\)/);
  assert.match(buyerActionsSource, /const role = persistedProfile\?\.role;/);
  assert.match(buyerQueriesSource, /const viewerRole = viewerProfile\?\.role;/);
});
