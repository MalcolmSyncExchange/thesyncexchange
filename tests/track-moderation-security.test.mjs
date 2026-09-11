import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migrationSql = readFileSync(
  new URL("../supabase/migrations/0018_lock_down_track_moderation_fields.sql", import.meta.url),
  "utf8"
);
const artistActionsSource = readFileSync(new URL("../services/tracks/actions.ts", import.meta.url), "utf8");
const adminActionsSource = readFileSync(new URL("../services/admin/actions.ts", import.meta.url), "utf8");
const adminReviewActionsSource = readFileSync(new URL("../components/admin/track-review-actions.tsx", import.meta.url), "utf8");
const buyerQueriesSource = readFileSync(new URL("../services/buyer/queries.ts", import.meta.url), "utf8");

const updatePolicyWithCheck = migrationSql.match(
  /drop policy if exists "Artists and admins can update owned tracks"[\s\S]*?with check \(([\s\S]*?)\n\);/
)?.[1] || "";

test("track moderation migration keeps artists from creating approved tracks", () => {
  assert.match(migrationSql, /for insert\s+to authenticated\s+with check/s);
  assert.match(migrationSql, /status in \('draft', 'pending_review'\)/);
  assert.doesNotMatch(migrationSql, /status in \('draft', 'pending_review', 'approved'\)/);
  assert.match(migrationSql, /Artists may only create drafts or submit tracks for review/);
});

test("track moderation migration blocks artist updates to approved status", () => {
  assert.match(migrationSql, /for update\s+to authenticated/s);
  assert.match(migrationSql, /new\.status not in \('draft', 'pending_review', 'archived'\)/);
  assert.match(migrationSql, /if old\.status = 'approved' then/);
  assert.match(migrationSql, /if new\.status <> 'archived' then/);
  assert.match(migrationSql, /Approved tracks may only be archived by artists/);
  assert.match(migrationSql, /Artists may only save drafts, submit for review, or archive their own tracks/);
});

test("track moderation migration blocks featured and approval field manipulation", () => {
  assert.match(migrationSql, /and featured = false/);
  assert.match(migrationSql, /and approved_at is null/);
  assert.match(migrationSql, /and approved_by is null/);
  assert.match(migrationSql, /new\.approved_at is distinct from old\.approved_at/);
  assert.match(migrationSql, /new\.approved_by is distinct from old\.approved_by/);
  assert.match(migrationSql, /new\.featured is distinct from old\.featured/);
});

test("track moderation update policy allows ownership checks without erasing historical moderation metadata", () => {
  assert.match(updatePolicyWithCheck, /public\.is_admin\(\)/);
  assert.match(updatePolicyWithCheck, /auth\.uid\(\) = artist_user_id/);
  assert.doesNotMatch(updatePolicyWithCheck, /featured = false/);
  assert.doesNotMatch(updatePolicyWithCheck, /approved_at is null/);
  assert.doesNotMatch(updatePolicyWithCheck, /approved_by is null/);
});

test("track moderation migration blocks artist ownership transfer", () => {
  assert.match(migrationSql, /if new\.artist_user_id is distinct from old\.artist_user_id then/);
  assert.match(migrationSql, /Track ownership cannot be changed by artists/);
  assert.match(migrationSql, /auth\.uid\(\) = artist_user_id/);
});

test("track moderation migration trusts explicit service_role execution and verified admins", () => {
  assert.match(migrationSql, /if auth\.role\(\) = 'service_role' or public\.is_admin\(\) then/);
  assert.match(migrationSql, /new\.approved_at = coalesce\(new\.approved_at, now\(\)\)/);
  assert.match(migrationSql, /new\.approved_by = coalesce\(new\.approved_by, auth\.uid\(\)\)/);
  assert.match(migrationSql, /Approved tracks must have rights holder ownership totals equal to 100%%/);
});

test("track moderation migration does not trust null auth uid or anonymous callers", () => {
  assert.doesNotMatch(migrationSql, /auth\.uid\(\) is null/);
  assert.doesNotMatch(migrationSql, /to anon/);
  assert.match(migrationSql, /for insert\s+to authenticated/s);
  assert.match(migrationSql, /for update\s+to authenticated/s);
});

test("artist submission actions only emit draft or pending_review statuses", () => {
  assert.match(artistActionsSource, /const status = parsed\.saveMode === "publish" \? "pending_review" : "draft"/);
  assert.match(artistActionsSource, /featured: false/);
  assert.doesNotMatch(artistActionsSource, /approved_at:/);
  assert.doesNotMatch(artistActionsSource, /approved_by:/);
});

test("artist update actions whitelist metadata and preserve ownership control", () => {
  assert.match(artistActionsSource, /existingTrack\.artist_user_id !== user\.id/);
  assert.match(artistActionsSource, /const updatedTrackValues = \{/);
  assert.doesNotMatch(artistActionsSource, /artist_user_id: parsed/);
  assert.doesNotMatch(artistActionsSource, /featured: parsed/);
  assert.doesNotMatch(artistActionsSource, /approved_at: parsed/);
  assert.doesNotMatch(artistActionsSource, /approved_by: parsed/);
});

test("admin actions remain the only app path for approval, rejection, and featured state", () => {
  assert.match(adminActionsSource, /requireAdminActorId\(\)/);
  assert.match(adminActionsSource, /status: status as Database\["public"\]\["Enums"\]\["track_status"\]/);
  assert.match(adminActionsSource, /approved_at: status === "approved" \? new Date\(\)\.toISOString\(\) : null/);
  assert.match(adminActionsSource, /approved_by: status === "approved" \? actorId : null/);
  assert.match(adminActionsSource, /update\(\{ featured \}\)/);
  assert.match(adminReviewActionsSource, /name="status" value="approved"/);
  assert.match(adminReviewActionsSource, /name="status" value="rejected"/);
});

test("buyer catalog remains restricted to legitimately approved tracks", () => {
  assert.match(buyerQueriesSource, /\.eq\("status", "approved"\)/);
  assert.match(buyerQueriesSource, /demoTracks\.filter\(\(track\) => track\.status === "approved"\)/);
  assert.doesNotMatch(buyerQueriesSource, /\.eq\("status", "pending_review"\)/);
  assert.doesNotMatch(buyerQueriesSource, /\.eq\("status", "draft"\)/);
  assert.doesNotMatch(buyerQueriesSource, /\.eq\("status", "rejected"\)/);
  assert.doesNotMatch(buyerQueriesSource, /\.eq\("status", "archived"\)/);
});
