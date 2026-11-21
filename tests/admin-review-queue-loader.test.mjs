import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadAuthModule } from "./helpers/auth-system-harness.mjs";

const tables = ["tracks", "rights_holders", "admin_flags", "review_notes", "artist_profiles"];
const unavailable = { status: "unavailable", code: "TRACK_SUBMISSIONS_UNAVAILABLE" };
const privateDiagnostic = "synthetic private diagnostic";
const plain = (value) => JSON.parse(JSON.stringify(value));

function fixture() {
  const records = Object.fromEntries(tables.map((table) => [table, []]));
  const failures = new Map();
  const requests = [];
  const responses = new Map();
  const preferences = [];
  const diagnostics = [];
  const guardCalls = [];
  let guardError;
  let clientError;
  let rejectedTable;
  let clientCreations = 0;
  const fetchFixture = async (input, init) => {
    const url = new URL(input);
    const table = url.pathname.split("/").at(-1);
    requests.push(url);
    preferences.push(new Headers(init.headers).get("Prefer"));
    const failure = failures.get(table);
    if (failure === "transport") throw new TypeError(privateDiagnostic);
    if (failure) {
      return Response.json({ code: "SYNTHETIC", message: privateDiagnostic }, { status: failure });
    }
    const rows = records[table];
    const defaultRange = rows?.length ? `0-${rows.length - 1}/${rows.length}` : "*/0";
    const { status = 200, range = defaultRange } = responses.get(table) ?? {};
    return Response.json(rows, { status, headers: range === null ? {} : { "Content-Range": range } });
  };
  const service = loadAuthModule("services/admin/queries.ts", {
    "@/services/auth/authorization": {
      requireAccountScope: async (role) => {
        guardCalls.push(role);
        if (guardError) throw guardError;
      }
    },
    "@/services/supabase/privileged": {
      createPrivilegedSupabaseClient: async (wrapFetch) => {
        clientCreations++;
        if (clientError) throw clientError;
        const client = createClient("https://queue.invalid", "fixture-key", {
          auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
          global: { fetch: wrapFetch(fetchFixture) }
        });
        return {
          from: (table) => ({
            select: (columns, options) => {
              if (table === rejectedTable) return Promise.reject(new Error(privateDiagnostic));
              return client.from(table).select(columns, options).retry(false);
            }
          })
        };
      }
    },
    "@/lib/monitoring": { reportOperationalError: (...args) => diagnostics.push(args) },
    "@/lib/env": { shouldUseDemoData: () => false },
    "@/lib/demo-data": {},
    "@/lib/orders": {},
    "@/lib/storage": { getPublicStorageUrl: () => null, storageBuckets: {} },
    "@/services/generated-licenses/server": {},
    "@/lib/payment-mode.mjs": {},
    "@/services/storage/server": {},
    "@/services/supabase/schema-compat": {}
  });

  return {
    records, failures, responses, preferences, requests, diagnostics, guardCalls, ...service,
    deny: (error) => { guardError = error; },
    failClient: () => { clientError = new Error(privateDiagnostic); },
    rejectRead: (table) => { rejectedTable = table; },
    clientCreations: () => clientCreations
  };
}

const pending = (id, created_at) => ({ id, created_at, title: id, artist_user_id: "artist", status: "pending_review" });

test("successful empty results preserve both the typed and existing array contracts", async () => {
  const f = fixture();
  assert.deepEqual(plain(await f.getAdminReviewQueueResult()), { status: "ok", items: [] });
  assert.deepEqual(plain(await f.getAdminReviewQueue()), []);
  assert.deepEqual(f.guardCalls, ["admin", "admin"]);
  assert.deepEqual(f.requests.slice(0, 5).map((url) => url.pathname.split("/").at(-1)).sort(), [...tables].sort());
  assert.equal(f.requests.find((url) => url.pathname.endsWith("/tracks")).searchParams.get("status"), "eq.pending_review");
  assert.equal(f.diagnostics.length, 0);
});

test("populated results retain priority ordering and moderation evidence in both contracts", async () => {
  const f = fixture();
  f.records.tracks = [pending("recent", "2026-11-21"), pending("flagged", "2026-11-20")];
  f.records.admin_flags = [
    { track_id: "flagged", status: "open", severity: "high", flag_type: "rights" },
    { track_id: "flagged", status: "resolved", severity: "critical", flag_type: "other" }
  ];
  f.records.rights_holders = [
    { track_id: "flagged", ownership_percent: 60 }, { track_id: "flagged", ownership_percent: 40 }
  ];
  f.records.review_notes = [{ track_id: "flagged" }];
  f.records.artist_profiles = [{ user_id: "artist", artist_name: "Fixture Artist", verification_status: "verified" }];
  const result = plain(await f.getAdminReviewQueueResult());
  assert.equal(result.status, "ok");
  assert.deepEqual(result.items.map((row) => row.id), ["flagged", "recent"]);
  const [flagged] = result.items;
  assert.equal(flagged.rights_holder_count, 2);
  assert.equal(flagged.rights_split_total, 100);
  assert.equal(flagged.open_flag_count, 1);
  assert.equal(flagged.highest_flag_severity, "high");
  assert.deepEqual(flagged.open_flag_types, ["rights"]);
  assert.equal(flagged.review_note_count, 1);
  assert.equal(flagged.artist_name, "Fixture Artist");
  assert.equal(flagged.verification_status, "verified");
  assert.deepEqual(plain(await f.getAdminReviewQueue()), result.items);
});

for (const table of tables) {
  test(`${table} failure makes the entire queue unavailable`, async () => {
    const f = fixture();
    f.records.tracks = [pending("pending", "2026-11-21")];
    f.failures.set(table, 503);
    assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);
    assert.deepEqual(plain(f.diagnostics[0][2]), { dependencies: [table] });
    assert.doesNotMatch(JSON.stringify(f.diagnostics), /synthetic private diagnostic/);
  });
}

test("upstream denial and rejected fetch fail closed, and the next successful load recovers", async () => {
  const f = fixture();
  f.failures.set("tracks", 403);
  assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);
  f.failures.set("tracks", "transport");
  assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);
  await assert.rejects(f.getAdminReviewQueue(), { message: "Track submissions are temporarily unavailable." });
  f.failures.clear();
  f.records.tracks = [pending("recovered", "2026-11-21")];
  assert.equal((await f.getAdminReviewQueueResult()).items[0].id, "recovered");
});

test("null data, a rejected read, and failed client setup cannot become an empty result", async () => {
  const f = fixture();
  f.records.tracks = null;
  assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);
  f.records.tracks = [];
  f.rejectRead("admin_flags");
  assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);
  f.failClient();
  assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);
  assert.doesNotMatch(JSON.stringify(f.diagnostics), /synthetic private diagnostic/);
});

test("Admin guard errors propagate before privileged client creation or reads", async () => {
  const f = fixture();
  const denial = new Error("Full operational Admin access is required.");
  f.deny(denial);
  await assert.rejects(f.getAdminReviewQueueResult(), (error) => error === denial);
  await assert.rejects(f.getAdminReviewQueue(), (error) => error === denial);
  assert.deepEqual(f.guardCalls, ["admin", "admin"]);
  assert.equal(f.clientCreations(), 0);
  assert.equal(f.requests.length, 0);
  assert.equal(f.diagnostics.length, 0);
});

test("a 206 with one of two rights holders cannot report a 40 percent gap", async () => {
  const f = fixture();
  f.records.tracks = [pending("track", "2026-11-21")];
  f.records.rights_holders = [{ track_id: "track", ownership_percent: 60 }];
  f.responses.set("rights_holders", { status: 206, range: "0-0/2" });
  assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);

  f.records.rights_holders.push({ track_id: "track", ownership_percent: 40 });
  f.responses.set("rights_holders", { status: 206, range: "0-1/2" });
  const complete = await f.getAdminReviewQueueResult();
  assert.equal(complete.status, "ok");
  assert.equal(complete.items[0].rights_split_total, 100);
  assert.ok(f.preferences.every((prefer) => prefer?.includes("count=exact")));
});

for (const table of tables) {
  test(`${table} row cap makes the queue unavailable even with HTTP 200`, async () => {
    const f = fixture();
    f.records.tracks = [pending("track", "2026-11-21")];
    f.records[table] = [{ id: "track", status: "pending_review" }];
    f.responses.set(table, { status: 200, range: "0-0/1001" });
    assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable);
    assert.deepEqual(plain(f.diagnostics[0][2]), { dependencies: [table] });
  });
}

test("missing, unknown, malformed and contradictory ranges fail closed", async () => {
  const f = fixture();
  f.records.tracks = [pending("track", "2026-11-21")];
  for (const range of [null, "0-0/*", "0-0/1junk", "0-0/1/2", "1-1/1", "0-1/1", "*/0", "0-1/2"]) {
    f.responses.set("tracks", { range });
    assert.deepEqual(plain(await f.getAdminReviewQueueResult()), unavailable, String(range));
  }
  f.responses.set("tracks", { status: 206 });
  assert.equal((await f.getAdminReviewQueueResult()).status, "ok");
});
