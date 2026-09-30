import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { isMaintenanceHealthRequest, resolveMaintenanceMode } from "../lib/maintenance-mode.mjs";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("maintenance mode defaults off, enables cutover, and fails closed on unknown values", () => {
  assert.deepEqual(resolveMaintenanceMode(undefined), { mode: "off", valid: true, blocksApplication: false });
  assert.deepEqual(resolveMaintenanceMode("off"), { mode: "off", valid: true, blocksApplication: false });
  assert.deepEqual(resolveMaintenanceMode("cutover"), { mode: "cutover", valid: true, blocksApplication: true });
  assert.deepEqual(resolveMaintenanceMode("production"), { mode: "invalid", valid: false, blocksApplication: true });
});

test("only exact read-only health endpoints pass the maintenance allowlist", () => {
  for (const path of ["/api/health/config", "/api/health/readiness"]) {
    assert.equal(isMaintenanceHealthRequest(path, "GET"), true);
    assert.equal(isMaintenanceHealthRequest(path, "POST"), false);
  }
  for (const path of ["/login", "/signup", "/auth/confirm", "/api/webhooks/stripe", "/api/storage/upload-url", "/api/storage/upload", "/api/storage/delete", "/api/checkout", "/buyer", "/artist", "/admin", "/api/health/config/extra"]) {
    assert.equal(isMaintenanceHealthRequest(path, "GET"), false, path);
  }
});

test("central gate precedes session code and covers all application paths", () => {
  const middleware = source("middleware.ts");
  assert.ok(middleware.indexOf("maintenance.blocksApplication") < middleware.indexOf("createServerClient("));
  assert.match(middleware, /matcher: \["\/:path\*"\]/);
  assert.match(middleware, /status: 503/);
  assert.match(middleware, /maintenance_mode/);
  assert.match(middleware, /no-store/);
});

test("webhook and direct Storage routes deny before their mutating dependencies", () => {
  const cases = [
    ["app/api/webhooks/stripe/route.ts", "getStripeServerClient()"],
    ["app/api/storage/upload-url/route.ts", "consumeRateLimit("],
    ["app/api/storage/upload/route.ts", "createServerSupabaseClient("],
    ["app/api/storage/delete/route.ts", "createServerSupabaseClient("]
  ];
  for (const [path, effect] of cases) {
    const text = source(path);
    const start = text.indexOf("export async function POST(");
    assert.ok(start >= 0, path);
    const body = text.slice(start);
    assert.ok(body.indexOf("blocksApplication") >= 0 && body.indexOf("blocksApplication") < body.indexOf(effect), path);
  }
});
