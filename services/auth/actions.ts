"use server";

import { redirect } from "next/navigation";

import { env, hasSupabaseEnv } from "@/lib/env";
import {
  getNextArtistStep,
  getNextBuyerStep,
  getValidationErrorMessage,
  parseArtistBasics,
  parseArtistFirstTrack,
  parseArtistLicensing,
  parseArtistProfile,
  parseBuyerBasics,
  parseBuyerInterests,
  parseBuyerProfile
} from "@/lib/validation/onboarding";
import { clearDemoSession, getDemoDirectoryUserByEmail, setDemoSession, toSessionUser, upsertDemoArtistProfile, upsertDemoBuyerProfile, upsertDemoDirectoryUser } from "@/services/auth/demo-store";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { getSessionUser, resolveOnboardingPath, resolvePostLoginRedirect, resolveRoleRedirect } from "@/services/auth/session";
import type { SessionUser, UserRole } from "@/types/models";

function parseRole(rawRole: unknown): UserRole | null {
  if (rawRole === "artist" || rawRole === "buyer" || rawRole === "admin") {
    return rawRole;
  }

  return null;
}

function resolveSignupPath(role: UserRole | null) {
  if (role === "buyer") return "/signup/buyer";
  if (role === "admin") return "/signup";
  if (!role) return "/signup";
  return "/signup/artist";
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const redirectTo = String(formData.get("redirectTo") || "").trim();

  if (!email || !password) {
    redirect("/login?error=Enter%20your%20email%20and%20password.");
  }

  if (hasSupabaseEnv && !env.demoMode) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      redirect(`/login?error=${encodeURIComponent(error.message)}`);
    }

    const authUser = data.user;
    if (!authUser) {
      redirect("/login?error=We%20couldn%E2%80%99t%20finish%20signing%20you%20in.%20Please%20try%20again.");
    }

    const role = await resolvePersistedRole(authUser.id, parseRole(authUser.user_metadata?.role));
    await ensureAppUser({
      id: authUser.id,
      email,
      role,
      fullName: String(authUser.user_metadata?.full_name || email.split("@")[0].replace(/[._-]/g, " "))
    });

    const onboardingComplete = await hasCompletedOnboarding(authUser.id, role);
    redirect(resolvePostLoginRedirect({ role, onboardingComplete }, redirectTo));
  }

  const directoryUser = getDemoDirectoryUserByEmail(email);
  if (!directoryUser) {
    redirect("/login?error=No%20demo%20account%20was%20found%20for%20that%20email.%20Create%20an%20account%20first.");
  }

  const sessionUser = toSessionUser(directoryUser);
  setDemoSession(sessionUser);
  redirect(resolvePostLoginRedirect(sessionUser, redirectTo));
}

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const role = parseRole(formData.get("role"));
  const now = new Date().toISOString();
  const signupPath = resolveSignupPath(role);

  if (!email || !password || !fullName) {
    redirect(`${signupPath}?error=${encodeURIComponent("Complete all required fields to create your account.")}`);
  }

  if (hasSupabaseEnv && !env.demoMode) {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          ...(role ? { role } : {}),
          full_name: fullName
        }
      }
    });
    if (error) {
      redirect(`${signupPath}?error=${encodeURIComponent(error.message)}`);
    }

    if (data.user) {
      await ensureAppUser({
        id: data.user.id,
        email,
        role,
        fullName,
        onboardingStartedAt: role === "admin" ? now : role ? now : null,
        onboardingCompletedAt: role === "admin" ? now : null,
        onboardingStep: role === "admin" ? "complete" : role ? "basics" : null,
        onboardingData: {}
      });
    }

    if (!data.session) {
      redirect("/login?success=Account%20created.%20Check%20your%20email%20to%20confirm%20your%20address,%20then%20sign%20in.");
    }

    redirect(role === "admin" ? "/dashboard/admin" : resolveOnboardingPath(role));
  }

  if (getDemoDirectoryUserByEmail(email)) {
    redirect(`${signupPath}?error=${encodeURIComponent("An account with that email already exists. Try logging in.")}`);
  }

  const demoUser = {
    id: `demo-${role || "user"}-${crypto.randomUUID().slice(0, 8)}`,
    email,
    role,
    fullName,
    avatarUrl: null,
    onboardingStep: role === "admin" ? null : role ? "basics" : null,
    onboardingStartedAt: role === "admin" ? now : role ? now : null,
    onboardingCompletedAt: role === "admin" ? now : null,
    onboardingData: {}
  } satisfies Parameters<typeof upsertDemoDirectoryUser>[0];

  upsertDemoDirectoryUser(demoUser);
  const sessionUser = toSessionUser(demoUser);
  setDemoSession(sessionUser);
  redirect(role === "admin" ? "/dashboard/admin" : resolveOnboardingPath(role));
}

export async function selectOnboardingRoleAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role === "admin") {
    redirect("/dashboard/admin");
  }

  const role = parseRole(formData.get("role"));
  if (role !== "artist" && role !== "buyer") {
    redirect("/onboarding?error=Choose%20whether%20you%E2%80%99re%20joining%20as%20an%20artist%20or%20buyer.");
  }

  const now = new Date().toISOString();

  if (hasSupabaseEnv && !env.demoMode) {
    const client = createAdminSupabaseClient() ?? createServerSupabaseClient();
    const { error } = await client
      .from("users")
      .update({
        role,
        onboarding_started_at: user.onboardingStartedAt || now,
        onboarding_step: "basics"
      })
      .eq("id", user.id);

    if (error) {
      redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    upsertDemoDirectoryUser({
      id: user.id,
      email: user.email,
      role,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl || null,
      onboardingStep: "basics",
      onboardingStartedAt: user.onboardingStartedAt || now,
      onboardingCompletedAt: null,
      onboardingData: user.onboardingData || {}
    });

    setDemoSession({
      ...user,
      role,
      onboardingStep: "basics",
      onboardingStartedAt: user.onboardingStartedAt || now,
      onboardingCompletedAt: null,
      onboardingComplete: false
    });
  }

  redirect(resolveOnboardingPath(role));
}

export async function logoutAction() {
  if (hasSupabaseEnv && !env.demoMode) {
    const supabase = createServerSupabaseClient();
    await supabase.auth.signOut();
  }

  clearDemoSession();
  redirect("/");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") || "");

  if (hasSupabaseEnv && !env.demoMode) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${env.appUrl}/reset-password`
    });
    if (error) {
      redirect(`/forgot-password?error=${encodeURIComponent(error.message)}`);
    }
  }

  redirect("/forgot-password?success=Reset%20instructions%20have%20been%20sent.");
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  if (!password || password !== confirmPassword) {
    redirect("/reset-password?error=Passwords%20must%20match.");
  }

  if (hasSupabaseEnv && !env.demoMode) {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
    }
  }

  redirect("/login?success=Password%20updated.%20You%20can%20sign%20in%20now.");
}

export async function saveArtistOnboardingStepAction(formData: FormData) {
  const user = await requireAuthenticatedUser("artist");
  const step = String(formData.get("step") || "basics");
  let nextPath = "/onboarding/artist";

  try {
    if (step === "basics") {
      const data = parseArtistBasics(formData);
      const payload = {
        ...user.onboardingData,
        fullName: data.fullName,
        artistName: data.artistName,
        avatarUrl: data.avatarUrl
      };
      await persistArtistOnboarding({
        user,
        nextStep: getNextArtistStep("basics"),
        payload,
        userUpdates: {
          full_name: data.fullName,
          avatar_url: data.avatarUrl || null
        },
        profileUpdates: {
          artist_name: data.artistName
        }
      });
      nextPath = "/onboarding/artist?step=profile";
    } else if (step === "profile") {
      const data = parseArtistProfile(formData);
      const payload = {
        ...user.onboardingData,
        bio: data.bio,
        location: data.location,
        website: data.website,
        instagram: data.instagram,
        spotify: data.spotify,
        youtube: data.youtube
      };
      await persistArtistOnboarding({
        user,
        nextStep: getNextArtistStep("profile"),
        payload,
        profileUpdates: {
          bio: data.bio,
          location: data.location,
          website: data.website || null,
          social_links: buildArtistSocialLinks(data.instagram, data.spotify, data.youtube)
        }
      });
      nextPath = "/onboarding/artist?step=licensing";
    } else if (step === "licensing") {
      const data = parseArtistLicensing(formData);
      const payload = {
        ...user.onboardingData,
        payoutEmail: data.payoutEmail,
        defaultLicensingPreferences: data.defaultLicensingPreferences
      };
      await persistArtistOnboarding({
        user,
        nextStep: getNextArtistStep("licensing"),
        payload,
        profileUpdates: {
          payout_email: data.payoutEmail,
          default_licensing_preferences: data.defaultLicensingPreferences || null
        }
      });
      nextPath = "/onboarding/artist?step=first-track";
    } else {
      const data = parseArtistFirstTrack(formData);
      await persistArtistOnboarding({
        user,
        nextStep: getNextArtistStep("first-track"),
        payload: {
          ...user.onboardingData,
          firstTrackChoice: data.firstTrackChoice
        }
      });
      nextPath = "/onboarding/artist?step=complete";
    }
  } catch (error) {
    redirect(`/onboarding/artist?step=${encodeURIComponent(step)}&error=${encodeURIComponent(getValidationErrorMessage(error))}`);
  }

  redirect(nextPath);
}

export async function finishArtistOnboardingAction(formData: FormData) {
  const user = await requireAuthenticatedUser("artist");
  const destination = String(formData.get("destination") || "dashboard") === "submit" ? "/artist/submit" : "/dashboard/artist";
  await finalizeOnboarding(user, "complete");
  redirect(destination);
}

export async function saveBuyerOnboardingStepAction(formData: FormData) {
  const user = await requireAuthenticatedUser("buyer");
  const step = String(formData.get("step") || "basics");
  let nextPath = "/onboarding/buyer";

  try {
    if (step === "basics") {
      const data = parseBuyerBasics(formData);
      await persistBuyerOnboarding({
        user,
        nextStep: getNextBuyerStep("basics"),
        payload: {
          ...user.onboardingData,
          fullName: data.fullName,
          companyName: data.companyName
        },
        userUpdates: {
          full_name: data.fullName
        },
        profileUpdates: {
          company_name: data.companyName
        }
      });
      nextPath = "/onboarding/buyer?step=profile";
    } else if (step === "profile") {
      const data = parseBuyerProfile(formData);
      await persistBuyerOnboarding({
        user,
        nextStep: getNextBuyerStep("profile"),
        payload: {
          ...user.onboardingData,
          buyerType: data.buyerType,
          industryType: data.industryType,
          billingEmail: data.billingEmail
        },
        profileUpdates: {
          buyer_type: data.buyerType,
          industry_type: data.industryType,
          billing_email: data.billingEmail
        }
      });
      nextPath = "/onboarding/buyer?step=interests";
    } else {
      const data = parseBuyerInterests(formData);
      await persistBuyerOnboarding({
        user,
        nextStep: getNextBuyerStep("interests"),
        payload: {
          ...user.onboardingData,
          genres: data.genres,
          moods: data.moods,
          intendedUse: data.intendedUse
        },
        profileUpdates: {
          music_preferences: {
            genres: data.genres,
            moods: data.moods,
            intended_use: data.intendedUse || ""
          }
        }
      });
      nextPath = "/onboarding/buyer?step=complete";
    }
  } catch (error) {
    redirect(`/onboarding/buyer?step=${encodeURIComponent(step)}&error=${encodeURIComponent(getValidationErrorMessage(error))}`);
  }

  redirect(nextPath);
}

export async function finishBuyerOnboardingAction(formData: FormData) {
  const user = await requireAuthenticatedUser("buyer");
  const destination = String(formData.get("destination") || "catalog") === "catalog" ? "/buyer/catalog" : "/dashboard/buyer";
  await finalizeOnboarding(user, "complete");
  redirect(destination);
}

async function ensureAppUser(user: {
  id: string;
  email: string;
  role: UserRole | null;
  fullName: string;
  avatarUrl?: string | null;
  onboardingStep?: string | null;
  onboardingStartedAt?: string | null;
  onboardingCompletedAt?: string | null;
  onboardingData?: Record<string, unknown>;
}) {
  const client = createAdminSupabaseClient() ?? createServerSupabaseClient();
  await client.from("users").upsert(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.fullName,
      avatar_url: user.avatarUrl || null,
      onboarding_started_at: user.onboardingStartedAt || null,
      onboarding_completed_at: user.onboardingCompletedAt || null,
      onboarding_step: user.onboardingStep || null,
      onboarding_payload: user.onboardingData || {}
    },
    { onConflict: "id" }
  );
}

async function hasCompletedOnboarding(userId: string, role: UserRole | null) {
  if (!role) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  const admin = createAdminSupabaseClient();
  const client = admin ?? createServerSupabaseClient();
  const { data: userRow } = await client.from("users").select("onboarding_completed_at").eq("id", userId).maybeSingle();
  if (userRow?.onboarding_completed_at) {
    return true;
  }

  const table = role === "artist" ? "artist_profiles" : "buyer_profiles";
  const { data } = await client.from(table).select("id").eq("user_id", userId).maybeSingle();
  return Boolean(data);
}

async function requireAuthenticatedUser(role: "artist" | "buyer"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (user.role !== role) {
    redirect(resolveRoleRedirect(user.role));
  }

  return user;
}

async function persistArtistOnboarding({
  user,
  nextStep,
  payload,
  userUpdates,
  profileUpdates
}: {
  user: SessionUser;
  nextStep: string;
  payload: Record<string, unknown>;
  userUpdates?: Record<string, unknown>;
  profileUpdates?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();

  if (hasSupabaseEnv && !env.demoMode) {
    const client = createAdminSupabaseClient() ?? createServerSupabaseClient();
    const { error: userError } = await client
      .from("users")
      .update({
        ...(userUpdates || {}),
        onboarding_started_at: user.onboardingStartedAt || now,
        onboarding_step: nextStep,
        onboarding_payload: payload
      })
      .eq("id", user.id);

    if (userError) {
      throw userError;
    }

    if (profileUpdates) {
      const { error: profileError } = await client.from("artist_profiles").upsert(
        {
          user_id: user.id,
          ...(profileUpdates || {})
        },
        { onConflict: "user_id" }
      );

      if (profileError) {
        throw profileError;
      }
    }

    return;
  }

  upsertDemoDirectoryUser({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: String(payload.fullName || user.fullName),
    avatarUrl: String(payload.avatarUrl || user.avatarUrl || "") || null,
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || now,
    onboardingCompletedAt: null,
    onboardingData: payload
  });

  if (profileUpdates) {
    upsertDemoArtistProfile(user.id, {
      user_id: user.id,
      ...(profileUpdates as Record<string, unknown>)
    });
  }

  setDemoSession({
    ...user,
    fullName: String(payload.fullName || user.fullName),
    avatarUrl: String(payload.avatarUrl || user.avatarUrl || "") || null,
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || now,
    onboardingCompletedAt: null,
    onboardingData: payload,
    onboardingComplete: false
  });
}

async function persistBuyerOnboarding({
  user,
  nextStep,
  payload,
  userUpdates,
  profileUpdates
}: {
  user: SessionUser;
  nextStep: string;
  payload: Record<string, unknown>;
  userUpdates?: Record<string, unknown>;
  profileUpdates?: Record<string, unknown>;
}) {
  const now = new Date().toISOString();

  if (hasSupabaseEnv && !env.demoMode) {
    const client = createAdminSupabaseClient() ?? createServerSupabaseClient();
    const { error: userError } = await client
      .from("users")
      .update({
        ...(userUpdates || {}),
        onboarding_started_at: user.onboardingStartedAt || now,
        onboarding_step: nextStep,
        onboarding_payload: payload
      })
      .eq("id", user.id);

    if (userError) {
      throw userError;
    }

    if (profileUpdates) {
      const { error: profileError } = await client.from("buyer_profiles").upsert(
        {
          user_id: user.id,
          ...(profileUpdates || {})
        },
        { onConflict: "user_id" }
      );

      if (profileError) {
        throw profileError;
      }
    }

    return;
  }

  upsertDemoDirectoryUser({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: String(payload.fullName || user.fullName),
    avatarUrl: user.avatarUrl || null,
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || now,
    onboardingCompletedAt: null,
    onboardingData: payload
  });

  if (profileUpdates) {
    upsertDemoBuyerProfile(user.id, {
      user_id: user.id,
      ...(profileUpdates as Record<string, unknown>)
    });
  }

  setDemoSession({
    ...user,
    fullName: String(payload.fullName || user.fullName),
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || now,
    onboardingCompletedAt: null,
    onboardingData: payload,
    onboardingComplete: false
  });
}

async function finalizeOnboarding(user: SessionUser, nextStep: string) {
  const completedAt = new Date().toISOString();

  if (hasSupabaseEnv && !env.demoMode) {
    const client = createAdminSupabaseClient() ?? createServerSupabaseClient();
    const { error } = await client
      .from("users")
      .update({
        onboarding_step: nextStep,
        onboarding_completed_at: completedAt
      })
      .eq("id", user.id);

    if (error) {
      redirect(`${resolveOnboardingPath(user.role)}?step=complete&error=${encodeURIComponent(error.message)}`);
    }

    return;
  }

  upsertDemoDirectoryUser({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl || null,
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || completedAt,
    onboardingCompletedAt: completedAt,
    onboardingData: user.onboardingData || {}
  });

  setDemoSession({
    ...user,
    onboardingStep: nextStep,
    onboardingCompletedAt: completedAt,
    onboardingComplete: true
  });
}

function buildArtistSocialLinks(instagram: string, spotify: string, youtube: string) {
  const entries = Object.entries({
    instagram,
    spotify,
    youtube
  }).filter(([, value]) => value);

  return Object.fromEntries(entries);
}

async function resolvePersistedRole(userId: string, fallbackRole: UserRole | null) {
  const client = createAdminSupabaseClient() ?? createServerSupabaseClient();
  const [{ data: userRow }, { data: artistProfile }, { data: buyerProfile }] = await Promise.all([
    client.from("users").select("role").eq("id", userId).maybeSingle(),
    client.from("artist_profiles").select("id").eq("user_id", userId).maybeSingle(),
    client.from("buyer_profiles").select("id").eq("user_id", userId).maybeSingle()
  ]);

  const storedRole = parseRole(userRow?.role);
  if (storedRole) {
    return storedRole;
  }

  if (fallbackRole) {
    return fallbackRole;
  }

  if (artistProfile && !buyerProfile) {
    return "artist";
  }

  if (buyerProfile && !artistProfile) {
    return "buyer";
  }

  return null;
}
