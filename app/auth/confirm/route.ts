import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";

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

  if (!hasSupabaseEnv || env.demoMode) {
    return NextResponse.redirect(new URL("/login?error=Supabase%20authentication%20is%20not%20configured.", requestUrl.origin));
  }

  const cookieStore = cookies();
  const response = NextResponse.redirect(new URL(nextPath, requestUrl.origin));
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

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
    }

    return response;
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash
    });

    if (error) {
      const destination = type === "recovery" ? "/forgot-password" : "/login";
      return NextResponse.redirect(new URL(`${destination}?error=${encodeURIComponent(error.message)}`, requestUrl.origin));
    }

    return response;
  }

  return NextResponse.redirect(new URL("/login?error=The%20confirmation%20link%20is%20invalid%20or%20expired.", requestUrl.origin));
}
