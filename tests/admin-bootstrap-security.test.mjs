import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import * as url from "node:url";
import ts from "typescript";
import { assertAdminBootstrapIdentity } from "../scripts/lib/admin-bootstrap-identity.mjs";
const id = "11111111-1111-4111-8111-111111111111";
const wrong = "22222222-2222-4222-8222-222222222222";
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runScript(file, options = {}) {
  const writes = [];
  const email = file === "create-admin.mjs" ? "admin@example.invalid" : "qa-admin@example.invalid";
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://example.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-key",
    ADMIN_BOOTSTRAP_EMAIL: email, ADMIN_BOOTSTRAP_PASSWORD: "SyntheticPasswordOnly!",
    QA_ADMIN_EMAIL: email, QA_TEST_ACCOUNT_PASSWORD: "SyntheticPasswordOnly!",
    ADMIN_BOOTSTRAP_USER_ID: options.expected, QA_ADMIN_USER_ID: options.expected,
    ADMIN_BOOTSTRAP_RESET_PASSWORD: options.reset ? "true" : "false",
    QA_RESET_PASSWORDS: options.reset ? "true" : "false"
  };
  const existing = options.fresh ? null : { id, email, email_confirmed_at: options.unconfirmed ? null : "2026-01-01T00:00:00Z" };
  const client = {
    auth: { admin: {
      listUsers: async () => ({ data: { users: existing ? [existing] : [] } }),
      createUser: async payload => { writes.push(["create", payload]); return { data: { user: { id, ...payload } } }; },
      updateUserById: async (userId, payload) => { writes.push(["update", userId, payload]); return { data: { user: { ...existing, ...payload } } }; }
    } },
    from(table) {
      const query = {
        select: () => query, eq: () => query,
        limit: async () => ({ data: [], error: null }),
        upsert: async payload => { writes.push([table, payload]); return { error: null }; },
        maybeSingle: async () => ({ data: { id, email, role: "admin" }, error: null })
      };
      return query;
    }
  };
  const mocks = {
    "node:fs": { existsSync: () => false }, "node:path": path, "node:url": url,
    "@supabase/supabase-js": { createClient: () => client },
    "./lib/admin-bootstrap-identity.mjs": { assertAdminBootstrapIdentity }
  };
  const source = readFileSync(new URL(`../scripts/${file}`, import.meta.url), "utf8")
    .replace(/^#!.*\n/, "").replaceAll("import.meta.url", JSON.stringify(new URL(`../scripts/${file}`, import.meta.url).href));
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  let error;
  try {
    await new AsyncFunction("require", "exports", "process", "console", code)(
      name => { assert.ok(name in mocks, `Unmocked import ${name}`); return mocks[name]; }, {},
      { env, exit: () => { throw Error("script exited"); } }, { log() {}, error() {}, table() {} }
    );
  } catch (failure) { error = failure; }
  return { writes, error };
}

for (const file of ["create-admin.mjs", "seed-test-accounts.mjs"]) {
  test(`${file}: refuses unbound, mismatched or unconfirmed existing admin before any mutation`, async () => {
    for (const options of [{}, { expected: wrong }, { expected: "not-a-uuid" }, { expected: id, unconfirmed: true }]) {
      const result = await runScript(file, options);
      assert.ok(result.error, JSON.stringify(options)); assert.equal(result.writes.length, 0);
    }
  });
  test(`${file}: explicit confirmed identity preserves password unless reset is requested`, async () => {
    for (const reset of [false, true]) {
      const result = await runScript(file, { expected: id, reset });
      assert.equal(result.error, undefined);
      const update = result.writes.find(entry => entry[0] === "update");
      assert.equal(update[1], id); assert.equal("password" in update[2], reset);
      assert.ok(result.writes.some(entry => entry[0] === "user_profiles" && entry[1].id === id && entry[1].role === "admin"));
    }
  });
  test(`${file}: new admin creation is allowed, but a missing expected identity fails closed`, async () => {
    const good = await runScript(file, { fresh: true });
    assert.equal(good.error, undefined); assert.equal(good.writes[0][0], "create");
    const bad = await runScript(file, { fresh: true, expected: id });
    assert.ok(bad.error); assert.equal(bad.writes.length, 0);
  });
}
test("bootstrap identity guard rejects email mismatch even when the UUID matches", () => {
  assert.throws(() => assertAdminBootstrapIdentity({ existingUser: { id, email: "other@example.invalid", email_confirmed_at: "2026-01-01" }, expectedUserId: id, email: "admin@example.invalid", settingName: "EXPECTED_ID" }), /does not match/);
});
