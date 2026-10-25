import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { authFetch } from "@/services/auth/security";
import { NextResponse, type NextRequest } from "next/server";

import { env, getDeploymentTarget, hasSupabaseEnv } from "@/lib/env";
import { isMaintenanceHealthRequest, resolveMaintenanceMode } from "@/lib/maintenance-mode.mjs";

const protectedPrefixes = ["/artist", "/buyer", "/admin", "/onboarding", "/dashboard", "/account"];
const matches = (path: string, prefix: string) => path === prefix || path.startsWith(prefix + "/");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Do not overwrite route-owned sandbox/CSP policies on private documents.
  const pagePolicy = (result:NextResponse) => {
    if (!matches(pathname,"/api") && !matches(pathname,"/.netlify/functions")) {
      result.headers.set("Content-Security-Policy", "base-uri 'self'; object-src 'none'; frame-ancestors 'none'");
      result.headers.set("Referrer-Policy", "no-referrer");
    }
    return result;
  };
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
  const needsSession = protectedPrefixes.some(prefix => matches(pathname, prefix));
  const refreshAuth = needsSession || ["/login", "/signup", "/forgot-password", "/reset-password", "/auth"].some(prefix => matches(pathname, prefix));
  if (!refreshAuth) return pagePolicy(NextResponse.next());
  let response = NextResponse.next({ request });
  const pendingCookies = new Map<string, { name: string; value: string; options: CookieOptions }>();
  const privateResponse = (result: NextResponse) => {
    result.headers.set("Cache-Control", "private, no-store, max-age=0");
    result.headers.set("Netlify-CDN-Cache-Control", "no-store");
    result.headers.set("Referrer-Policy", "no-referrer");
    return pagePolicy(result);
  };
  const login = () => {
    const url = new URL("/login", request.url);
    url.searchParams.set("redirectTo", pathname + request.nextUrl.search);
    const denied = NextResponse.redirect(url);
    for (const cookie of response.cookies.getAll()) denied.cookies.set(cookie);
    denied.headers.set("Cache-Control", "private, no-store");
    return privateResponse(denied);
  };
  if (hasSupabaseEnv && !env.demoMode) {
    try {
      const supabase = createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
        cookieOptions: { path: "/", sameSite: "lax", secure: getDeploymentTarget() !== "local" },
        global: { fetch: authFetch },
        cookies: {
          getAll: () => request.cookies.getAll(),
          setAll(writes: { name: string; value: string; options: CookieOptions }[]) {
            for (const write of writes) {
              request.cookies.set(write.name, write.value);
              pendingCookies.set(write.name, write);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of pendingCookies.values()) response.cookies.set(name, value, options);
          }
        }
      });
      const { data: { user }, error } = await supabase.auth.getUser();
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Netlify-CDN-Cache-Control", "no-store");
      return !needsSession || (!error && user) ? privateResponse(response) : login();
    } catch { return needsSession ? login() : privateResponse(response); }
  }
  if (env.demoMode && request.cookies.get("sync-exchange-session")?.value) return privateResponse(response);
  return needsSession ? login() : privateResponse(response);
}

export const config = {
  // All routes must pass this gate, including API routes, auth callbacks,
  // server-action POSTs, and provider function paths. The response is self-contained.
  matcher: ["/:path*"]
};
