"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect";
import { ZodError } from "zod";

import { env, getDeploymentTarget, hasSupabaseEnv } from "@/lib/env";
import { reportOperationalError, reportOperationalEvent } from "@/lib/monitoring";
import { isAbsoluteAssetReference } from "@/lib/storage";
import { uploadManagedAsset } from "@/services/storage/assets";
import { inferOnboardingCompletionState } from "@/services/auth/onboarding-completion";
import { deleteStorageAssetsWithServerAccess } from "@/services/storage/server";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
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
import {
  clearDemoSession,
  getDemoArtistProfile,
  getDemoBuyerProfile,
  getDemoDirectoryUserByEmail,
  setDemoSession,
  toSessionUser,
  upsertDemoArtistProfile,
  upsertDemoBuyerProfile,
  upsertDemoDirectoryUser
} from "@/services/auth/demo-store";
import { selectUserProfileCompat, upsertUserProfileCompat } from "@/services/auth/user-profiles";
import { createServerSupabaseClient } from "@/services/supabase/server";
import { getSessionUser, resolveOnboardingPath, resolvePostLoginRedirect, resolveRoleRedirect } from "@/services/auth/session";
import {
  DEMO_ACCOUNT_NOT_FOUND_MESSAGE,
  FORGOT_PASSWORD_UNAVAILABLE_MESSAGE,
  SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE,
  buildPasswordResetRedirectUrl,
  buildAuthCallbackRedirectUrl,
  getMissingLoginAccountMessage,
  normalizeAuthEmail,
  requestPasswordResetEmail,
  resolveAuthMode,
  type ForgotPasswordActionState
} from "@/services/auth/auth-flow";
import { buildBuyerProfileUpsert } from "@/services/auth/buyer-onboarding";
import type { Database } from "@/types/database";
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

function resolveSignupReturnPath(formData: FormData, role: UserRole | null) {
  const raw = String(formData.get("returnTo") || "").trim();
  if (raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }

  return resolveSignupPath(role);
}

function buildRelativePath(path: string, params: Record<string, string | null | undefined>) {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      searchParams.set(key, value);
    }
  });

  const query = searchParams.toString();
  return query ? `${path}?${query}` : path;
}

function getEmailDomain(email: string) {
  return email.includes("@") ? email.split("@")[1] : null;
}

function getRequestOrigin() {
  const headerStore = headers();
  const origin = headerStore.get("origin");
  if (origin) {
    return origin;
  }

  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  if (!host) {
    return null;
  }

  const protocol = headerStore.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${protocol}://${host}`;
}

function buildConfirmationRedirectUrl(nextPath: string) {
  return buildAuthCallbackRedirectUrl({
    appUrl: env.appUrl,
    deploymentTarget: getDeploymentTarget(),
    nextPath
  });
}

function isEmailConfirmationError(message: string) {
  const normalized = message.toLowerCase();
  return normalized.includes("email not confirmed") || normalized.includes("email address not authorized");
}

function getMutationClient() {
  return (createAdminSupabaseClient() ?? createServerSupabaseClient()) as SupabaseClient<Database>;
}

export async function loginAction(formData: FormData) {
  const email = normalizeAuthEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  const redirectTo = String(formData.get("redirectTo") || "").trim();
  const authMode = resolveAuthMode({ hasSupabaseEnv, demoMode: env.demoMode });

  if (!email || !password) {
    redirect("/login?error=Enter%20your%20email%20and%20password.");
  }

  if (authMode === "supabase") {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (isEmailConfirmationError(error.message)) {
        redirect(
          buildRelativePath("/login", {
            error: "Confirm your email address before signing in.",
            email,
            confirmation: "required"
          })
        );
      }

      redirect(buildRelativePath("/login", { error: error.message }));
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

  if (authMode === "misconfigured") {
    redirect(buildRelativePath("/login", { error: getMissingLoginAccountMessage(authMode) }));
  }

  const directoryUser = getDemoDirectoryUserByEmail(email);
  if (!directoryUser) {
    redirect(buildRelativePath("/login", { error: DEMO_ACCOUNT_NOT_FOUND_MESSAGE }));
  }

  const sessionUser = toSessionUser(directoryUser);
  setDemoSession(sessionUser);
  redirect(resolvePostLoginRedirect(sessionUser, redirectTo));
}

export async function signupAction(formData: FormData) {
  const email = normalizeAuthEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  const fullName = String(formData.get("fullName") || "").trim();
  const role = parseRole(formData.get("role"));
  const now = new Date().toISOString();
  const signupPath = resolveSignupReturnPath(formData, role);
  const authMode = resolveAuthMode({ hasSupabaseEnv, demoMode: env.demoMode });

  if (!email || !password || !fullName) {
    redirect(`${signupPath}?error=${encodeURIComponent("Complete all required fields to create your account.")}`);
  }

  if (authMode === "supabase") {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: buildConfirmationRedirectUrl("/onboarding"),
        data: {
          ...(role ? { role } : {}),
          full_name: fullName
        }
      }
    });
    if (error) {
      redirect(`${signupPath}?error=${encodeURIComponent(error.message)}`);
    }

    let sessionUser = data.session?.user || null;
    if (!data.session) {
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (!loginError && loginData.user) {
        sessionUser = loginData.user;
      }
    }

    const canPersistWithoutSession = Boolean(createAdminSupabaseClient());
    if (data.user && (sessionUser || canPersistWithoutSession)) {
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

    if (!sessionUser) {
      redirect(
        buildRelativePath(signupPath, {
          success: "Account created. Check your email to confirm your address, then continue into onboarding.",
          email,
          confirmation: "required"
        })
      );
    }

    redirect(role === "admin" ? "/dashboard/admin" : "/onboarding");
  }

  if (authMode === "misconfigured") {
    redirect(buildRelativePath(signupPath, { error: SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE }));
  }

  if (getDemoDirectoryUserByEmail(email)) {
    redirect(`${signupPath}?error=${encodeURIComponent("An account with that email already exists. Try logging in.")}`);
  }

  const demoUser = {
    id: `demo-${role || "user"}-${crypto.randomUUID().slice(0, 8)}`,
    email,
    role,
    fullName,
    avatarPath: null,
    avatarUrl: null,
    onboardingStep: role === "admin" ? null : role ? "basics" : null,
    onboardingStartedAt: role === "admin" ? now : role ? now : null,
    onboardingCompletedAt: role === "admin" ? now : null,
    onboardingData: {}
  } satisfies Parameters<typeof upsertDemoDirectoryUser>[0];

  upsertDemoDirectoryUser(demoUser);
  const sessionUser = toSessionUser(demoUser);
  setDemoSession(sessionUser);
  redirect(role === "admin" ? "/dashboard/admin" : "/onboarding");
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
    const client = getMutationClient();
    const { error } = await upsertUserProfileCompat(
      client,
      {
        id: user.id,
        email: user.email,
        full_name: user.fullName,
        ...getStoredAvatarFields({
          avatarPath: user.avatarPath || null,
          avatarUrl: user.avatarUrl || null
        }),
        role,
        onboarding_started_at: user.onboardingStartedAt || now,
        onboarding_completed_at: null,
        onboarding_step: "basics",
        onboarding_payload: user.onboardingData || {}
      } as Database["public"]["Tables"]["user_profiles"]["Insert"],
    );

    if (error) {
      redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
    }
  } else {
    upsertDemoDirectoryUser({
      id: user.id,
      email: user.email,
      role,
      fullName: user.fullName,
      avatarPath: user.avatarPath || null,
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

export async function forgotPasswordAction(
  _previousState: ForgotPasswordActionState,
  formData: FormData
): Promise<ForgotPasswordActionState> {
  const email = normalizeAuthEmail(formData.get("email"));
  const emailDomain = getEmailDomain(email);
  const authMode = resolveAuthMode({ hasSupabaseEnv, demoMode: env.demoMode });

  reportOperationalEvent("forgot_password_action_entered", "Forgot password action entered.", {
    emailDomain,
    demoMode: env.demoMode,
    hasSupabaseEnv,
    authMode
  });

  if (!email) {
    return {
      status: "error",
      message: "Enter the email address for the account you want to recover."
    };
  }

  try {
    const redirectTo = buildPasswordResetRedirectUrl({
      configuredAppUrl: env.configuredAppUrl,
      requestOrigin: getRequestOrigin(),
      deploymentTarget: getDeploymentTarget()
    });

    reportOperationalEvent("forgot_password_requested", "Password reset email requested.", {
      emailDomain,
      redirectTo,
      appUrlHost: new URL(redirectTo).host,
      demoMode: env.demoMode,
      hasSupabaseEnv,
      authMode,
      resetPasswordForEmailCalled: false
    });

    return await requestPasswordResetEmail({
      authMode,
      email,
      emailDomain,
      redirectTo,
      supabase: authMode === "supabase" ? createServerSupabaseClient() : undefined,
      logEvent: reportOperationalEvent,
      logError: reportOperationalError
    });
  } catch (error) {
    if (isRedirectError(error)) {
      throw error;
    }

    reportOperationalError("forgot_password_request_failed", error, {
      emailDomain,
      demoMode: env.demoMode,
      hasSupabaseEnv
    });

    const safeMessage =
      error instanceof Error && !error.message.includes("NEXT_REDIRECT") ? error.message : FORGOT_PASSWORD_UNAVAILABLE_MESSAGE;

    return {
      status: "error",
      message: safeMessage,
      email
    };
  }
}

export async function resendSignupConfirmationAction(formData: FormData) {
  const email = normalizeAuthEmail(formData.get("email"));
  const returnTo = String(formData.get("returnTo") || "/signup").trim();
  const safeReturnTo = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/signup";
  const authMode = resolveAuthMode({ hasSupabaseEnv, demoMode: env.demoMode });

  if (!email) {
    redirect(
      buildRelativePath(safeReturnTo, {
        error: "Enter the email address you used for signup so we can resend the confirmation link."
      })
    );
  }

  if (authMode === "supabase") {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: buildConfirmationRedirectUrl("/onboarding")
      }
    });

    if (error) {
      redirect(
        buildRelativePath(safeReturnTo, {
          error: error.message,
          email,
          confirmation: "required"
        })
      );
    }
  } else if (authMode === "misconfigured") {
    redirect(
      buildRelativePath(safeReturnTo, {
        error: SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE,
        email,
        confirmation: "required"
      })
    );
  }

  redirect(
    buildRelativePath(safeReturnTo, {
      success: "We sent a fresh confirmation link. Once you confirm, you’ll continue into onboarding.",
      email,
      confirmation: "required"
    })
  );
}

export async function updatePasswordAction(formData: FormData) {
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const authMode = resolveAuthMode({ hasSupabaseEnv, demoMode: env.demoMode });

  if (!password || password !== confirmPassword) {
    redirect("/reset-password?error=Passwords%20must%20match.");
  }

  if (authMode === "supabase") {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
    }
  } else if (authMode === "misconfigured") {
    redirect(buildRelativePath("/reset-password", { error: SUPABASE_AUTH_NOT_CONFIGURED_MESSAGE }));
  }

  redirect("/login?success=Password%20updated.%20You%20can%20sign%20in%20now.");
}

export async function saveArtistOnboardingStepAction(formData: FormData) {
  const user = await requireAuthenticatedUser("artist");
  const step = String(formData.get("step") || "basics");
  let nextPath = "/onboarding/artist";
  let uploadedAvatarPath: string | null = null;

  try {
    if (step === "basics") {
      const data = parseArtistBasics(formData);
      const uploadedAvatar = await uploadArtistAvatarIfPresent(user.id, formData);
      uploadedAvatarPath = uploadedAvatar?.path || null;
      const avatarPath = uploadedAvatar?.path || user.avatarPath || null;
      const avatarUrl = uploadedAvatar?.publicUrl || user.avatarUrl || null;
      const payload = {
        ...user.onboardingData,
        fullName: data.fullName,
        artistName: data.artistName,
        avatarPath,
        avatarUrl
      };
      await persistArtistOnboarding({
        user,
        nextStep: getNextArtistStep("basics"),
        payload,
        userUpdates: {
          full_name: data.fullName,
          ...getStoredAvatarFields({
            avatarPath,
            avatarUrl
          })
        },
        profileUpdates: {
          artist_name: data.artistName
        }
      });
      if (uploadedAvatar?.path && user.avatarPath && user.avatarPath !== uploadedAvatar.path) {
        await deleteStorageAssetsWithServerAccess([
          {
            bucket: env.avatarsBucket,
            path: user.avatarPath
          }
        ]).catch(() => undefined);
      }
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
          instagram_url: data.instagram || null,
          spotify_url: data.spotify || null,
          youtube_url: data.youtube || null,
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
    if (uploadedAvatarPath && uploadedAvatarPath !== user.avatarPath) {
      await deleteStorageAssetsWithServerAccess([
        {
          bucket: env.avatarsBucket,
          path: uploadedAvatarPath
        }
      ]).catch(() => undefined);
    }
    reportOperationalError("artist_onboarding_save_failed", error, {
      userId: user.id,
      step
    });
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
        },
        requireBuyerProfileRecord: false
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
        },
        requireBuyerProfileRecord: true
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
        },
        requireBuyerProfileRecord: true
      });
      nextPath = "/onboarding/buyer?step=complete";
    }
  } catch (error) {
    reportOperationalError("buyer_onboarding_save_failed", error, {
      userId: user.id,
      step
    });
    redirect(`/onboarding/buyer?step=${encodeURIComponent(step)}&error=${encodeURIComponent(getOnboardingStepErrorMessage(error))}`);
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
  avatarPath?: string | null;
  avatarUrl?: string | null;
  onboardingStep?: string | null;
  onboardingStartedAt?: string | null;
  onboardingCompletedAt?: string | null;
  onboardingData?: Record<string, unknown>;
}) {
  const client = getMutationClient();
  const avatarFields =
    user.avatarPath !== undefined || user.avatarUrl !== undefined
      ? getStoredAvatarFields({
          avatarPath: user.avatarPath,
          avatarUrl: user.avatarUrl
        })
      : {};

  await upsertUserProfileCompat(
    client,
    {
      id: user.id,
      email: user.email,
      role: user.role,
      full_name: user.fullName,
      ...avatarFields,
      onboarding_started_at: user.onboardingStartedAt || null,
      onboarding_completed_at: user.onboardingCompletedAt || null,
      onboarding_step: user.onboardingStep || null,
      onboarding_payload: user.onboardingData || {}
    } as Database["public"]["Tables"]["user_profiles"]["Insert"]
  );
}

async function hasCompletedOnboarding(userId: string, role: UserRole | null) {
  if (!role) {
    return false;
  }

  if (role === "admin") {
    return true;
  }

  const client = getMutationClient();
  const { data: userRow } = (await selectUserProfileCompat(client, userId)) as {
    data: Pick<Database["public"]["Tables"]["user_profiles"]["Row"], "onboarding_completed_at" | "onboarding_step"> | null;
  };

  const table = role === "artist" ? "artist_profiles" : "buyer_profiles";
  const { data } = await client.from(table).select("id").eq("user_id", userId).maybeSingle();
  return inferOnboardingCompletionState({
    role,
    onboardingCompletedAt: userRow?.onboarding_completed_at,
    onboardingStep: userRow?.onboarding_step,
    hasArtistProfile: role === "artist" ? Boolean(data) : false,
    hasBuyerProfile: role === "buyer" ? Boolean(data) : false
  });
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
    const client = getMutationClient();
    const { error: userError } = await upsertUserProfileCompat(
      client,
      {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: String(payload.fullName || user.fullName),
        ...getStoredAvatarFields({
          avatarPath: String(payload.avatarPath || user.avatarPath || "") || null,
          avatarUrl: String(payload.avatarUrl || user.avatarUrl || "") || null
        }),
        onboarding_started_at: user.onboardingStartedAt || now,
        onboarding_completed_at: null,
        onboarding_step: nextStep,
        onboarding_payload: payload,
        ...(userUpdates || {})
      } as Database["public"]["Tables"]["user_profiles"]["Insert"]
    );

    if (userError) {
      throw userError;
    }

    if (profileUpdates) {
      const existingProfileResult = await client.from("artist_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (existingProfileResult.error) {
        throw existingProfileResult.error;
      }

      const artistProfileWrite = buildArtistProfileUpsert({
        userId: user.id,
        onboardingPayload: payload,
        profileUpdates,
        existingProfile: existingProfileResult.data
      });

      const { error: profileError } = await client.from("artist_profiles").upsert(
        artistProfileWrite as Database["public"]["Tables"]["artist_profiles"]["Insert"],
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
    avatarPath: String(payload.avatarPath || user.avatarPath || "") || null,
    avatarUrl: String(payload.avatarUrl || user.avatarUrl || "") || null,
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || now,
    onboardingCompletedAt: null,
    onboardingData: payload
  });

  if (profileUpdates) {
    upsertDemoArtistProfile(
      user.id,
      buildArtistProfileUpsert({
        userId: user.id,
        onboardingPayload: payload,
        profileUpdates,
        existingProfile: getDemoArtistProfileSnapshot(user.id)
      }) as Parameters<typeof upsertDemoArtistProfile>[1]
    );
  }

  setDemoSession({
    ...user,
    fullName: String(payload.fullName || user.fullName),
    avatarPath: String(payload.avatarPath || user.avatarPath || "") || null,
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
  profileUpdates,
  requireBuyerProfileRecord = false
}: {
  user: SessionUser;
  nextStep: string;
  payload: Record<string, unknown>;
  userUpdates?: Record<string, unknown>;
  profileUpdates?: Record<string, unknown>;
  requireBuyerProfileRecord?: boolean;
}) {
  const now = new Date().toISOString();

  if (hasSupabaseEnv && !env.demoMode) {
    const client = getMutationClient();
    const { error: userError } = await upsertUserProfileCompat(
      client,
      {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: String(payload.fullName || user.fullName),
        ...getStoredAvatarFields({
          avatarPath: user.avatarPath || null,
          avatarUrl: user.avatarUrl || null
        }),
        onboarding_started_at: user.onboardingStartedAt || now,
        onboarding_completed_at: null,
        onboarding_step: nextStep,
        onboarding_payload: payload,
        ...(userUpdates || {})
      } as Database["public"]["Tables"]["user_profiles"]["Insert"]
    );

    if (userError) {
      throw userError;
    }

    if (profileUpdates || requireBuyerProfileRecord) {
      const existingProfileResult = await client.from("buyer_profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (existingProfileResult.error) {
        throw existingProfileResult.error;
      }

      const buyerProfileWrite = buildBuyerProfileUpsert({
        userId: user.id,
        onboardingPayload: payload,
        profileUpdates,
        existingProfile: existingProfileResult.data
      });

      if (buyerProfileWrite.upsert) {
        const { error: profileError } = await client.from("buyer_profiles").upsert(
          buyerProfileWrite.upsert as Database["public"]["Tables"]["buyer_profiles"]["Insert"],
          { onConflict: "user_id" }
        );

        if (profileError) {
          throw profileError;
        }
      } else if (requireBuyerProfileRecord) {
        throw new Error(
          `Buyer onboarding is missing required profile fields: ${buyerProfileWrite.missingRequiredFields.join(", ")}`
        );
      }
    }

    return;
  }

  upsertDemoDirectoryUser({
    id: user.id,
    email: user.email,
    role: user.role,
    fullName: String(payload.fullName || user.fullName),
    avatarPath: user.avatarPath || null,
    avatarUrl: user.avatarUrl || null,
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || now,
    onboardingCompletedAt: null,
    onboardingData: payload
  });

  if (profileUpdates || requireBuyerProfileRecord) {
    const buyerProfileWrite = buildBuyerProfileUpsert({
      userId: user.id,
      onboardingPayload: payload,
      profileUpdates,
      existingProfile: getDemoBuyerProfileSnapshot(user.id)
    });

    if (buyerProfileWrite.upsert) {
      upsertDemoBuyerProfile(user.id, buyerProfileWrite.upsert as Parameters<typeof upsertDemoBuyerProfile>[1]);
    } else if (requireBuyerProfileRecord) {
      throw new Error(`Buyer onboarding is missing required profile fields: ${buyerProfileWrite.missingRequiredFields.join(", ")}`);
    }
  }

  setDemoSession({
    ...user,
    fullName: String(payload.fullName || user.fullName),
    avatarPath: user.avatarPath || null,
    onboardingStep: nextStep,
    onboardingStartedAt: user.onboardingStartedAt || now,
    onboardingCompletedAt: null,
    onboardingData: payload,
    onboardingComplete: false
  });
}

function getOnboardingStepErrorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues[0]?.message || "Please review the highlighted fields and try again.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error && typeof error.message === "string") {
    return "We couldn't save this step. Please try again.";
  }

  return "Something went wrong. Please try again.";
}

function getDemoBuyerProfileSnapshot(userId: string) {
  const profile = getDemoBuyerProfile(userId);
  return profile
    ? {
        company_name: profile.company_name,
        buyer_type: profile.buyer_type,
        industry_type: profile.industry_type,
        billing_email: profile.billing_email,
        music_preferences: profile.music_preferences || {}
      }
    : null;
}

function getDemoArtistProfileSnapshot(userId: string) {
  const profile = getDemoArtistProfile(userId);
  return profile
    ? {
        artist_name: profile.artist_name,
        bio: profile.bio,
        location: profile.location,
        website: profile.website,
        instagram_url: profile.instagram_url,
        spotify_url: profile.spotify_url,
        youtube_url: profile.youtube_url,
        social_links: profile.social_links || {},
        payout_email: profile.payout_email,
        default_licensing_preferences: profile.default_licensing_preferences,
        verification_status: profile.verification_status
      }
    : null;
}

async function finalizeOnboarding(user: SessionUser, nextStep: string) {
  const completedAt = new Date().toISOString();

  if (hasSupabaseEnv && !env.demoMode) {
    const client = getMutationClient();
    const { error } = await upsertUserProfileCompat(
      client,
      {
        id: user.id,
        email: user.email,
        role: user.role,
        full_name: user.fullName,
        ...getStoredAvatarFields({
          avatarPath: user.avatarPath || null,
          avatarUrl: user.avatarUrl || null
        }),
        onboarding_started_at: user.onboardingStartedAt || completedAt,
        onboarding_step: nextStep,
        onboarding_completed_at: completedAt,
        onboarding_payload: user.onboardingData || {}
      } as Database["public"]["Tables"]["user_profiles"]["Insert"]
    );

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
    avatarPath: user.avatarPath || null,
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

async function uploadArtistAvatarIfPresent(userId: string, formData: FormData) {
  const file = formData.get("avatarFile");

  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  const supabase = createAdminSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase service role key is required to upload artist avatars.");
  }

  const uploaded = await uploadManagedAsset({
    supabase,
    userId,
    kind: "avatar",
    file
  });

  return {
    path: uploaded.path,
    publicUrl: uploaded.publicUrl
  };
}

function buildArtistSocialLinks(instagram: string, spotify: string, youtube: string) {
  const entries = Object.entries({
    instagram,
    spotify,
    youtube
  }).filter(([, value]) => value);

  return Object.fromEntries(entries);
}

function buildArtistProfileUpsert({
  userId,
  onboardingPayload,
  profileUpdates,
  existingProfile
}: {
  userId: string;
  onboardingPayload: Record<string, unknown>;
  profileUpdates?: Record<string, unknown>;
  existingProfile?: Partial<Database["public"]["Tables"]["artist_profiles"]["Row"]> | null;
}) {
  const nextArtistName =
    String(profileUpdates?.artist_name || onboardingPayload.artistName || existingProfile?.artist_name || "").trim();

  if (!nextArtistName) {
    throw new Error("Artist onboarding is missing the artist name required to persist the profile.");
  }

  return {
    user_id: userId,
    artist_name: nextArtistName,
    bio: String(profileUpdates?.bio || onboardingPayload.bio || existingProfile?.bio || ""),
    location: String(profileUpdates?.location || onboardingPayload.location || existingProfile?.location || ""),
    website: toNullableString(profileUpdates?.website || onboardingPayload.website || existingProfile?.website),
    instagram_url: toNullableString(
      profileUpdates?.instagram_url || onboardingPayload.instagram || existingProfile?.instagram_url
    ),
    spotify_url: toNullableString(profileUpdates?.spotify_url || onboardingPayload.spotify || existingProfile?.spotify_url),
    youtube_url: toNullableString(profileUpdates?.youtube_url || onboardingPayload.youtube || existingProfile?.youtube_url),
    social_links: {
      ...((existingProfile?.social_links as Record<string, string> | null) || {}),
      ...((profileUpdates?.social_links as Record<string, string> | undefined) || {})
    },
    payout_email: toNullableString(
      profileUpdates?.payout_email || onboardingPayload.payoutEmail || existingProfile?.payout_email
    ),
    default_licensing_preferences: toNullableString(
      profileUpdates?.default_licensing_preferences ||
        onboardingPayload.defaultLicensingPreferences ||
        existingProfile?.default_licensing_preferences
    ),
    verification_status: existingProfile?.verification_status || "unverified"
  } satisfies Database["public"]["Tables"]["artist_profiles"]["Insert"];
}

function toNullableString(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

async function resolvePersistedRole(userId: string, fallbackRole: UserRole | null) {
  const client = getMutationClient();
  const [{ data: userRow }, { data: artistProfile }, { data: buyerProfile }] = await Promise.all([
    selectUserProfileCompat(client, userId),
    client.from("artist_profiles").select("id").eq("user_id", userId).maybeSingle(),
    client.from("buyer_profiles").select("id").eq("user_id", userId).maybeSingle()
  ]) as [
    Awaited<ReturnType<typeof selectUserProfileCompat>>,
    { data: { id: string } | null },
    { data: { id: string } | null }
  ];

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

function getStoredAvatarFields({
  avatarPath,
  avatarUrl
}: {
  avatarPath?: string | null;
  avatarUrl?: string | null;
}) {
  const normalizedPath = avatarPath?.trim() || null;
  const normalizedUrl = avatarUrl?.trim() || null;

  if (normalizedPath) {
    return {
      avatar_path: normalizedPath,
      avatar_url: null
    };
  }

  if (normalizedUrl && isAbsoluteAssetReference(normalizedUrl)) {
    return {
      avatar_path: null,
      avatar_url: normalizedUrl
    };
  }

  return {
    avatar_path: null,
    avatar_url: null
  };
}
