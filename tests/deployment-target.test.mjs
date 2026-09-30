import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import vm from "node:vm";
import ts from "typescript";
import { resolveDeploymentTarget } from "../lib/deployment-target.mjs";
import * as paymentMode from "../lib/payment-mode.mjs";

const root = new URL("../", import.meta.url);
const envSource = readFileSync(new URL("../lib/env.ts", import.meta.url), "utf8");
const serverEnvSource = readFileSync(new URL("../lib/server-env.ts", import.meta.url), "utf8");

function loadAppEnv(variables, buildTarget) {
  // Model Next's DefinePlugin replacement, then run the actual application resolver.
  const source = buildTarget === undefined ? envSource : envSource.replaceAll(
    "process.env.TSE_BUILD_DEPLOYMENT_TARGET", JSON.stringify(buildTarget)
  );
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports, process: { env: variables }, URL,
    require: (name) => {
      assert.equal(name, "./deployment-target.mjs");
      return { resolveDeploymentTarget };
    }
  });
  return exports;
}

function loadServerEnv(variables, deploymentTarget = "preview") {
  const exports = {};
  const publicEnv = { stripePublishableKey: variables.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY };
  vm.runInNewContext(ts.transpileModule(serverEnvSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText, {
    exports,
    process: { env: variables },
    require: (name) => {
      if (name === "@/lib/payment-mode.mjs") return paymentMode;
      assert.equal(name, "@/lib/env");
      return {
        env: publicEnv,
        getDeploymentTarget: () => deploymentTarget,
        getPublicEnvironmentDiagnostics: () => ({ deploymentTarget, issues: [], errors: [], warnings: [] })
      };
    }
  });
  return exports;
}

function validateStripeEnvironment({ context, secretKey, publishableKey, paymentMode: configuredPaymentMode }) {
  return spawnSync(process.execPath, ["scripts/validate-env.mjs"], {
    cwd: root,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NETLIFY: "true",
      CONTEXT: context,
      NEXT_PUBLIC_APP_URL: "https://example.invalid",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_example",
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
      STRIPE_SECRET_KEY: secretKey,
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: publishableKey,
      SYNC_EXCHANGE_PAYMENT_MODE: configuredPaymentMode
    }
  });
}

function buildConfig(variables, phase = "phase-production-build") {
  const environment = { ...process.env };
  for (const key of ["CONTEXT", "VERCEL_ENV", "NETLIFY", "SITE_ID", "VERCEL", "TSE_BUILD_DEPLOYMENT_TARGET"]) delete environment[key];
  return JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e",
    `const {default: config} = await import("./next.config.mjs"); console.log(JSON.stringify(config(${JSON.stringify(phase)}).env));`
  ], { cwd: root, env: { ...environment, ...variables }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
}

test("Netlify production, staging, feature branches and PR previews resolve by context", () => {
  assert.equal(resolveDeploymentTarget({ NETLIFY: "true", CONTEXT: "production" }), "production");
  for (const branch of ["staging", "security/rate-limit-foundation", "any-other-branch"]) {
    assert.equal(resolveDeploymentTarget({ NETLIFY: "true", CONTEXT: "branch-deploy", BRANCH: branch }), "preview");
  }
  assert.equal(resolveDeploymentTarget({ NETLIFY: "true", CONTEXT: "deploy-preview" }), "preview");
});

test("true local dev and local production builds remain local", () => {
  assert.equal(resolveDeploymentTarget({}), "local");
  assert.equal(resolveDeploymentTarget({ NODE_ENV: "production" }), "local");
  assert.equal(resolveDeploymentTarget({ NETLIFY: "true", SITE_ID: "local-linked-site", CONTEXT: "dev" }), "local");
});

test("Vercel production, preview and development remain supported", () => {
  for (const [value, expected] of [["production", "production"], ["preview", "preview"], ["development", "local"]]) {
    assert.equal(resolveDeploymentTarget({ VERCEL: "1", VERCEL_ENV: value }), expected);
  }
});

test("Next config embeds only a non-secret target, ignoring an externally supplied build stamp", () => {
  assert.deepEqual(buildConfig({ CONTEXT: "branch-deploy", TSE_BUILD_DEPLOYMENT_TARGET: "production" }), {
    TSE_BUILD_DEPLOYMENT_TARGET: "preview"
  });
  assert.deepEqual(buildConfig({ CONTEXT: "production" }), { TSE_BUILD_DEPLOYMENT_TARGET: "production" });
  assert.deepEqual(buildConfig({}), { TSE_BUILD_DEPLOYMENT_TARGET: "local" });
});

test("actual application keeps the built preview/production target when runtime CONTEXT disappears", () => {
  for (const context of ["production", "branch-deploy", "deploy-preview"]) {
    const config = buildConfig({ NETLIFY: "true", CONTEXT: context });
    const expected = context === "production" ? "production" : "preview";
    const app = loadAppEnv({ SITE_ID: "netlify-site", SITE_NAME: "cozy-kitsune-7ea8b4", URL: "https://thesyncexchange.com" }, config.TSE_BUILD_DEPLOYMENT_TARGET);
    assert.equal(app.getDeploymentTarget(), expected);
    assert.equal(app.getPublicEnvironmentDiagnostics().deploymentTarget, expected);
  }
});

test("browser bundle agrees with the build without runtime platform variables", () => {
  assert.equal(loadAppEnv({}, "preview").getDeploymentTarget(), "preview");
  assert.equal(loadAppEnv({}, "production").getDeploymentTarget(), "production");
});

test("production server startup does not recalculate the compiled build target", () => {
  assert.deepEqual(buildConfig({ SITE_ID: "netlify-runtime-site" }, "phase-production-server"), {});
  assert.equal(loadAppEnv({ SITE_ID: "netlify-runtime-site" }, "preview").getDeploymentTarget(), "preview");
});

test("contradictory provider, build or runtime targets fail closed", () => {
  for (const [variables, stamp] of [
    [{ CONTEXT: "branch-deploy", VERCEL_ENV: "production" }, undefined],
    [{ CONTEXT: "production" }, "preview"],
    [{ CONTEXT: "branch-deploy" }, "production"],
    [{ CONTEXT: "dev" }, "preview"],
    [{ CONTEXT: "production", VERCEL_ENV: "development" }, undefined]
  ]) assert.throws(() => resolveDeploymentTarget(variables, stamp), /Deployment context/);
  assert.throws(() => loadAppEnv({ CONTEXT: "production" }, "preview").getDeploymentTarget(), /Deployment context/);
});

test("invalid contexts and malformed build targets fail rather than becoming local", () => {
  for (const value of ["staging", "unknown", "Production", "__proto__", "toString", " "]) {
    assert.throws(() => resolveDeploymentTarget({ CONTEXT: value }), /Deployment context/);
    assert.throws(() => resolveDeploymentTarget({ VERCEL_ENV: value }), /Deployment context/);
    assert.throws(() => resolveDeploymentTarget({}, value), /Deployment context/);
  }
});

test("identifiable hosted execution cannot silently fall back to local", () => {
  for (const variables of [{ NETLIFY: "true" }, { SITE_ID: "site-id" }, { VERCEL: "1" }]) {
    assert.throws(() => resolveDeploymentTarget(variables), /Deployment context/);
    assert.throws(() => resolveDeploymentTarget(variables, "local"), /Deployment context/);
    assert.equal(resolveDeploymentTarget(variables, "preview"), "preview");
  }
});

test("invalid or missing hosted build contexts stop Next configuration", () => {
  for (const variables of [{ NETLIFY: "true" }, { CONTEXT: "unknown" }, { CONTEXT: "production", VERCEL_ENV: "preview" }]) {
    assert.throws(() => buildConfig(variables));
  }
});

test("URLs, branch names and request headers never select the trust context", () => {
  const variables = {
    BRANCH: "main", URL: "https://thesyncexchange.com", DEPLOY_PRIME_URL: "https://staging--example.netlify.app",
    NEXT_PUBLIC_APP_URL: "https://thesyncexchange.com", HOST: "thesyncexchange.com", HTTP_HOST: "thesyncexchange.com"
  };
  assert.equal(resolveDeploymentTarget(variables), "local");
  assert.equal(resolveDeploymentTarget(variables, "preview"), "preview");
});

test("environment CLI validation uses the same resolver", () => {
  const source = readFileSync(new URL("../scripts/validate-env.mjs", import.meta.url), "utf8");
  assert.match(source, /import \{ resolveDeploymentTarget \} from "\.\.\/lib\/deployment-target\.mjs"/);
  assert.match(source, /const deploymentTarget = resolveDeploymentTarget\(process.env\)/);
  assert.doesNotMatch(source, /function getDeploymentTarget/);
});

test("Stripe diagnostics recognize standard and restricted key modes without widening publishable keys", () => {
  const diagnostics = loadServerEnv({});
  for (const prefix of ["sk", "rk"]) {
    assert.equal(diagnostics.getStripeKeyMode(`${prefix}_test_example`, "sk"), "test");
    assert.equal(diagnostics.getStripeKeyMode(`${prefix}_live_example`, "sk"), "live");
  }
  assert.equal(diagnostics.getStripeKeyMode("pk_test_example", "pk"), "test");
  assert.equal(diagnostics.getStripeKeyMode("pk_live_example", "pk"), "live");
  assert.equal(diagnostics.getStripeKeyMode("rk_test_example", "pk"), "unknown");
  assert.equal(diagnostics.getStripeKeyMode("pk_test_example", "sk"), "unknown");
  assert.equal(diagnostics.getStripeKeyMode("rk_other_example", "sk"), "unknown");
  assert.equal(diagnostics.getStripeKeyMode(undefined, "sk"), "missing");
});

test("restricted test keys preserve fail-closed production mismatch detection", () => {
  const diagnostics = loadServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
    STRIPE_SECRET_KEY: "rk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    SYNC_EXCHANGE_PAYMENT_MODE: "test"
  }, "production");
  const result = diagnostics.getServerEnvironmentDiagnostics();
  assert.equal(result.stripe.secretKeyMode, "test");
  assert.equal(result.stripe.publishableKeyMode, "live");
  assert.equal(result.stripe.modesMatch, false);
  assert.deepEqual(Array.from(result.errors, (issue) => issue.code), ["stripe_key_mode_mismatch", "stripe_payment_mode_mismatch"]);
  assert.throws(() => diagnostics.assertStripeServerConfiguration("Checkout"), /mixing test\/live modes/);
});

test("matching restricted Stripe modes remain valid in their intended deployment targets", () => {
  const live = loadServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
    STRIPE_SECRET_KEY: "rk_live_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_example",
    SYNC_EXCHANGE_PAYMENT_MODE: "live"
  }, "production").getServerEnvironmentDiagnostics();
  assert.equal(live.stripe.modesMatch, true);
  assert.equal(live.errors.length, 0);

  const testMode = loadServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
    STRIPE_SECRET_KEY: "rk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    SYNC_EXCHANGE_PAYMENT_MODE: "test"
  }, "preview").getServerEnvironmentDiagnostics();
  assert.equal(testMode.stripe.modesMatch, true);
  assert.equal(testMode.errors.length, 0);
});

test("environment CLI rejects restricted test keys in production and accepts matching modes", () => {
  const mismatch = validateStripeEnvironment({
    context: "production",
    secretKey: "rk_test_example",
    publishableKey: "pk_live_example",
    paymentMode: "test"
  });
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /mixing test\/live modes/);
  assert.match(mismatch.stderr, /configured test payment mode/);

  const production = validateStripeEnvironment({
    context: "production",
    secretKey: "rk_live_example",
    publishableKey: "pk_live_example",
    paymentMode: "live"
  });
  assert.equal(production.status, 0, production.stderr);

  const preview = validateStripeEnvironment({
    context: "deploy-preview",
    secretKey: "rk_test_example",
    publishableKey: "pk_test_example",
    paymentMode: "test"
  });
  assert.equal(preview.status, 0, preview.stderr);
});

test("production beta accepts only explicit test mode with matching test keys", () => {
  const accepted = loadServerEnv({
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
    STRIPE_SECRET_KEY: "rk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    SYNC_EXCHANGE_PAYMENT_MODE: "test"
  }, "production").getServerEnvironmentDiagnostics();
  assert.equal(accepted.errors.length, 0);
  assert.equal(accepted.paymentMode, "test");
  assert.equal(accepted.releaseMode, "production_beta");
  assert.equal(accepted.livePaymentsEnabled, false);

  for (const value of [undefined, "unknown"]) {
    const rejected = loadServerEnv({
      SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
      STRIPE_SECRET_KEY: "rk_test_example",
      STRIPE_WEBHOOK_SECRET: "whsec_example",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
      SYNC_EXCHANGE_PAYMENT_MODE: value
    }, "production").getServerEnvironmentDiagnostics();
    assert.ok(rejected.errors.some((issue) => ["missing_payment_mode", "invalid_payment_mode"].includes(issue.code)));
  }
});

test("billing portal is explicit, fail closed, and always disabled in production beta", () => {
  const base = {
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_example",
    STRIPE_SECRET_KEY: "rk_test_example",
    STRIPE_WEBHOOK_SECRET: "whsec_example",
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_example",
    SYNC_EXCHANGE_PAYMENT_MODE: "test"
  };

  for (const [value, flagState, reason] of [
    [undefined, "missing", "not_enabled"],
    ["false", "disabled", "not_enabled"],
    ["yes", "invalid", "invalid_flag"]
  ]) {
    const configuration = loadServerEnv({
      ...base,
      SYNC_EXCHANGE_BILLING_PORTAL_ENABLED: value
    }, "preview").getBillingPortalRuntimeConfiguration();
    assert.equal(configuration.enabled, false);
    assert.equal(configuration.flagState, flagState);
    assert.equal(configuration.reason, reason);
  }

  const preview = loadServerEnv({
    ...base,
    SYNC_EXCHANGE_BILLING_PORTAL_ENABLED: "true"
  }, "preview").getBillingPortalRuntimeConfiguration();
  assert.equal(preview.enabled, true);
  assert.equal(preview.reason, "enabled");

  const productionBeta = loadServerEnv({
    ...base,
    SYNC_EXCHANGE_BILLING_PORTAL_ENABLED: "true"
  }, "production").getBillingPortalRuntimeConfiguration();
  assert.equal(productionBeta.enabled, false);
  assert.equal(productionBeta.releaseMode, "production_beta");
  assert.equal(productionBeta.reason, "production_beta");
});
