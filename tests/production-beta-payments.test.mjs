import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  assertStripeObjectMode,
  buildPaymentClassification,
  canReusePendingOrderForPaymentMode,
  getStripeCheckoutSessionMode,
  resolvePaymentConfiguration
} from "../lib/payment-mode.mjs";
import vm from "node:vm";
import ts from "typescript";

test("production payment configuration distinguishes beta from future live mode", () => {
  assert.deepEqual(resolvePaymentConfiguration("test", "production"), {
    paymentMode: "test",
    releaseMode: "production_beta",
    livePaymentsEnabled: false,
    expectedLivemode: false,
    valid: true,
    issueCode: null,
    message: null
  });
  const live = resolvePaymentConfiguration("live", "production");
  assert.equal(live.releaseMode, "production_live");
  assert.equal(live.livePaymentsEnabled, true);
  assert.equal(resolvePaymentConfiguration(undefined, "production").valid, false);
  assert.equal(resolvePaymentConfiguration("unknown", "production").valid, false);
  assert.equal(resolvePaymentConfiguration("live", "preview").valid, false);
});

test("Stripe objects must match configured payment mode and session identity", () => {
  assert.equal(getStripeCheckoutSessionMode("cs_test_example"), "test");
  assert.equal(getStripeCheckoutSessionMode("cs_live_example"), "live");
  assert.doesNotThrow(() => assertStripeObjectMode({
    context: "checkout",
    paymentMode: "test",
    livemode: false,
    checkoutSessionId: "cs_test_example"
  }));
  assert.throws(() => assertStripeObjectMode({ context: "checkout", paymentMode: "test", livemode: true }), /livemode/);
  assert.throws(() => assertStripeObjectMode({
    context: "checkout",
    paymentMode: "test",
    livemode: false,
    checkoutSessionId: "cs_live_example"
  }), /session identity/);
});

test("beta classification is persisted as noncommercial", () => {
  assert.deepEqual(buildPaymentClassification("test", "production_beta"), {
    paymentMode: "test",
    releaseMode: "production_beta",
    livemode: false,
    commercialRightsGranted: false
  });
});

test("pending orders are reusable only within the same known payment mode", () => {
  assert.equal(canReusePendingOrderForPaymentMode("cs_test_example", "test"), true);
  assert.equal(canReusePendingOrderForPaymentMode("cs_live_example", "test"), false);
  assert.equal(canReusePendingOrderForPaymentMode(null, "test"), false);
  assert.equal(canReusePendingOrderForPaymentMode("cs_legacy_example", "test"), false);
});

test("existing checkout and agreement paths reject unknown or cross-mode Stripe sessions", () => {
  const checkout = readFileSync(new URL("../app/api/checkout/route.ts", import.meta.url), "utf8");
  const agreements = readFileSync(new URL("../services/agreements/server.ts", import.meta.url), "utf8");
  assert.match(checkout, /stripe_checkout_session_id && storedSessionMode !== paymentRuntime\.paymentMode/);
  assert.match(agreements, /sessionMode === "unknown"/);
  assert.match(agreements, /sessionMode !== runtime\.paymentMode/);
  assert.match(agreements, /different payment mode/);
  assert.match(agreements, /Stripe-verified payment evidence is required before generating an agreement/);
});

test("webhook and shared fulfillment enforce livemode after signature verification", () => {
  const webhook = readFileSync(new URL("../app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
  const stripeServer = readFileSync(new URL("../services/stripe/server.ts", import.meta.url), "utf8");
  assert.ok(webhook.indexOf("constructEvent") < webhook.indexOf('assertStripeRuntimeObject("Stripe webhook event"'));
  assert.ok(webhook.indexOf('assertStripeRuntimeObject("Stripe webhook event"') < webhook.indexOf("switch (event.type)"));
  assert.match(stripeServer, /assertStripeRuntimeObject\("Stripe Checkout Session fulfillment"/);
  assert.match(stripeServer, /commercialRightsGranted/);
});

test("health endpoints expose beta classification and production test helper stays blocked", () => {
  const config = readFileSync(new URL("../app/api/health/config/route.ts", import.meta.url), "utf8");
  const readiness = readFileSync(new URL("../app/api/health/readiness/route.ts", import.meta.url), "utf8");
  const helper = readFileSync(new URL("../app/api/create-checkout-session/route.ts", import.meta.url), "utf8");
  const helperPage = readFileSync(new URL("../app/test-checkout/page.tsx", import.meta.url), "utf8");
  for (const field of ["releaseMode", "paymentMode", "livePaymentsEnabled", "stripePublishableKeyMode", "stripeSecretKeyMode"]) {
    assert.match(config, new RegExp(field));
    assert.match(readiness, new RegExp(field));
  }
  assert.match(helper, /getDeploymentTarget\(\) === "production"/);
  assert.match(helperPage, /getDeploymentTarget\(\) === "production"/);
});

test("validly signed test webhook is accepted and live webhook is rejected in beta", async () => {
  assert.equal((await runWebhookRoute(false)).status, 200);
  assert.equal((await runWebhookRoute(true)).status, 400);
});

async function runWebhookRoute(livemode) {
  const source = readFileSync(new URL("../app/api/webhooks/stripe/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const routeModule = { exports: {} };
  const stripe = {
    webhooks: {
      constructEvent() {
        return { id: "evt_test_signed", type: "test.noop", livemode, data: { object: {} } };
      }
    }
  };
  const stubs = {
    "next/cache": { revalidatePath() {} },
    "next/server": { NextResponse: { json: (body, init) => Response.json(body, init) } },
    stripe: {},
    "@/lib/server-env": {
      assertStripeServerConfiguration() {},
      assertStripeRuntimeObject(_context, input) {
        return assertStripeObjectMode({ context: "webhook", paymentMode: "test", ...input });
      },
      getServerEnvironmentDiagnostics: () => ({ deploymentTarget: "production" }),
      hasStripeWebhookEnv: true,
      serverEnv: { stripeWebhookSecret: "redacted-test-fixture" }
    },
    "@/lib/monitoring": { reportOperationalError() {}, reportOperationalEvent() {} },
    "@/lib/maintenance-mode.mjs": { resolveMaintenanceMode: () => ({ blocksApplication: false }) },
    "@/services/stripe/server": {
      getStripeServerClient: () => stripe,
      markOrderCheckoutSessionPaymentFailed: async () => null,
      markOrderRefundedByPaymentIntent: async () => null,
      syncOrderFromStripeSession: async () => null
    }
  };
  vm.runInNewContext(compiled, {
    module: routeModule,
    exports: routeModule.exports,
    Response,
    Request,
    console,
    process: { env: { SYNC_EXCHANGE_MAINTENANCE_MODE: "off" } },
    require(name) {
      assert.ok(Object.hasOwn(stubs, name), `Unmocked dependency: ${name}`);
      return stubs[name];
    }
  });
  return routeModule.exports.POST(new Request("https://example.invalid/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": "verified-fixture" },
    body: "{}"
  }));
}
