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
  buildRecoveryConfirmPath,
  canUpdatePasswordWithSession,
  getAuthConfirmSuccessRedirectPath,
  getMissingLoginAccountMessage,
  getResetPasswordRecoveryRoutingDecision,
  isRecoveryAuthFlow,
  normalizeAuthEmail,
  requestPasswordResetEmail,
  resolveAuthMode,
  shouldExchangeAuthCode,
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

test("recovery code is routed through auth confirm before showing reset form", () => {
  const path = buildRecoveryConfirmPath({
    code: "recovery-code",
    type: "recovery",
    nextPath: "/reset-password"
  });

  assert.equal(path, "/auth/confirm?code=recovery-code&type=recovery&next=%2Freset-password");
});

test("recovery token hash is routed through auth confirm before showing reset form", () => {
  const path = buildRecoveryConfirmPath({
    tokenHash: "token-hash",
    type: "recovery",
    nextPath: "/reset-password"
  });

  assert.equal(path, "/auth/confirm?token_hash=token-hash&type=recovery&next=%2Freset-password");
});

test("recovery auth flow is detected from type or reset-password next path", () => {
  assert.equal(isRecoveryAuthFlow({ type: "recovery", nextPath: "/onboarding" }), true);
  assert.equal(isRecoveryAuthFlow({ type: null, nextPath: "/reset-password" }), true);
  assert.equal(isRecoveryAuthFlow({ type: "signup", nextPath: "/onboarding" }), false);
});

test("recovery code exchange is skipped without a PKCE verifier", () => {
  assert.equal(
    shouldExchangeAuthCode({
      hasCode: true,
      hasTokenHash: false,
      isRecoveryFlow: true,
      hasPkceVerifier: false
    }),
    false
  );
});

test("recovery code exchange is allowed only when the PKCE verifier exists", () => {
  assert.equal(
    shouldExchangeAuthCode({
      hasCode: true,
      hasTokenHash: false,
      isRecoveryFlow: true,
      hasPkceVerifier: true
    }),
    true
  );
});

test("non-recovery auth code exchange remains enabled", () => {
  assert.equal(
    shouldExchangeAuthCode({
      hasCode: true,
      hasTokenHash: false,
      isRecoveryFlow: false,
      hasPkceVerifier: false
    }),
    true
  );
});

test("token hash verification takes precedence over code exchange", () => {
  assert.equal(
    shouldExchangeAuthCode({
      hasCode: true,
      hasTokenHash: true,
      isRecoveryFlow: true,
      hasPkceVerifier: true
    }),
    false
  );
});

test("successful recovery confirmation redirects to clean reset password URL", () => {
  assert.equal(
    getAuthConfirmSuccessRedirectPath({
      nextPath: "/reset-password?token_hash=used-token&type=recovery&next=/reset-password",
      recoveryFlow: true
    }),
    "/reset-password"
  );
});

test("non-recovery confirmation preserves safe next path", () => {
  assert.equal(
    getAuthConfirmSuccessRedirectPath({
      nextPath: "/onboarding",
      recoveryFlow: false
    }),
    "/onboarding"
  );
});

test("reset password with session and token hash cleans URL instead of reverifying", () => {
  assert.equal(
    getResetPasswordRecoveryRoutingDecision({
      hasAuthParams: true,
      hasSession: true
    }),
    "clean-url"
  );
});

test("reset password without session routes auth params through confirmation", () => {
  assert.equal(
    getResetPasswordRecoveryRoutingDecision({
      hasAuthParams: true,
      hasSession: false
    }),
    "confirm"
  );
});

test("reset password without auth params renders form", () => {
  assert.equal(
    getResetPasswordRecoveryRoutingDecision({
      hasAuthParams: false,
      hasSession: true
    }),
    "render"
  );
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

test("updateUser is blocked without a recovery session", () => {
  assert.equal(canUpdatePasswordWithSession(false), false);
  assert.equal(canUpdatePasswordWithSession(true), true);
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
