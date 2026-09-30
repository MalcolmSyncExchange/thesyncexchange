import test from "node:test";
import assert from "node:assert/strict";

import { reconcileAppUserProfile } from "../services/auth/reconcile-app-user.mjs";

function harness(initial = []) {
  const rows = new Map(initial.map((row) => [row.id, structuredClone(row)]));
  const writes = [];
  const getClient = async () => ({
    from(table) {
      assert.equal(table, "user_profiles");
      return {
        insert: async (row) => {
          writes.push({ operation: "insert", row });
          if (rows.has(row.id)) return { error: { code: "23505" } };
          rows.set(row.id, structuredClone(row));
          return { error: null };
        },
        update: (patch) => ({
          eq: (_column, id) => ({
            is: async (_column2, value) => {
              writes.push({ operation: "update", patch });
              const row = rows.get(id);
              if (row?.role === value) Object.assign(row, patch);
              return { error: null };
            }
          })
        })
      };
    }
  });
  const lookup = async (id) => ({ data: structuredClone(rows.get(id) || null), error: null });
  return { rows, writes, getClient, lookup };
}

const identity = (id, role = "buyer") => ({ id, email: `${id}@fixture.invalid`, role, fullName: "Changed name" });

test("completed buyer, artist, and admin login preserves every existing profile field", async () => {
  const profiles = ["buyer", "artist", "admin"].map((role) => ({
    id: role,
    role,
    email: `${role}@fixture.invalid`,
    full_name: `${role} original`,
    onboarding_started_at: "2026-01-01T00:00:00Z",
    onboarding_completed_at: "2026-02-01T00:00:00Z",
    onboarding_step: "complete",
    onboarding_payload: { payoutEmail: "preserved", preference: "preserved" },
    avatar_path: "preserved/avatar.png"
  }));
  const h = harness(profiles);
  for (const row of profiles) await reconcileAppUserProfile({ user: identity(row.id, row.role), ...h });
  assert.deepEqual([...h.rows.values()], profiles);
  assert.equal(h.writes.length, 0);
});

test("partially completed user login and repeat login are idempotent", async () => {
  const partial = { id: "partial", role: "artist", onboarding_started_at: "2026-01-01", onboarding_completed_at: null, onboarding_step: "licensing", onboarding_payload: { step: 3 }, payout_email: "preserved" };
  const h = harness([partial]);
  await reconcileAppUserProfile({ user: identity("partial", "artist"), ...h });
  await reconcileAppUserProfile({ user: identity("partial", "artist"), ...h });
  assert.deepEqual(h.rows.get("partial"), partial);
  assert.equal(h.writes.length, 0);
});

test("new user initialization inserts explicit signup values and login does not clear them", async () => {
  const h = harness();
  await reconcileAppUserProfile({ user: { ...identity("new", "buyer"), onboardingStartedAt: "2026-01-01", onboardingStep: "basics", onboardingData: { topic: "sync", payoutEmail: "excluded" } }, ...h });
  const created = structuredClone(h.rows.get("new"));
  assert.equal(created.onboarding_started_at, "2026-01-01");
  assert.equal(created.onboarding_step, "basics");
  assert.deepEqual(created.onboarding_payload, { topic: "sync" });
  await reconcileAppUserProfile({ user: identity("new", "buyer"), ...h });
  assert.deepEqual(h.rows.get("new"), created);
  assert.deepEqual(h.writes.map((entry) => entry.operation), ["insert"]);
});

test("missing role can be filled without changing onboarding values", async () => {
  const original = { id: "role-null", role: null, onboarding_completed_at: "2026-01-01", onboarding_payload: { keep: true } };
  const h = harness([original]);
  await reconcileAppUserProfile({ user: identity("role-null", "artist"), ...h });
  assert.deepEqual(h.rows.get("role-null"), { ...original, role: "artist" });
  assert.deepEqual(h.writes, [{ operation: "update", patch: { role: "artist" } }]);
});

test("five completed markers remain five after five logins", async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({ id: `user${index}`, role: "buyer", onboarding_completed_at: "2026-01-01" }));
  const h = harness(rows);
  for (const row of rows) await reconcileAppUserProfile({ user: identity(row.id), ...h });
  assert.equal([...h.rows.values()].filter((row) => row.onboarding_completed_at).length, 5);
  assert.equal(h.writes.length, 0);
});

test("lookup errors fail closed rather than inserting a replacement profile", async () => {
  const h = harness();
  await assert.rejects(reconcileAppUserProfile({ user: identity("blocked"), lookup: async () => ({ data: null, error: Error("read failed") }), getClient: h.getClient }), /read failed/);
  assert.equal(h.writes.length, 0);
});
