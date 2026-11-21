import assert from "node:assert/strict";
import test from "node:test";

import { hasPrivilegedAssurance } from "../services/auth/security.ts";
import { asActor, database, ids } from "./helpers/artist-baseline-db.mjs";
import { loadAuthModule } from "./helpers/auth-system-harness.mjs";

const formFor = (status = "approved") => {
  const form = new FormData();
  form.set("trackId", ids.draft);
  form.set("status", status);
  return form;
};
const plain = (result) => JSON.parse(JSON.stringify(result));
const unavailable = { status: "unavailable", code: "TRACK_STATUS_UPDATE_FAILED" };

function fixture({ db, role = "admin", assurance = "aal2", active = true, capability = true,
  user = { id: ids.admin, factors: [{ status: "verified" }] }, write } = {}) {
  const audit = [];
  const paths = [];
  const logs = [];
  const calls = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user } }),
      mfa: { getAuthenticatorAssuranceLevel: async () => ({ data: { currentLevel: assurance } }) }
    },
    rpc: async (name, args) => {
      calls.push(name);
      if (name === "auth_session_is_active") return { data: active };
      assert.equal(name, "sec_has_capability");
      assert.equal(args.p_cap, "full_admin");
      return { data: capability };
    },
    from(table) {
      calls.push(table);
      if (table === "track_audit_log") return {
        insert: async (row) => {
          audit.push(plain(row));
          if (db) await asActor(db, ids.admin, () => db.query(
            "insert into track_audit_log(track_id,actor_id,action,metadata) values ($1,$2,$3,$4)",
            [row.track_id, row.actor_id, row.action, row.metadata]
          ));
        }
      };
      assert.equal(table, "tracks");
      return {
        update: (values) => ({
          eq: (column, id) => {
            assert.equal(column, "id");
            return {
              select: (projection) => {
                assert.equal(projection, "slug");
                return {
                  async maybeSingle() {
                    if (write) return write();
                    try {
                      const { rows } = await asActor(db, ids.admin, () => db.query(
                        "update tracks set status=$1, approved_at=$2, approved_by=$3 where id=$4 returning slug",
                        [values.status, values.approved_at, values.approved_by, id]
                      ));
                      return { data: rows[0] ?? null, error: null };
                    } catch ({ code, message }) {
                      return { data: null, error: { code, message } };
                    }
                  }
                };
              }
            };
          }
        })
      };
    }
  };
  const actions = loadAuthModule("services/admin/actions.ts", {
    "next/cache": { revalidatePath: (path) => paths.push(path) },
    "next/headers": {},
    "@/lib/env": { env: { demoMode: false }, hasSupabaseEnv: true },
    "@/lib/monitoring": { reportOperationalError: (...args) => logs.push(args) },
    "@/services/auth/security": { hasPrivilegedAssurance },
    "@/services/auth/user-profiles": { selectUserProfileCompat: async () => ({ data: { role } }) },
    "@/services/supabase/server": { createServerSupabaseClient: async () => client },
    "@/services/orders/payments": {},
    "@/lib/server-env": {},
    "@/lib/payment-mode.mjs": {},
    "@/services/agreements/server": {},
    "@/services/generated-licenses/server": {},
    "@/services/orders/activity": {},
    "@/services/supabase/schema-compat": {}
  });
  return { ...actions, calls, audit, paths, logs };
}

test("database ownership guard rejects 0%, 60%, and 110% and permits 100%", async (t) => {
  const db = await database();
  try {
    await db.query("update tracks set status='pending_review' where id=$1", [ids.draft]);
    await db.query("delete from rights_holders where track_id=$1", [ids.draft]);
    const status = async () => (await db.query("select status from tracks where id=$1", [ids.draft])).rows[0].status;
    const addHolder = (share) => db.query(
      "insert into rights_holders(track_id,name,email,role_type,ownership_percent) values($1,'Synthetic holder','holder-'||$2::text||'@fixture.invalid','owner',$2::numeric)",
      [ids.draft, share]
    );
    const auditCount = async () => (await db.query(
      "select count(*)::int as total from track_audit_log where track_id=$1 and action='track_status_updated'", [ids.draft]
    )).rows[0].total;
    const originalAuditCount = await auditCount();
    const f = fixture({ db });

    for (const [total, nextShare] of [[0, null], [60, 60], [110, 50]]) {
      await t.test(`${total}% stays pending without audit or cache invalidation`, async () => {
        if (nextShare !== null) await addHolder(nextShare);
        assert.deepEqual(plain(await f.updateTrackStatusWithResultAction(formFor())), {
          status: "rejected", code: "OWNERSHIP_TOTAL_INVALID"
        });
        assert.equal(await f.updateTrackStatusAction(formFor()), undefined);
        assert.equal(await status(), "pending_review");
        assert.equal(await auditCount(), originalAuditCount);
        assert.deepEqual(f.audit, []);
        assert.deepEqual(f.paths, []);
      });
    }

    await t.test("100% persists approval and preserves the success audit and revalidation", async () => {
      await db.query("update rights_holders set ownership_percent=40 where track_id=$1 and ownership_percent=50", [ids.draft]);
      assert.deepEqual(plain(await f.updateTrackStatusWithResultAction(formFor())), { status: "ok" });
      assert.equal(await status(), "approved");
      assert.equal(await auditCount(), originalAuditCount + 1);
      assert.equal(f.audit[0].actor_id, ids.admin);
      assert.deepEqual(f.audit[0].metadata, { status: "approved" });
      assert.ok(f.paths.includes("/admin/review-queue"));
      assert.ok(f.paths.includes("/artist/tracks/draft"));
    });

    await t.test("the existing rejection transition works without imposing the approval rule", async () => {
      await db.query("update tracks set status='pending_review' where id=$1", [ids.draft]);
      await db.query("delete from rights_holders where track_id=$1", [ids.draft]);
      assert.equal(await f.updateTrackStatusAction(formFor("rejected")), undefined);
      assert.equal(await status(), "rejected");
      assert.equal(await auditCount(), originalAuditCount + 2);
      assert.deepEqual(f.audit[1].metadata, { status: "rejected" });
    });
  } finally {
    await db.close();
  }
});

test("only recognized rights rejections are classified as business failures", async () => {
  const f = fixture({ write: () => ({ error: { code: "42501", message: "Current verified rights review required" } }) });
  assert.deepEqual(plain(await f.updateTrackStatusWithResultAction(formFor())), {
    status: "rejected", code: "RIGHTS_REVIEW_REQUIRED"
  });
  assert.deepEqual(f.audit, []);
  assert.deepEqual(f.paths, []);
});

test("unexpected database results and transport failures are redacted", async () => {
  for (const write of [
    () => ({ error: { code: "P0001", message: "PRIVATE_TRIGGER_ERROR" } }),
    () => ({ error: { code: "42501", message: "PRIVATE_ACCESS_ERROR" } }),
    () => { throw new Error("PRIVATE_CONNECTION_ERROR"); }
  ]) {
    const f = fixture({ write });
    assert.deepEqual(plain(await f.updateTrackStatusWithResultAction(formFor())), unavailable);
    await assert.rejects(f.updateTrackStatusAction(formFor()), { message: "Track status could not be updated." });
    assert.doesNotMatch(JSON.stringify(f.logs), /PRIVATE_/);
    assert.deepEqual(f.audit, []);
    assert.deepEqual(f.paths, []);
  }
});

test("zero-row updates cannot produce a success or audit record", async () => {
  const f = fixture({ write: () => ({ data: null, error: null }) });
  assert.deepEqual(plain(await f.updateTrackStatusWithResultAction(formFor())), {
    status: "not_updated", code: "TRACK_NOT_UPDATED"
  });
  assert.deepEqual(f.audit, []);
  assert.deepEqual(f.paths, []);
});

test("missing identity, non-admin role, AAL1, inactive session, and denied capability stop before track access", async () => {
  for (const options of [{ user: null }, { role: "buyer" }, { assurance: "aal1" }, { active: false }, { capability: false }]) {
    const f = fixture(options);
    await assert.rejects(f.updateTrackStatusWithResultAction(formFor()), /Admin access is required/);
    assert.ok(!f.calls.includes("tracks"));
    assert.deepEqual(f.audit, []);
  }
});
