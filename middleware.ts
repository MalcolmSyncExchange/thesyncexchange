import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { env, hasSupabaseEnv } from "@/lib/env";

const protectedPrefixes = ["/artist", "/buyer", "/admin", "/onboarding", "/dashboard"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/artist/:path*", "/buyer/:path*", "/admin/:path*", "/onboarding/:path*", "/dashboard/:path*"]
};
