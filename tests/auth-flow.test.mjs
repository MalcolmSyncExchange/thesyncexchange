import test from "node:test";
import assert from "node:assert/strict";

import { resolveDemoMode } from "../lib/env.ts";
import {
  DEMO_ACCOUNT_NOT_FOUND_MESSAGE,
  SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE,
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
  buildAuthCallbackRedirectUrl,
  buildPasswordResetRedirectUrl,
  getMissingLoginAccountMessage,
  normalizeAuthEmail,
  requestPasswordResetEmail,
  resolveAuthMode,
  shouldRequestSupabasePasswordReset
} from "../services/auth/auth-flow.ts";

test("demo mode is enabled only when SYNC_EXCHANGE_DEMO_MODE is exactly true", () => {
  assert.equal(resolveDemoMode("true"), true);
  assert.equal(resolveDemoMode(" true "), false);
  assert.equal(resolveDemoMode("True"), false);
});

test("common false-like demo mode values do not enable demo mode", () => {
  for (const value of [undefined, "", "false", "False", "FALSE", "0", "off", "no"]) {
    assert.equal(resolveDemoMode(value), false, `${String(value)} should not enable demo mode`);
  }
});

test("login email is normalized before authentication", () => {
  assert.equal(normalizeAuthEmail("  BuyerTest@TheSyncExchange.com  "), "buyertest@thesyncexchange.com");
});

test("demo account error is only selected in explicit demo mode", () => {
  assert.equal(getMissingLoginAccountMessage("demo"), DEMO_ACCOUNT_NOT_FOUND_MESSAGE);
  assert.equal(getMissingLoginAccountMessage("misconfigured"), SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE);
});

test("forgot password uses Supabase when live auth is configured and demo mode is false", () => {
  const authMode = resolveAuthMode({ hasSupabaseEnv: true, demoMode: false });

  assert.equal(authMode, "supabase");
  assert.equal(shouldRequestSupabasePasswordReset(authMode), true);
});

test("missing Supabase env is misconfigured instead of implicit demo mode", () => {
  const authMode = resolveAuthMode({ hasSupabaseEnv: false, demoMode: false });

  assert.equal(authMode, "misconfigured");
  assert.equal(getMissingLoginAccountMessage(authMode), SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE);
});

test("forgot password does not call Supabase in explicit demo mode", () => {
  const authMode = resolveAuthMode({ hasSupabaseEnv: true, demoMode: true });

  assert.equal(authMode, "demo");
  assert.equal(shouldRequestSupabasePasswordReset(authMode), false);
});

test("password reset redirect points directly to reset password through the production app URL", () => {
  const redirectUrl = buildPasswordResetRedirectUrl({
    configuredAppUrl: "https://thesyncexchange.com",
    deploymentTarget: "production",
    requestOrigin: null
  });
  const parsed = new URL(redirectUrl);

  assert.equal(parsed.origin, "https://thesyncexchange.com");
  assert.equal(parsed.pathname, "/reset-password");
});

test("auth callback redirect still points through auth confirmation when requested", () => {
  const redirectUrl = buildAuthCallbackRedirectUrl({
    appUrl: "https://thesyncexchange.com",
    deploymentTarget: "production",
    nextPath: "/onboarding"
  });
  const parsed = new URL(redirectUrl);

  assert.equal(parsed.pathname, "/auth/confirm");
  assert.equal(parsed.searchParams.get("next"), "/onboarding");
});

test("password reset redirect can fall back to request origin outside production", () => {
  const redirectUrl = buildPasswordResetRedirectUrl({
    configuredAppUrl: null,
    requestOrigin: "https://preview.thesyncexchange.com",
    deploymentTarget: "preview"
  });

  assert.equal(redirectUrl, "https://preview.thesyncexchange.com/reset-password");
});

test("localhost password reset redirect is rejected in production", () => {
  assert.throws(
    () =>
      buildPasswordResetRedirectUrl({
        configuredAppUrl: null,
        requestOrigin: "http://127.0.0.1:3000",
        deploymentTarget: "production"
      }),
    /localhost in production/
  );
});

test("forgot password calls resetPasswordForEmail when demo mode is false", async () => {
  const calls = [];
  const state = await requestPasswordResetEmail({
    authMode: "supabase",
    email: "buyertest@thesyncexchange.com",
    emailDomain: "thesyncexchange.com",
    redirectTo: "https://thesyncexchange.com/reset-password",
    supabase: {
      auth: {
        async resetPasswordForEmail(email, options) {
          calls.push({ email, options });
          return { data: {}, error: null };
        }
      }
    },
    logEvent() {},
    logError() {}
  });

  assert.deepEqual(calls, [
    {
      email: "buyertest@thesyncexchange.com",
      options: { redirectTo: "https://thesyncexchange.com/reset-password" }
    }
  ]);
  assert.deepEqual(state, {
    status: "success",
    message: FORGOT_PASSWORD_SUCCESS_MESSAGE,
    email: "buyertest@thesyncexchange.com"
  });
});

test("forgot password success returns state instead of NEXT_REDIRECT", async () => {
  const state = await requestPasswordResetEmail({
    authMode: "supabase",
    email: "buyertest@thesyncexchange.com",
    emailDomain: "thesyncexchange.com",
    redirectTo: "https://thesyncexchange.com/reset-password",
    supabase: {
      auth: {
        async resetPasswordForEmail() {
          return { data: {}, error: null };
        }
      }
    },
    logEvent() {},
    logError() {}
  });

  assert.equal(state.status, "success");
  assert.equal(state.message.includes("NEXT_REDIRECT"), false);
});

test("forgot password config errors are safe user-facing states", async () => {
  const state = await requestPasswordResetEmail({
    authMode: "misconfigured",
    email: "buyertest@thesyncexchange.com",
    emailDomain: "thesyncexchange.com",
    redirectTo: "https://thesyncexchange.com/reset-password",
    logEvent() {},
    logError() {}
  });

  assert.deepEqual(state, {
    status: "error",
    message: FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
    email: "buyertest@thesyncexchange.com"
  });
});
