import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { demoSessionUsers } from "@/lib/demo-data";
import { env, hasSupabaseEnv } from "@/lib/env";
import { getDemoDirectoryUserByEmail, getDemoDirectoryUserById, toSessionUser } from "@/services/auth/demo-store";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { Database } from "@/types/database";
import type { SessionUser, UserRole } from "@/types/models";

const SESSION_COOKIE = "sync-exchange-session";

export async function getSessionUser(): Promise<SessionUser | null> {
  if (hasSupabaseEnv && !env.demoMode) {
    try {
      const supabase = createServerSupabaseClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();

      if (!user?.email) {
        return null;
      }

      const persisted = await getPersistedUserState(
        supabase,
        user.id,
        resolveUserRole(user.user_metadata?.role),
        String(user.user_metadata?.full_name || user.email.split("@")[0]),
        user.email
      );

      return persisted;
    } catch {
      return null;
    }
  }

  const cookieStore = cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SessionUser;
    const directoryUser = getDemoDirectoryUserById(parsed.id) || getDemoDirectoryUserByEmail(parsed.email);
    if (directoryUser) {
      return toSessionUser(directoryUser);
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function requireSession(role?: UserRole) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.role) {
    redirect("/onboarding");
  }

  if (role && user.role !== role) {
    redirect(resolveRoleRedirect(user.role));
  }

  if ((user.role === "artist" || user.role === "buyer") && user.onboardingComplete !== true) {
    redirect(resolveOnboardingPath(user.role));
  }

  return user;
}

export async function requireOnboardingSession(role: "artist" | "buyer") {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  if (!user.role) {
    redirect("/onboarding");
  }

  if (user.role !== role) {
    redirect(resolveRoleRedirect(user.role));
  }

  if (user.onboardingComplete === true) {
    redirect(resolveRoleRedirect(role));
  }

  return user;
}

export function getDemoUserForRole(role: UserRole) {
  const demoUser = demoSessionUsers[role];
  return demoUser ? { ...demoUser } : null;
}

export function resolveRoleRedirect(role: UserRole | null | undefined) {
  if (role === "admin") return "/dashboard/admin";
  if (role === "buyer") return "/dashboard/buyer";
  if (role === "artist") return "/dashboard/artist";
  return "/onboarding";
}

export function resolveOnboardingPath(role?: UserRole | null) {
  if (role === "artist") return "/onboarding/artist";
  if (role === "buyer") return "/onboarding/buyer";
  return "/onboarding";
}

export function resolvePostAuthRedirect(user: Pick<SessionUser, "role" | "onboardingComplete">) {
  if (!user.role) {
    return "/onboarding";
  }

  if ((user.role === "artist" || user.role === "buyer") && user.onboardingComplete !== true) {
    return "/onboarding";
  }

  return resolveRoleRedirect(user.role);
}

export function resolvePostLoginRedirect(
  user: Pick<SessionUser, "role" | "onboardingComplete">,
  redirectTo?: string | null
) {
  const defaultPath = resolvePostAuthRedirect(user);

  if (!user.role) {
    return "/onboarding";
  }

  if ((user.role === "artist" || user.role === "buyer") && user.onboardingComplete !== true) {
    return defaultPath;
  }

  if (!redirectTo || !isSafeInternalPath(redirectTo)) {
    return defaultPath;
  }

  if (user.role === "admin") {
    return redirectTo.startsWith("/admin") || redirectTo.startsWith("/dashboard/admin") ? redirectTo : defaultPath;
  }

  if (user.role === "artist") {
    return redirectTo.startsWith("/artist") || redirectTo.startsWith("/dashboard/artist") ? redirectTo : defaultPath;
  }

  return redirectTo.startsWith("/buyer") || redirectTo.startsWith("/dashboard/buyer") ? redirectTo : defaultPath;
}

export function getAuthModeLabel() {
  return hasSupabaseEnv && !env.demoMode ? "Supabase" : "Demo mode";
}

function resolveUserRole(rawRole: unknown): UserRole | null {
  if (rawRole === "artist" || rawRole === "buyer" || rawRole === "admin") {
    return rawRole;
  }
  return null;
}

async function getPersistedUserState(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  fallbackRole: UserRole | null,
  fallbackFullName: string,
  email: string
) {
  type UserProfileRow = Pick<
    Database["public"]["Tables"]["user_profiles"]["Row"],
    "id" | "email" | "role" | "full_name" | "avatar_url" | "onboarding_started_at" | "onboarding_completed_at" | "onboarding_step" | "onboarding_payload"
  >;

  const [userResult, artistProfileResult, buyerProfileResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("id, email, role, full_name, avatar_url, onboarding_started_at, onboarding_completed_at, onboarding_step, onboarding_payload")
      .eq("id", userId)
      .maybeSingle(),
    supabase.from("artist_profiles").select("id").eq("user_id", userId).maybeSingle(),
    supabase.from("buyer_profiles").select("id").eq("user_id", userId).maybeSingle()
  ]) as [
    { data: UserProfileRow | null },
    { data: { id: string } | null },
    { data: { id: string } | null }
  ];

  const userRow = userResult.data;
  const role = resolveUserRole(userRow?.role) || fallbackRole || detectPersistedRole(artistProfileResult.data, buyerProfileResult.data);
  const fullName = String(userRow?.full_name || fallbackFullName);
  const onboardingComplete = await resolveOnboardingCompletionState(
    supabase,
    userId,
    role,
    userRow?.onboarding_completed_at,
    artistProfileResult.data,
    buyerProfileResult.data
  );

  return {
    id: userId,
    email: userRow?.email || email,
    role,
    fullName,
    avatarUrl: userRow?.avatar_url || null,
    onboardingStartedAt: userRow?.onboarding_started_at || null,
    onboardingCompletedAt: userRow?.onboarding_completed_at || null,
    onboardingStep: role === "admin" ? null : String(userRow?.onboarding_step || ""),
    onboardingData: (userRow?.onboarding_payload as Record<string, unknown> | null) || {},
    onboardingComplete
  } satisfies SessionUser;
}

async function resolveOnboardingCompletionState(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  userId: string,
  role: UserRole | null,
  completedAt?: string | null,
  artistProfile?: { id: string } | null,
  buyerProfile?: { id: string } | null
) {
  if (role === "admin") {
    return true;
  }

  if (!role) {
    return false;
  }

  if (completedAt) {
    return true;
  }

  if (role === "artist") {
    if (artistProfile) {
      return true;
    }

    const { data: legacyProfile } = await supabase.from("artist_profiles").select("id").eq("user_id", userId).maybeSingle();
    return Boolean(legacyProfile);
  }

  if (buyerProfile) {
    return true;
  }

  const { data: legacyProfile } = await supabase.from("buyer_profiles").select("id").eq("user_id", userId).maybeSingle();
  return Boolean(legacyProfile);
}

function detectPersistedRole(artistProfile?: { id: string } | null, buyerProfile?: { id: string } | null): UserRole | null {
  if (artistProfile && !buyerProfile) return "artist";
  if (buyerProfile && !artistProfile) return "buyer";
  return null;
}

function isSafeInternalPath(path: string) {
  return path.startsWith("/") && !path.startsWith("//");
}
