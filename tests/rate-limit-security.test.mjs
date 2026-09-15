import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";

const userId = "12345678-1234-1234-1234-123456789abc";
const otherId = "87654321-1234-1234-1234-123456789abc";
const resetAt = "2030-01-01T00:01:00.000Z";
const allowedRow = { allowed: true, remaining: 4, retry_after_seconds: 0, reset_at: resetAt };
const deniedRow = { allowed: false, remaining: 0, retry_after_seconds: 42, reset_at: resetAt };
const sql = readFileSync(new URL("../supabase/migrations/0021_rate_limit_foundation.sql", import.meta.url), "utf8");

// Compile the actual TS modules in memory; every external dependency is explicit.
// No files are emitted and no network or real database clients are created.
function loadModule(path, stubs) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  const loadedModule = { exports: {} };
  runInNewContext(outputText, {
    module: loadedModule, exports: loadedModule.exports, Response, Request, FormData, File,
    AbortSignal, URL, crypto: webcrypto,
    require(name) {
      assert.ok(Object.hasOwn(stubs, name), `Unmocked dependency: ${name}`);
      return stubs[name];
    }
  }, { filename: path });
  return loadedModule.exports;
}

function limiter({ rows = [allowedRow], error = null, throws = false, missingClient = false, target = "preview", rpcOverride, waitForAbort = false } = {}) {
  const calls = [];
  const helper = loadModule("services/security/rate-limit.ts", {
    "server-only": {},
    "@/lib/env": { getDeploymentTarget: () => target },
    "@/services/supabase/admin": {
      createAdminSupabaseClient: () => missingClient ? null : {
        rpc(name, args) {
          calls.push({ name, ...args });
          return {
            async abortSignal(signal) {
              assert.ok(signal instanceof AbortSignal);
              if (waitForAbort) await new Promise((resolve, reject) => {
                signal.addEventListener("abort", () => reject(signal.reason), { once: true });
              });
              if (throws) throw new Error("private backend detail");
              return rpcOverride ? rpcOverride(args) : { data: rows, error };
            }
          };
        }
      }
    }
  });
  return { helper, calls };
}

function harness({ role = "buyer", authenticated = true, owner = userId, pricingError = false, limitOptions = {} } = {}) {
  const events = [];
  const { helper, calls } = limiter(limitOptions);
  const db = {
    auth: { getUser: async () => ({ data: { user: authenticated ? { id: userId, email: "test@example.invalid" } : null } }) },
    from(table) {
      let mutation = false;
      const result = () => ({ data: mutation ? { id: "new-order" } : null, error: null });
      const query = {
        select() { return query; }, eq() { return query; }, order() { return query; }, limit() { return query; },
        maybeSingle: async () => result(), single: async () => result(),
        then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); }
      };
      for (const op of ["insert", "update", "upsert", "delete"]) {
        query[op] = () => { mutation = true; events.push(`${table}:${op}`); return query; };
      }
      return query;
    },
    storage: { from: () => ({ createSignedUploadUrl: async () => {
      events.push("signed-upload");
      return { data: { token: "dummy-token" }, error: null };
    } }) }
  };
  const redirect = (url) => { const e = new Error("redirect"); e.url = url; e.digest = "NEXT_REDIRECT"; throw e; };
  const stubs = {
    "next/server": { NextResponse: { json: Response.json } },
    "next/cache": { revalidatePath() {} },
    "next/headers": { cookies: async () => ({ get: () => undefined }) },
    "next/navigation": { redirect, unstable_rethrow(e) { if (e.digest === "NEXT_REDIRECT") throw e; } },
    "@/lib/env": { env: { demoMode: false }, hasSupabaseEnv: true },
    "@/lib/server-env": { assertStripeServerConfiguration() {} },
    "@/lib/license": { generateAgreementPlaceholder() { throw new Error("Unexpected demo mode"); } },
    "@/lib/storage": {
      buildTrackAssetPath: ({ userId: id, scope, kind, fileName }) => `${id}/${scope}/${kind}/${fileName}`,
      getPublicStorageUrl: () => null, getStorageBucketForKind: () => "cover-art"
    },
    "@/services/auth/user-profiles": { selectUserProfileCompat: async () => ({ data: { role }, error: null }) },
    "@/services/auth/session": { resolveRoleRedirect: value => `/${value || "onboarding"}` },
    "@/services/supabase/admin": { createAdminSupabaseClient: () => db },
    "@/services/supabase/server": { createServerSupabaseClient: async () => db },
    "@/services/supabase/privileged": { createPrivilegedSupabaseClient: async () => db },
    "@/services/supabase/schema-compat": { isMissingColumnError: () => false, warnSchemaFallbackOnce() {} },
    "@/services/orders/activity": { appendOrderActivityLog: async () => { events.push("activity"); } },
    "@/services/orders/checkout-pricing": {
      loadTrustedCheckoutDetails: async () => {
        if (pricingError) throw new Error("Unapproved track or inactive license");
        return { order: { id: "order", buyer_user_id: owner, status: "pending", track_id: "track", license_type_id: "license" },
          amountCents: 120000, currency: "USD", trackTitle: "Track", trackSlug: "track", licenseName: "Digital" };
      },
      getStoredOrderPricingMismatch: () => ({ amountMismatch: true, currencyMismatch: false })
    },
    "@/services/stripe/server": { createStripeCheckoutSession: async args => {
      events.push("stripe"); assert.equal(args.amountCents, 120000); assert.equal(args.buyerUserId, userId);
      return { id: "cs_test", url: "https://example.invalid/checkout" };
    } },
    "@/services/buyer/queries": { getBuyerTrackBySlug: async () => {
      events.push("catalog-preview-read");
      return { id: "track", title: "Track", slug: "track", license_options: [{ id: "license", name: "Digital", base_price: 1200 }] };
    } },
    "@/services/storage/assets": {
      assertStorageUploadMetadata() {},
      uploadManagedAsset: async ({ userId: id }) => { assert.equal(id, userId); events.push("storage-upload"); return { path: "dummy" }; }
    },
    "@/services/security/rate-limit": helper
  };
  const checkout = loadModule("app/api/checkout/route.ts", stubs).POST;
  const uploadUrl = loadModule("app/api/storage/upload-url/route.ts", stubs).POST;
  const upload = loadModule("app/api/storage/upload/route.ts", stubs).POST;
  const action = loadModule("services/buyer/actions.ts", stubs).createOrderAction;
  return { checkout, uploadUrl, upload, action, calls, events };
}

const jsonRequest = body => new Request("https://example.invalid/api", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
});
const checkoutRequest = () => jsonRequest({ orderId: "order", userId: otherId, amountCents: 1 });
const uploadRequest = () => jsonRequest({ kind: "cover-art", scope: "draft", fileName: "cover.png", fileSize: 10, userId: otherId });
function orderForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({ trackId: "track", trackSlug: "track", licenseSelection: "license|1", userId: otherId })) form.set(key, value);
  return form;
}

test("checkout API and action consume the same server-derived checkout budget before any writes or Stripe", async () => {
  const h = harness({ limitOptions: { rows: [deniedRow] } });
  const response = await h.checkout(checkoutRequest());
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "42");
  await assert.rejects(h.action(orderForm()), error => error.url.includes("Too%20many%20requests"));
  assert.deepEqual(h.calls.map(c => c.p_operation), ["checkout", "checkout"]);
  assert.ok(h.calls.every(c => c.p_subject === userId));
  assert.deepEqual(h.events, []);
});

test("checkout limiter backend errors fail closed through API and normal action feedback", async () => {
  const h = harness({ limitOptions: { throws: true } });
  const response = await h.checkout(checkoutRequest());
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private backend detail/);
  await assert.rejects(h.action(orderForm()), e => e.url.includes("temporarily%20unavailable"));
  assert.deepEqual(h.events, []);
});

test("checkout authorization, ownership and trusted validation precede admission", async () => {
  for (const options of [{ authenticated: false }, { role: "artist" }, { role: "admin" }, { owner: otherId }, { pricingError: true }]) {
    const h = harness(options);
    const response = await h.checkout(checkoutRequest());
    assert.ok([401, 403, 404, 409].includes(response.status));
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.events, []);
  }
  for (const options of [{ authenticated: false }, { role: "artist" }, { role: "admin" }]) {
    const h = harness(options);
    await assert.rejects(h.action(orderForm()), e => e.digest === "NEXT_REDIRECT");
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.events, []);
  }
  const missingInput = harness();
  await assert.rejects(missingInput.action(new FormData()), e => e.url.includes("Missing%20checkout%20details"));
  assert.deepEqual(missingInput.calls, []);
  assert.deepEqual(missingInput.events, []);
});

test("allowed checkout retains trusted prices and ownership in both entry points", async () => {
  const h = harness();
  assert.equal((await h.checkout(checkoutRequest())).status, 200);
  await assert.rejects(h.action(orderForm()), e => e.url === "https://example.invalid/checkout");
  assert.equal(h.events.filter(e => e === "stripe").length, 2);
});

test("upload denial prevents signed tokens and prevents even multipart parsing", async () => {
  for (const limitOptions of [{ rows: [deniedRow] }, { error: { message: "private detail" } }]) {
    const h = harness({ role: "artist", limitOptions });
    const expected = limitOptions.rows ? 429 : 503;
    assert.equal((await h.uploadUrl(uploadRequest())).status, expected);
    const response = await h.upload({ formData() { throw new Error("Must not parse multipart"); } });
    assert.equal(response.status, expected);
    assert.equal(response.headers.get("Retry-After"), expected === 429 ? "42" : "15");
    assert.deepEqual(h.calls.map(c => c.p_operation), ["upload", "server-upload"]);
    assert.ok(h.calls.every(c => c.p_subject === userId));
    assert.deepEqual(h.events, []);
  }
});

test("upload authentication and canonical role checks happen before multipart parsing or admission", async () => {
  for (const options of [{ authenticated: false }, { role: "buyer" }, { role: null }]) {
    const h = harness(options);
    assert.ok([401, 403].includes((await h.uploadUrl(uploadRequest())).status));
    assert.ok([401, 403].includes((await h.upload({ formData() { throw new Error("Must not parse"); } })).status));
    assert.deepEqual(h.calls, []);
    assert.deepEqual(h.events, []);
  }
});

test("Artist and Admin upload behavior continues after admission", async () => {
  for (const role of ["artist", "admin"]) {
    const h = harness({ role });
    assert.equal((await h.uploadUrl(uploadRequest())).status, 200);
    const form = new FormData();
    form.set("kind", "cover-art"); form.set("scope", "draft");
    form.set("file", new File(["dummy"], "cover.png", { type: "image/png" }));
    assert.equal((await h.upload({ formData: async () => form })).status, 200);
    assert.deepEqual(h.events, ["signed-upload", "storage-upload"]);
  }
});

test("helper isolates production, preview and local namespaces and rejects caller-controlled operations", async () => {
  const namespaces = [];
  for (const target of ["production", "preview", "local"]) {
    const { helper, calls } = limiter({ target });
    assert.equal((await helper.consumeRateLimit("checkout", userId)).status, "allowed");
    namespaces.push(calls[0].p_namespace);
    assert.equal((await helper.consumeRateLimit("arbitrary-table", userId)).status, "unavailable");
    assert.equal((await helper.consumeRateLimit("checkout", "client-value")).status, "unavailable");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].name, "consume_rate_limit");
  }
  assert.deepEqual(namespaces, ["tse:production", "tse:preview", "tse:local"]);
});

test("missing backend, malformed responses, timeouts and RPC failures never allow admission", async () => {
  for (const options of [
    { missingClient: true }, { throws: true }, { error: { code: "PGRST202" } },
    { rows: [] }, { rows: null }, { rows: [null] }, { rows: [allowedRow, allowedRow] },
    { rows: [{ ...allowedRow, remaining: -1 }] }, { rows: [{ ...allowedRow, reset_at: "bad" }] },
    { rows: [{ ...deniedRow, retry_after_seconds: 0 }] }, { rows: [{ ...allowedRow, allowed: "true" }] }
  ]) {
    const { helper } = limiter(options);
    const result = await helper.consumeRateLimit("checkout", userId);
    assert.equal(result.status, "unavailable");
    assert.equal(helper.rateLimitErrorResponse(result).status, 503);
  }
});

function sqlBudget(operation) {
  const body = sql.split(`when '${operation}' then`)[1]?.split(/when '|else/)[0];
  assert.ok(body, `Missing SQL operation ${operation}`);
  const policies = [...body.match(/v_policies := array\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const limits = body.match(/v_limits := array\[([^\]]+)\]/)[1].split(",").map(Number);
  const seconds = body.match(/v_seconds := array\[([^\]]+)\]/)[1].split(",").map(Number);
  return policies.map((policy, i) => ({ policy, limit: limits[i], seconds: seconds[i] }));
}

test("unsafe, negative, fractional and absurd numeric RPC responses fail closed", async () => {
  for (const operation of ["checkout", "upload", "server-upload"]) {
    for (const value of [100000000000000000000, Number.MAX_SAFE_INTEGER + 1, -1, 0.5, NaN, Infinity, "1", null]) {
      for (const row of [
        { ...allowedRow, remaining: value },
        { ...deniedRow, retry_after_seconds: value }
      ]) {
        const { helper } = limiter({ rows: [row] });
        const result = await helper.consumeRateLimit(operation, userId);
        assert.equal(result.status, "unavailable", `${operation}: ${JSON.stringify(row)}`);
        const response = helper.rateLimitErrorResponse(result);
        assert.equal(response.status, 503);
        assert.equal(response.headers.get("Retry-After"), "15");
      }
    }
  }
});

test("remaining counts match the tightest SQL budget after admission and denials have none", async () => {
  for (const operation of ["checkout", "upload", "server-upload"]) {
    const limit = Math.min(...sqlBudget(operation).map(b => b.limit));
    for (const remaining of [0, limit - 1]) {
      const { helper } = limiter({ rows: [{ ...allowedRow, remaining }] });
      const result = await helper.consumeRateLimit(operation, userId);
      assert.equal(result.status, "allowed");
      assert.equal(helper.rateLimitErrorResponse(result), null);
    }
    for (const row of [
      { ...allowedRow, remaining: limit },
      { ...allowedRow, remaining: limit + 1 },
      { ...allowedRow, remaining: 201 },
      { ...deniedRow, remaining: 1 },
      { ...allowedRow, retry_after_seconds: 1 },
      { ...deniedRow, retry_after_seconds: 0 }
    ]) {
      const { helper } = limiter({ rows: [row] });
      const result = await helper.consumeRateLimit(operation, userId);
      assert.equal(result.status, "unavailable", `${operation}: ${JSON.stringify(row)}`);
      assert.equal(helper.rateLimitErrorResponse(result).status, 503);
    }
  }
});

test("valid denial retry bounds retain 429 and exact Retry-After headers", async () => {
  for (const operation of ["checkout", "upload", "server-upload"]) {
    const maximum = Math.max(...sqlBudget(operation).map(b => b.seconds));
    for (const retry of [1, 42, maximum]) {
      const { helper } = limiter({ rows: [{ ...deniedRow, retry_after_seconds: retry }] });
      const result = await helper.consumeRateLimit(operation, userId);
      assert.equal(result.status, "rate-limited");
      const response = helper.rateLimitErrorResponse(result);
      assert.equal(response.status, 429);
      assert.equal(response.headers.get("Retry-After"), String(retry));
    }
    const { helper } = limiter({ rows: [{ ...deniedRow, retry_after_seconds: maximum + 1 }] });
    const result = await helper.consumeRateLimit(operation, userId);
    assert.equal(result.status, "unavailable");
    assert.equal(helper.rateLimitErrorResponse(result).status, 503);
  }
});

test("malformed numeric admission cannot reach checkout writes, Stripe, upload tokens or multipart parsing", async () => {
  for (const row of [
    { ...deniedRow, retry_after_seconds: 100000000000000000000 },
    { ...allowedRow, remaining: 201 },
    { ...deniedRow, remaining: 1 }
  ]) {
    const limitOptions = { rows: [row] };
    const buyer = harness({ limitOptions });
    assert.equal((await buyer.checkout(checkoutRequest())).status, 503);
    await assert.rejects(buyer.action(orderForm()), e => e.url.includes("temporarily%20unavailable"));
    assert.deepEqual(buyer.events, []);
    const artist = harness({ role: "artist", limitOptions });
    assert.equal((await artist.uploadUrl(uploadRequest())).status, 503);
    assert.equal((await artist.upload({ formData() { throw new Error("Must not parse"); } })).status, 503);
    assert.deepEqual(artist.events, []);
  }
});

test("database owns exact checkout and shared upload policies in a consistent lock order", () => {
  assert.deepEqual(sqlBudget("checkout"), [
    { policy: "checkout-minute", limit: 5, seconds: 60 }, { policy: "checkout-hour", limit: 30, seconds: 3600 }
  ]);
  const upload = [
    { policy: "upload-minute", limit: 20, seconds: 60 }, { policy: "upload-day", limit: 200, seconds: 86400 }
  ];
  assert.deepEqual(sqlBudget("upload"), upload);
  assert.deepEqual(sqlBudget("server-upload"), [...upload, { policy: "server-upload-minute", limit: 10, seconds: 60 }]);
});

test("combined entry points consume shared quotas using an RPC mock driven by the SQL policy definitions", async () => {
  const counts = new Map();
  const rpcOverride = args => {
    const budgets = sqlBudget(args.p_operation);
    const keys = budgets.map(b => `${args.p_namespace}:${args.p_subject}:${b.policy}`);
    if (budgets.some((b, i) => (counts.get(keys[i]) || 0) >= b.limit)) return { data: [deniedRow], error: null };
    for (const key of keys) counts.set(key, (counts.get(key) || 0) + 1);
    return { data: [allowedRow], error: null };
  };
  const h = harness({ limitOptions: { rpcOverride } });
  for (let i = 0; i < 3; i++) assert.equal((await h.checkout(checkoutRequest())).status, 200);
  for (let i = 0; i < 2; i++) await assert.rejects(h.action(orderForm()), e => e.url === "https://example.invalid/checkout");
  assert.equal((await h.checkout(checkoutRequest())).status, 429);
  await assert.rejects(h.action(orderForm()), e => e.url.includes("Too%20many"));
  assert.equal(h.events.filter(e => e === "stripe").length, 5);

  const uploads = limiter({ rpcOverride }).helper;
  for (let i = 0; i < 10; i++) assert.equal((await uploads.consumeRateLimit("server-upload", userId)).status, "allowed");
  assert.equal((await uploads.consumeRateLimit("server-upload", userId)).status, "rate-limited");
  for (let i = 0; i < 10; i++) assert.equal((await uploads.consumeRateLimit("upload", userId)).status, "allowed");
  assert.equal((await uploads.consumeRateLimit("upload", userId)).status, "rate-limited");
});

// Synthetic windows model admission only; PostgreSQL concurrency is verified separately.
function windowFixture(initial = {}) {
  const counts = new Map(Object.entries(initial));
  const rpcOverride = ({ p_operation }) => {
    const budgets = sqlBudget(p_operation);
    const exhausted = budgets.filter(b => (counts.get(b.policy) || 0) >= b.limit);
    if (exhausted.length) return { error: null, data: [{
      ...deniedRow, retry_after_seconds: Math.max(...exhausted.map(b => b.seconds))
    }] };
    for (const b of budgets) counts.set(b.policy, (counts.get(b.policy) || 0) + 1);
    return { error: null, data: [{ ...allowedRow,
      remaining: Math.min(...budgets.map(b => b.limit - counts.get(b.policy)))
    }] };
  };
  return { counts, limitOptions: { rpcOverride } };
}

for (const [operation, policy, maximum, role] of [
  ["checkout", "checkout-minute", 5, "buyer"],
  ["upload", "upload-minute", 20, "artist"],
  ["server-upload", "server-upload-minute", 10, "artist"]
]) {
  test(`${operation} route admits exactly ${maximum}, then denies without charging any budget`, async () => {
    const fixture = windowFixture(), h = harness({ role, limitOptions: fixture.limitOptions });
    const request = () => {
      if (operation === "checkout") return h.checkout(checkoutRequest());
      if (operation === "upload") return h.uploadUrl(uploadRequest());
      const form = new FormData();
      form.set("kind", "cover-art"); form.set("scope", "draft");
      form.set("file", new File(["dummy"], "cover.png", { type: "image/png" }));
      return h.upload({ formData: async () => form });
    };
    for (let i = 0; i < maximum; i++) assert.equal((await request()).status, 200);
    assert.equal(fixture.counts.get(policy), maximum);
    const before = [...fixture.counts], events = [...h.events];
    const denied = await request();
    assert.equal(denied.status, 429);
    assert.equal(denied.headers.get("Retry-After"), "60");
    assert.deepEqual([...fixture.counts], before);
    assert.deepEqual(h.events, events);
  });
}

test("exhausted hour/day and later direct-upload budgets leave earlier budgets unchanged", async () => {
  for (const [initial, role, operation, retry] of [
    [{ "checkout-minute": 1, "checkout-hour": 30 }, "buyer", "checkout", 3600],
    [{ "upload-minute": 1, "upload-day": 200 }, "artist", "upload", 86400],
    [{ "upload-minute": 1, "upload-day": 200, "server-upload-minute": 1 }, "artist", "server-upload", 86400],
    [{ "upload-minute": 1, "upload-day": 1, "server-upload-minute": 10 }, "artist", "server-upload", 60]
  ]) {
    const fixture = windowFixture(initial), h = harness({ role, limitOptions: fixture.limitOptions });
    const before = [...fixture.counts];
    const response = operation === "checkout" ? await h.checkout(checkoutRequest())
      : operation === "upload" ? await h.uploadUrl(uploadRequest())
      : await h.upload({ formData() { throw new Error("Denied before parsing"); } });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), String(retry));
    if (operation === "checkout") {
      await assert.rejects(h.action(orderForm()), e => e.url.includes("Too%20many"));
    }
    assert.deepEqual([...fixture.counts], before);
    assert.deepEqual(h.events, []);
  }
});

test("actual three-second abort signal fails closed without checkout side effects", async () => {
  // AbortSignal.timeout is unref'ed; keep the test alive until it fires.
  const keepAlive = setInterval(() => {}, 100);
  try {
    const h = harness({ limitOptions: { waitForAbort: true } });
    const response = await h.checkout(checkoutRequest());
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Retry-After"), "15");
    assert.deepEqual(h.events, []);
  } finally {
    clearInterval(keepAlive);
  }
});

test("migration restricts table and RPC access without null-UID or metadata trust", () => {
  assert.match(sql, /alter table rate_limit_private\.counters enable row level security;/);
  assert.match(sql, /revoke all on table rate_limit_private\.counters from public, anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.consume_rate_limit\(text, text, uuid\) from public, anon, authenticated;/);
  assert.match(sql, /grant execute on function public\.consume_rate_limit\(text, text, uuid\) to service_role;/);
  assert.match(sql, /auth\.role\(\) is distinct from 'service_role'/);
  assert.match(sql, /security definer\s+set search_path = pg_catalog/);
  assert.doesNotMatch(sql, /create policy|auth\.uid\(\) is null|user_metadata|app_metadata|execute format/i);
});

test("migration serializes admission and increments only after checking all locked windows", () => {
  assert.match(sql, /primary key \(namespace, subject_key, policy, window_start\)/);
  assert.match(sql, /clock_timestamp\(\)/);
  assert.match(sql, /on conflict \(namespace, subject_key, policy, window_start\) do nothing;/);
  assert.match(sql, /select c\.request_count into strict v_count[\s\S]*?for update;/);
  const lock = sql.indexOf("for update;");
  const check = sql.indexOf("if v_count >= v_limits[v_i]");
  const increment = sql.indexOf("update rate_limit_private.counters c set request_count = c.request_count + 1");
  assert.ok(lock < check && check < increment);
  assert.match(sql, /for v_i in 1\.\.array_length\(v_policies, 1\) loop\s+if allowed then\s+update/);
  assert.match(sql, /on rate_limit_private\.counters \(window_end\)/);
});
