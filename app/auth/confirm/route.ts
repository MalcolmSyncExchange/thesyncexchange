import { createServerClient } from "@supabase/ssr";
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
      deploymentTarget
    });
  } catch (error) {
    reportOperationalError("auth_confirm_configuration_invalid", error, {
      hasConfiguredAppUrl: Boolean(env.configuredAppUrl)
    });
    return NextResponse.json({ error: AUTH_CONFIRM_CONFIGURATION_ERROR_MESSAGE }, { status: 500 });
  }

  const successRedirectUrl = buildAuthConfirmSuccessUrl({ appOrigin, destinationPath: successRedirectPath });
  const successRedirect = new URL(successRedirectUrl);
  const authQueryParamsStripped = Boolean(code) || Boolean(tokenHash) || Boolean(type) || requestUrl.searchParams.has("next");
  const redirectWithError = (destinationPath: string, message: string) =>
    NextResponse.redirect(buildAuthConfirmErrorUrl({ appOrigin, destinationPath, message }));

  reportOperationalEvent("auth_confirm_requested", "Supabase auth confirmation route requested.", {
    hasCode: Boolean(code),
    hasTokenHash: Boolean(tokenHash),
    type: type || null,
    nextPath,
    successRedirectPath,
    successRedirectUrl,
    successRedirectHasSearchParams: Boolean(successRedirect.search),
    authQueryParamsStripped,
    recoveryFlow
  });

  if (!hasSupabaseEnv || env.demoMode) {
    return redirectWithError("/login", "Supabase authentication is not configured.");
  }

  const cookieStore = await cookies();
  const hasPkceVerifier = cookieStore.getAll().some((cookie) => cookie.name.includes("code-verifier"));
  const response = NextResponse.redirect(successRedirect);
  const supabase = createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        response.cookies.set({ name, value, ...(options as object) });
      },
      remove(name: string, options: Record<string, unknown>) {
        response.cookies.set({ name, value: "", ...(options as object) });
      }
    }
  });

  if (tokenHash && type) {
    reportOperationalEvent("auth_confirm_verify_attempted", "Supabase OTP verification attempted.", {
      hasTokenHash: true,
      type,
      nextPath,
      recoveryFlow
    });

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    });

    if (error) {
      reportOperationalError("auth_confirm_verify_failed", new Error("Supabase authentication confirmation failed."), {
        type,
        nextPath,
        recoveryFlow,
        supabaseErrorCode: error.code || null
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RESET_PASSWORD_SESSION_MISSING_MESSAGE : AUTH_CONFIRM_LINK_INVALID_MESSAGE;
      return redirectWithError(destination, safeMessage);
    }

    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    reportOperationalEvent("auth_confirm_verify_succeeded", "Supabase OTP verification succeeded.", {
      type,
      nextPath,
      successRedirectPath,
      successRedirectUrl,
      successRedirectHasSearchParams: Boolean(successRedirect.search),
      authQueryParamsStripped,
      recoveryFlow,
      hasSession: Boolean(session),
      hasUser: Boolean(session?.user),
      sessionErrorCode: sessionError?.code || null
    });

    if (recoveryFlow && (sessionError || !session)) {
      if (sessionError) {
        reportOperationalError("auth_confirm_verify_session_missing", new Error("Supabase authentication session was unavailable."), {
          type,
          nextPath,
          recoveryFlow,
          sessionErrorCode: sessionError.code || null
        });
      }

      return redirectWithError("/forgot-password", RESET_PASSWORD_SESSION_MISSING_MESSAGE);
    }

    return response;
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
      nextPath,
      recoveryFlow,
      hasPkceVerifier,
      exchangeCodeForSessionAttempted
    });

    if (!exchangeCodeForSessionAttempted) {
      reportOperationalEvent("auth_confirm_code_rejected", "Auth code link rejected because no PKCE verifier was available.", {
        type: type || null,
        nextPath,
        recoveryFlow,
        hasPkceVerifier,
        exchangeCodeForSessionAttempted: false
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE : AUTH_CODE_LINK_PKCE_MISSING_MESSAGE;
      return redirectWithError(destination, safeMessage);
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      reportOperationalError("auth_confirm_exchange_failed", new Error("Supabase authentication code exchange failed."), {
        type: type || null,
        nextPath,
        recoveryFlow,
        hasPkceVerifier,
        supabaseErrorCode: error.code || null
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE : AUTH_CONFIRM_LINK_INVALID_MESSAGE;
      return redirectWithError(destination, safeMessage);
    }

    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession();

    reportOperationalEvent("auth_confirm_exchange_succeeded", "Supabase auth code exchange succeeded.", {
      type: type || null,
      nextPath,
      successRedirectPath,
      successRedirectUrl,
      successRedirectHasSearchParams: Boolean(successRedirect.search),
      authQueryParamsStripped,
      recoveryFlow,
      hasSession: Boolean(session),
      hasUser: Boolean(session?.user),
      sessionErrorCode: sessionError?.code || null
    });

    if (recoveryFlow && (sessionError || !session)) {
      if (sessionError) {
        reportOperationalError("auth_confirm_exchange_session_missing", new Error("Supabase authentication session was unavailable."), {
          type: type || null,
          nextPath,
          recoveryFlow,
          sessionErrorCode: sessionError.code || null
        });
      }

      return redirectWithError("/forgot-password", RESET_PASSWORD_SESSION_MISSING_MESSAGE);
    }

    return response;
  }

  reportOperationalEvent("auth_confirm_invalid_link", "Supabase auth confirmation route received an incomplete or invalid link.", {
    type: type || null,
    nextPath,
    recoveryFlow
  });
  return redirectWithError("/login", AUTH_CONFIRM_LINK_INVALID_MESSAGE);
}
