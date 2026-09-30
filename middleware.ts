import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";
import { isMaintenanceHealthRequest, resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";

const protectedPrefixes = ["/artist", "/buyer", "/admin", "/onboarding", "/dashboard"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const maintenance = resolveMaintenanceMode(process.env.SYNC_EXCHANGE_MAINTENANCE_MODE);
  if (maintenance.blocksApplication) {
    if (isMaintenanceHealthRequest(pathname, request.method)) {
      const response = NextResponse.next();
      response.headers.set("Cache-Control", "private, no-store, max-age=0");
      response.headers.set("Netlify-CDN-Cache-Control", "no-store");
      return response;
    }
    const headers = {
      "Cache-Control": "private, no-store, max-age=0",
      "Netlify-CDN-Cache-Control": "no-store",
      "Retry-After": "300",
      "X-Robots-Tag": "noindex, nofollow"
    };
    if (pathname === "/api" || pathname.startsWith("/api/") || pathname.startsWith("/.netlify/functions/")) {
      return NextResponse.json({ ok: false, error: "maintenance_mode" }, { status: 503, headers });
    }
    return new NextResponse(
      "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Maintenance | The Sync Exchange</title><main style=\"font:1rem system-ui;max-width:36rem;margin:15vh auto;padding:1.5rem\"><h1>We’ll be back shortly</h1><p>The Sync Exchange is temporarily unavailable for scheduled maintenance.</p></main></html>",
      { status: 503, headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } }
    );
  }
  const needsSession = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!needsSession) {
    return NextResponse.next();
  }

  if (hasSupabaseEnv && !env.demoMode) {
    try {
      let response = NextResponse.next({
        request: {
          headers: request.headers
        }
      });

      const supabase = createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: Record<string, unknown>) {
            request.cookies.set({ name, value, ...(options as object) });
            response.cookies.set({ name, value, ...(options as object) });
          },
          remove(name: string, options: Record<string, unknown>) {
            request.cookies.set({ name, value: "", ...(options as object) });
            response.cookies.set({ name, value: "", ...(options as object) });
          }
        }
      });

      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (user) {
        return response;
      }
    } catch {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  if (env.demoMode) {
    const session = request.cookies.get("sync-exchange-session")?.value;
    if (session) {
      return NextResponse.next();
    }
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirectTo", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // All routes must pass this gate, including API routes, auth callbacks,
  // server-action POSTs, and provider function paths. The response is self-contained.
  matcher: ["/:path*"]
};
