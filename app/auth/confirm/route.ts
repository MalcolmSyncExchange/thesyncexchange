import { isDedicatedStagingIdentity } from "@/lib/health/payment-readiness";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { authAttempt, authFetch } from "@/services/auth/security";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env, getDeploymentTarget, hasSupabaseEnv } from "@/lib/env";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import {
  AUTH_CODE_LINK_PKCE_MISSING_MESSAGE,
  AUTH_CONFIRM_CONFIGURATION_ERROR_MESSAGE,
  AUTH_CONFIRM_LINK_INVALID_MESSAGE,
  RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE,
  RESET_PASSWORD_SESSION_MISSING_MESSAGE,
  buildAuthConfirmErrorUrl,
  buildAuthConfirmSuccessUrl,
  getAuthConfirmSuccessRedirectPath,
  isRecoveryAuthFlow,
  resolveConfiguredAuthAppOrigin,
  resolveSafeNextPath,
  shouldExchangeAuthCode
} from "@/services/auth/auth-flow";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPath = resolveSafeNextPath(requestUrl.searchParams.get("next"), type === "recovery" ? "/reset-password" : "/onboarding");
  const recoveryFlow = isRecoveryAuthFlow({ type, nextPath });
  const successRedirectPath = getAuthConfirmSuccessRedirectPath({ nextPath, recoveryFlow });
  let appOrigin: string;

  try {
    const deploymentTarget = getDeploymentTarget();
    appOrigin = resolveConfiguredAuthAppOrigin({
      configuredAppUrl: env.configuredAppUrl || (deploymentTarget === "local" ? env.appUrl : undefined),
      deploymentTarget,
      dedicatedStagingIdentityVerified: isDedicatedStagingIdentity({
        ...process.env,
        TSE_BUILD_NETLIFY_SITE_ID: process.env.TSE_BUILD_NETLIFY_SITE_ID,
        NEXT_PUBLIC_APP_URL: env.appUrl,
        NEXT_PUBLIC_SUPABASE_URL: env.supabaseUrl,
        NEXT_PUBLIC_SUPABASE_ANON_KEY: env.supabaseAnonKey
      }, deploymentTarget)
    });
  } catch (error) {
    reportOperationalError("auth_confirm_configuration_invalid", error, {
      hasConfiguredAppUrl: Boolean(env.configuredAppUrl)
    });
    return NextResponse.json({ error: AUTH_CONFIRM_CONFIGURATION_ERROR_MESSAGE }, { status: 500, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
  }

  const successRedirectUrl = buildAuthConfirmSuccessUrl({ appOrigin, destinationPath: successRedirectPath });
  const successRedirect = new URL(successRedirectUrl);
  const authQueryParamsStripped = Boolean(code) || Boolean(tokenHash) || Boolean(type) || requestUrl.searchParams.has("next");
  const cookieWrites = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const secure = (response: NextResponse) => {
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Netlify-CDN-Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    for (const { name, value, options } of cookieWrites.values()) response.cookies.set(name, value, options);
    return response;
  };
  const redirectWithError = (destinationPath: string, message: string) =>
    secure(NextResponse.redirect(buildAuthConfirmErrorUrl({ appOrigin, destinationPath, message })));
  if ((type && !["signup", "invite", "magiclink", "email", "email_change", "recovery"].includes(type)) ||
      (code && code.length > 2048) || (tokenHash && tokenHash.length > 2048) || (code && tokenHash)) {
    return redirectWithError(recoveryFlow ? "/forgot-password" : "/login", AUTH_CONFIRM_LINK_INVALID_MESSAGE);
  }

  reportOperationalEvent("auth_confirm_requested", "Supabase auth confirmation route requested.", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type: type || null,
    nextPath: new URL(nextPath, appOrigin).pathname,
    successRedirectPath,
    successRedirectUrl: successRedirect.pathname,
    successRedirectHasSearchParams: Boolean(successRedirect.search),
    authQueryParamsStripped,
    recoveryFlow
  });

  if (!hasSupabaseEnv || env.demoMode) {
    return redirectWithError("/login", "Supabase authentication is not configured.");
  }

  const cookieStore = await cookies();
  const hasPkceVerifier = cookieStore.getAll().some((cookie) => cookie.name.includes("code-verifier"));
  const response = secure(NextResponse.redirect(successRedirect));
  const values = new Map(cookieStore.getAll().map(c => [c.name, c.value]));
  const supabase = createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookieOptions: { path: "/", sameSite: "lax", secure: getDeploymentTarget() !== "local" },
    global: { fetch: authFetch },
    cookies: {
      getAll: () => Array.from(values, ([name, value]) => ({ name, value })),
      setAll(writes: { name: string; value: string; options: CookieOptions }[]) {
        for (const write of writes) {
          values.set(write.name, write.value); cookieWrites.set(write.name, write);
          response.cookies.set(write.name, write.value, write.options);
        }
      }
    }
  });

  if (tokenHash && type) {
    reportOperationalEvent("auth_confirm_verify_attempted", "Supabase OTP verification attempted.", {
      hasTokenHash: true,
      type,
      nextPath: new URL(nextPath, appOrigin).pathname,
      recoveryFlow
    });

    const { error } = await authAttempt(() => supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    }));

    if (error) {
      reportOperationalError("auth_confirm_verify_failed", new Error("Supabase authentication confirmation failed."), {
        type,
        nextPath: new URL(nextPath, appOrigin).pathname,
        recoveryFlow,
        supabaseErrorCode: error.code || null
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RESET_PASSWORD_SESSION_MISSING_MESSAGE : AUTH_CONFIRM_LINK_INVALID_MESSAGE;
      return redirectWithError(destination, safeMessage);
    }

    const sessionResult = await authAttempt(() => supabase.auth.getSession());
    const session = sessionResult.data?.session || null;
    const sessionError = sessionResult.error;

    reportOperationalEvent("auth_confirm_verify_succeeded", "Supabase OTP verification succeeded.", {
      type,
      nextPath: new URL(nextPath, appOrigin).pathname,
      successRedirectPath,
      successRedirectUrl: successRedirect.pathname,
      successRedirectHasSearchParams: Boolean(successRedirect.search),
      authQueryParamsStripped,
      recoveryFlow,
      hasSession: Boolean(session),
      hasUser: Boolean(session?.user),
      sessionErrorCode: sessionError?.code || null
    });

    const verifiedUser = await authAttempt(() => supabase.auth.getUser());
    if (recoveryFlow && (sessionError || !session || verifiedUser.error || !verifiedUser.data?.user)) {
      if (sessionError) {
        reportOperationalError("auth_confirm_verify_session_missing", new Error("Supabase authentication session was unavailable."), {
          type,
          nextPath: new URL(nextPath, appOrigin).pathname,
          recoveryFlow,
          sessionErrorCode: sessionError.code || null
        });
      }

      return redirectWithError("/forgot-password", RESET_PASSWORD_SESSION_MISSING_MESSAGE);
    }

    return secure(response);
  }

  if (code) {
    const exchangeCodeForSessionAttempted = shouldExchangeAuthCode({
      hasCode: true,
      hasTokenHash: Boolean(tokenHash),
      isRecoveryFlow: recoveryFlow,
      hasPkceVerifier
    });

    reportOperationalEvent("auth_confirm_code_received", "Supabase auth code received by confirmation route.", {
      hasCode: true,
      hasTokenHash: Boolean(tokenHash),
      type: type || null,
      nextPath: new URL(nextPath, appOrigin).pathname,
      recoveryFlow,
      hasPkceVerifier,
      exchangeCodeForSessionAttempted
    });

    if (!exchangeCodeForSessionAttempted) {
      reportOperationalEvent("auth_confirm_code_rejected", "Auth code link rejected because no PKCE verifier was available.", {
        type: type || null,
        nextPath: new URL(nextPath, appOrigin).pathname,
        recoveryFlow,
        hasPkceVerifier,
        exchangeCodeForSessionAttempted: false
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE : AUTH_CODE_LINK_PKCE_MISSING_MESSAGE;
      return redirectWithError(destination, safeMessage);
    }

    const { error } = await authAttempt(() => supabase.auth.exchangeCodeForSession(code));

    if (error) {
      reportOperationalError("auth_confirm_exchange_failed", new Error("Supabase authentication code exchange failed."), {
        type: type || null,
        nextPath: new URL(nextPath, appOrigin).pathname,
        recoveryFlow,
        hasPkceVerifier,
        supabaseErrorCode: error.code || null
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE : AUTH_CONFIRM_LINK_INVALID_MESSAGE;
      return redirectWithError(destination, safeMessage);
    }

    const sessionResult = await authAttempt(() => supabase.auth.getSession());
    const session = sessionResult.data?.session || null;
    const sessionError = sessionResult.error;

    reportOperationalEvent("auth_confirm_exchange_succeeded", "Supabase auth code exchange succeeded.", {
      type: type || null,
      nextPath: new URL(nextPath, appOrigin).pathname,
      successRedirectPath,
      successRedirectUrl: successRedirect.pathname,
      successRedirectHasSearchParams: Boolean(successRedirect.search),
      authQueryParamsStripped,
      recoveryFlow,
      hasSession: Boolean(session),
      hasUser: Boolean(session?.user),
      sessionErrorCode: sessionError?.code || null
    });

    const verifiedUser = await authAttempt(() => supabase.auth.getUser());
    if (recoveryFlow && (sessionError || !session || verifiedUser.error || !verifiedUser.data?.user)) {
      if (sessionError) {
        reportOperationalError("auth_confirm_exchange_session_missing", new Error("Supabase authentication session was unavailable."), {
          type: type || null,
          nextPath: new URL(nextPath, appOrigin).pathname,
          recoveryFlow,
          sessionErrorCode: sessionError.code || null
        });
      }

      return redirectWithError("/forgot-password", RESET_PASSWORD_SESSION_MISSING_MESSAGE);
    }

    return secure(response);
  }

  reportOperationalEvent("auth_confirm_invalid_link", "Supabase auth confirmation route received an incomplete or invalid link.", {
    type: type || null,
    nextPath: new URL(nextPath, appOrigin).pathname,
    recoveryFlow
  });
  return redirectWithError("/login", AUTH_CONFIRM_LINK_INVALID_MESSAGE);
}
