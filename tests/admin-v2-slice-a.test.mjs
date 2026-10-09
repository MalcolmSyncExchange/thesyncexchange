import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { buildAdminOperationsSnapshot } from "../lib/admin-v2/operations.ts";

const base = {
  checkedAt: "2026-10-09T12:00:00.000Z",
  counts: { users: 3, tracks: 0, pendingTracks: 0, orders: 0, openFlags: 0, orderExceptions: 0 },
  pendingTracks: [], openFlags: [], orderExceptions: []
};

test("zero-data Overview and Action Center show an authoritative clear state", () => {
  const snapshot = buildAdminOperationsSnapshot(base);
  assert.equal(snapshot.attentionIsClear, true);
  assert.equal(snapshot.hasAnyUnavailableSource, false);
  assert.deepEqual(snapshot.items, []);
  assert.equal(snapshot.counts.users, 3);
  assert.equal(snapshot.counts.tracks, 0);
});

test("failed or missing source is unavailable, never a zero or an all-clear", () => {
  const snapshot = buildAdminOperationsSnapshot({
    ...base,
    counts: { ...base.counts, orders: null, orderExceptions: null },
    orderExceptions: null
  });
  assert.equal(snapshot.attentionIsClear, false);
  assert.equal(snapshot.hasAnyUnavailableSource, true);
  assert.equal(snapshot.allAttentionSourcesAvailable, false);
  assert.equal(snapshot.counts.orders, null);
});

test("partial source failure keeps known items without claiming completeness", () => {
  const snapshot = buildAdminOperationsSnapshot({
    ...base,
    openFlags: null,
    pendingTracks: [{ id: "track-a", title: "  Blue  Hour  ", created_at: "2026-10-01T00:00:00Z" }]
  });
  assert.equal(snapshot.items.length, 1);
  assert.equal(snapshot.items[0].title, "Blue Hour");
  assert.equal(snapshot.items[0].href, "/admin/tracks/track-a");
  assert.equal(snapshot.attentionIsClear, false);
});

test("attention items use only recorded track, flag and unresolved paid-order facts", () => {
  const snapshot = buildAdminOperationsSnapshot({
    ...base,
    pendingTracks: [{ id: "track-a", title: "Blue Hour", created_at: "2026-10-02T00:00:00Z" }],
    openFlags: [
      { id: "flag-1", track_id: "track-a", flag_type: "rights_review", severity: "critical", created_at: "2026-10-03T00:00:00Z", track_title: "Blue Hour" },
      { id: "flag-2", track_id: "track-b", flag_type: "metadata", severity: "high", created_at: "2026-10-04T00:00:00Z", track_title: null }
    ],
    orderExceptions: [
      { id: "order-current", status: "paid", created_at: "2026-10-05T00:00:00Z", agreement_generation_error: true, agreement_generated_at: null },
      { id: "order-resolved", status: "fulfilled", created_at: "2026-10-01T00:00:00Z", agreement_generation_error: true, agreement_generated_at: "2026-10-02T00:00:00Z" }
    ]
  });
  assert.deepEqual(snapshot.items.map((item) => item.priority), ["Critical", "Needs attention", "Needs attention", "Review"]);
  assert.equal(snapshot.items.some((item) => item.entityId === "order-resolved"), false);
  assert.equal(snapshot.items.find((item) => item.entityId === "order-current")?.href, "/admin/orders#order-order-current");
  assert.match(snapshot.items.find((item) => item.key === "flag:flag-1")?.reason ?? "", /Open rights review flag/);
  assert.equal(snapshot.items.every((item) => !("notes" in item || "buyer_user_id" in item || "provider_payload" in item)), true);
});

test("Admin route retains canonical role checks before privileged operations", () => {
  const layout = readFileSync(new URL("../app/(app)/admin/layout.tsx", import.meta.url), "utf8");
  const service = readFileSync(new URL("../services/admin/operations.ts", import.meta.url), "utf8");
  assert.match(layout, /requireSession\("admin"\)/);
  assert.match(service, /requireAccountScope\("admin"\)/);
  assert.ok(service.indexOf('requireAccountScope("admin")') < service.indexOf("createPrivilegedSupabaseClient()"));
  assert.doesNotMatch(service, /user_metadata\.role|app_metadata\.role/);
  assert.doesNotMatch(service, /select\("\*"\)/);
  assert.doesNotMatch(service, /last_webhook_error|buyer_user_id|amount_cents|notes/);
});

test("Artist, Buyer and anonymous requests cannot pass the existing Admin layout gate", () => {
  const session = readFileSync(new URL("../services/auth/session.ts", import.meta.url), "utf8");
  const authorization = readFileSync(new URL("../services/auth/authorization.ts", import.meta.url), "utf8");
  assert.match(session, /if \(!user\)\s*\{\s*redirect\("\/login"\)/);
  assert.match(session, /if \(role && user\.role !== role\)\s*\{\s*redirect/);
  assert.match(authorization, /profile\.data\?\.role !== role/);
});

test("frozen navigation maps to existing routes and future items are noninteractive", () => {
  const shell = readFileSync(new URL("../components/admin-v2/admin-shell.tsx", import.meta.url), "utf8");
  for (const path of ["/admin/dashboard", "/admin/action-center", "/admin/review-queue", "/admin/tracks", "/admin/users", "/admin/orders", "/admin/compliance", "/admin/analytics"]) {
    assert.ok(shell.includes(path), `${path} missing`);
  }
  assert.match(shell, /href \? \(/);
  assert.match(shell, /aria-current=.*page/);
  assert.match(shell, /aria-label=\{`\$\{label\}, planned`\}/);
  assert.match(shell, /aria-expanded=\{menuOpen\}/);
});
