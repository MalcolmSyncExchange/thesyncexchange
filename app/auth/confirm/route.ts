import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import {
  RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE,
  RESET_PASSWORD_SESSION_MISSING_MESSAGE,
  buildCleanRecoverySuccessUrl,
  getAuthConfirmSuccessRedirectPath,
  isRecoveryAuthFlow,
  shouldExchangeAuthCode
} from "@/services/auth/auth-flow";

function resolveSafeNextPath(rawNext: string | null, fallback: string) {
  if (rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")) {
    return rawNext;
  }

  return fallback;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") as EmailOtpType | null;
  const nextPath = resolveSafeNextPath(requestUrl.searchParams.get("next"), type === "recovery" ? "/reset-password" : "/onboarding");
  const recoveryFlow = isRecoveryAuthFlow({ type, nextPath });
  const successRedirectPath = getAuthConfirmSuccessRedirectPath({ nextPath, recoveryFlow });
  const successRedirectUrl = recoveryFlow ? buildCleanRecoverySuccessUrl(request.url) : new URL(successRedirectPath, request.url).toString();
  const successRedirect = new URL(successRedirectUrl);
  const authQueryParamsStripped = recoveryFlow && (Boolean(code) || Boolean(tokenHash) || Boolean(type) || requestUrl.searchParams.has("next"));

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
    return NextResponse.redirect(new URL("/login?error=Supabase%20authentication%20is%20not%20configured.", requestUrl.origin));
  }

  const cookieStore = cookies();
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
      reportOperationalError("auth_confirm_verify_failed", error, {
        type,
        nextPath,
        recoveryFlow,
        supabaseErrorCode: error.code || null,
        supabaseErrorMessage: error.message
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RESET_PASSWORD_SESSION_MISSING_MESSAGE : error.message;
      return NextResponse.redirect(new URL(`${destination}?error=${encodeURIComponent(safeMessage)}`, requestUrl.origin));
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
      sessionErrorCode: sessionError?.code || null,
      sessionErrorMessage: sessionError?.message || null
    });

    if (recoveryFlow && (sessionError || !session)) {
      if (sessionError) {
        reportOperationalError("auth_confirm_verify_session_missing", sessionError, {
          type,
          nextPath,
          recoveryFlow,
          sessionErrorCode: sessionError.code || null,
          sessionErrorMessage: sessionError.message
        });
      }

      return NextResponse.redirect(new URL(`/forgot-password?error=${encodeURIComponent(RESET_PASSWORD_SESSION_MISSING_MESSAGE)}`, requestUrl.origin));
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
      reportOperationalEvent("auth_confirm_recovery_code_rejected", "Recovery code link rejected because no PKCE verifier was available.", {
        type: type || null,
        nextPath,
        recoveryFlow,
        hasPkceVerifier,
        exchangeCodeForSessionAttempted: false
      });
      return NextResponse.redirect(new URL(`/forgot-password?error=${encodeURIComponent(RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE)}`, requestUrl.origin));
    }

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      reportOperationalError("auth_confirm_exchange_failed", error, {
        type: type || null,
        nextPath,
        recoveryFlow,
        hasPkceVerifier,
        supabaseErrorCode: error.code || null,
        supabaseErrorMessage: error.message
      });
      const destination = recoveryFlow ? "/forgot-password" : "/login";
      const safeMessage = recoveryFlow ? RECOVERY_CODE_LINK_UNSUPPORTED_MESSAGE : error.message;
      return NextResponse.redirect(new URL(`${destination}?error=${encodeURIComponent(safeMessage)}`, requestUrl.origin));
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
      sessionErrorCode: sessionError?.code || null,
      sessionErrorMessage: sessionError?.message || null
    });

    if (recoveryFlow && (sessionError || !session)) {
      if (sessionError) {
        reportOperationalError("auth_confirm_exchange_session_missing", sessionError, {
          type: type || null,
          nextPath,
          recoveryFlow,
          sessionErrorCode: sessionError.code || null,
          sessionErrorMessage: sessionError.message
        });
      }

      return NextResponse.redirect(new URL(`/forgot-password?error=${encodeURIComponent(RESET_PASSWORD_SESSION_MISSING_MESSAGE)}`, requestUrl.origin));
    }

    return response;
  }

  reportOperationalEvent("auth_confirm_invalid_link", "Supabase auth confirmation route received an incomplete or invalid link.", {
    type: type || null,
    nextPath,
    recoveryFlow
  });
  return NextResponse.redirect(new URL("/login?error=The%20confirmation%20link%20is%20invalid%20or%20expired.", requestUrl.origin));
}
