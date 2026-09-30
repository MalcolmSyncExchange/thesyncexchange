import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

import { assertAuthenticatedBuyerSettingsUser, buildBillingPortalReturnUrl } from "../services/buyer/settings.ts";

function compileModule(path, mocks) {
  const loadedModule = { exports: {} };
  const source = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;

  vm.runInNewContext(code, {
    module: loadedModule,
    exports: loadedModule.exports,
    Response,
    console,
    require(name) {
      assert.ok(Object.hasOwn(mocks, name), `Unmocked dependency: ${name}`);
      return mocks[name];
    }
  });

  return loadedModule.exports;
}

function routeHarness({ portalEnabled = false, user = { id: "buyer-a", email: "buyer-a@example.invalid" }, role = "buyer" } = {}) {
  const stripeCalls = [];
  const operationalEvents = [];
  const stripe = {
    customers: {
      async list(input) {
        stripeCalls.push(["customers.list", input]);
        return { data: [{ id: "cus_test_buyer_a" }] };
      },
      async create(input) {
        stripeCalls.push(["customers.create", input]);
        return { id: "cus_test_created" };
      }
    },
    billingPortal: {
      sessions: {
        async create(input) {
          stripeCalls.push(["billingPortal.sessions.create", input]);
          return { url: "https://billing.stripe.test/session" };
        }
      }
    }
  };
  const supabase = {
    auth: { getUser: async () => ({ data: { user } }) },
    from(table) {
      assert.equal(table, "user_profiles");
      return {
        select(columns) {
          assert.equal(columns, "role");
          return {
            eq(column, value) {
              assert.equal(column, "id");
              assert.equal(value, user?.id);
              return { maybeSingle: async () => ({ data: { role } }) };
            }
          };
        }
      };
    }
  };
  const mocks = {
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    "@/lib/env": { env: { appUrl: "https://security-staging.example.test" } },
    "@/lib/monitoring": {
      reportOperationalError() {},
      reportOperationalEvent(...args) {
        operationalEvents.push(args);
      }
    },
    "@/lib/server-env": { getBillingPortalRuntimeConfiguration: () => ({ enabled: portalEnabled }) },
    "@/services/buyer/settings": { assertAuthenticatedBuyerSettingsUser, buildBillingPortalReturnUrl },
    "@/services/stripe/server": {
      getStripeServerClient() {
        stripeCalls.push(["getStripeServerClient"]);
        return stripe;
      }
    },
    "@/services/supabase/server": { createServerSupabaseClient: async () => supabase }
  };
  const route = compileModule("app/api/billing/portal/route.ts", mocks);

  return { route, mocks, stripeCalls, operationalEvents };
}

test("disabled canonical billing portal returns safely with zero Stripe calls", async () => {
  const harness = routeHarness();
  const response = await harness.route.POST();

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "Billing portal is unavailable in this environment." });
  assert.deepEqual(harness.stripeCalls, []);
  assert.deepEqual(harness.operationalEvents, []);
});

test("disabled billing portal alias invokes the same fail-closed handler with zero Stripe calls", async () => {
  const harness = routeHarness();
  const alias = compileModule("app/api/user/billing-portal/route.ts", {
    "@/app/api/billing/portal/route": harness.route
  });
  const response = await alias.POST();

  assert.equal(response.status, 503);
  assert.deepEqual(harness.stripeCalls, []);
});

test("billing portal keeps authentication and persisted buyer-role checks ahead of the feature gate", async () => {
  const unauthenticated = routeHarness({ user: null });
  assert.equal((await unauthenticated.route.POST()).status, 401);
  assert.deepEqual(unauthenticated.stripeCalls, []);

  for (const role of ["artist", "admin"]) {
    const wrongRole = routeHarness({ role });
    assert.equal((await wrongRole.route.POST()).status, 403);
    assert.deepEqual(wrongRole.stripeCalls, []);
  }
});

test("an explicitly enabled safe test context preserves future portal support", async () => {
  const harness = routeHarness({ portalEnabled: true });
  const response = await harness.route.POST();

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { url: "https://billing.stripe.test/session" });
  assert.deepEqual(
    harness.stripeCalls.map(([operation]) => operation),
    ["getStripeServerClient", "customers.list", "billingPortal.sessions.create"]
  );
});

test("Buyer Settings hides only the portal action while preserving invoice and receipt UI", () => {
  const page = readFileSync(new URL("../app/(app)/buyer/settings/page.tsx", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/buyer/buyer-settings-form.tsx", import.meta.url), "utf8");

  assert.match(page, /billingPortalEnabled=\{billingPortalEnabled\}/);
  assert.match(form, /billingPortalEnabled \? \(/);
  assert.match(form, /Manage Billing/);
  assert.match(form, /Invoices And Receipts/);
  assert.match(form, /invoices\.map/);
  assert.match(form, /View Receipt/);
});

test("one-time Checkout requires neither Customer Write nor Billing Portal Sessions Write", () => {
  const stripeServer = readFileSync(new URL("../services/stripe/server.ts", import.meta.url), "utf8");
  const checkoutStart = stripeServer.indexOf("export async function createStripeCheckoutSession");
  const checkoutEnd = stripeServer.indexOf("export async function syncOrderFromStripeSession", checkoutStart);
  const checkout = stripeServer.slice(checkoutStart, checkoutEnd);

  assert.match(checkout, /stripe\.checkout\.sessions\.create/);
  assert.doesNotMatch(checkout, /stripe\.customers/);
  assert.doesNotMatch(checkout, /stripe\.billingPortal/);
});
