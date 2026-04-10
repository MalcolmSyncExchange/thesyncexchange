import { cookies } from "next/headers";

import { artistProfiles, buyerProfiles, demoUsers } from "@/lib/demo-data";
import type { ArtistProfile, BuyerProfile, SessionUser, UserRole } from "@/types/models";

const SESSION_COOKIE = "sync-exchange-session";
const DIRECTORY_COOKIE = "sync-exchange-demo-directory";

export interface DemoDirectoryUser {
  id: string;
  email: string;
  role: UserRole | null;
  fullName: string;
  avatarUrl?: string | null;
  onboardingStep?: string | null;
  onboardingStartedAt?: string | null;
  onboardingCompletedAt?: string | null;
  onboardingData?: Record<string, unknown> | null;
}

interface DemoDirectory {
  users: DemoDirectoryUser[];
  artistProfiles: Record<string, ArtistProfile>;
  buyerProfiles: Record<string, BuyerProfile>;
}

export function getDemoDirectoryUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return getDemoDirectory().users.find((user) => user.email.toLowerCase() === normalizedEmail) || null;
}

export function getDemoDirectoryUserById(userId: string) {
  return getDemoDirectory().users.find((user) => user.id === userId) || null;
}

export function upsertDemoDirectoryUser(user: DemoDirectoryUser) {
  const directory = getDemoDirectory();
  const users = directory.users.filter((entry) => entry.id !== user.id && entry.email.toLowerCase() !== user.email.toLowerCase());
  users.push(user);
  saveDemoDirectory({
    ...directory,
    users
  });
}

export function getDemoArtistProfile(userId: string) {
  return getDemoDirectory().artistProfiles[userId] || null;
}

export function getDemoBuyerProfile(userId: string) {
  return getDemoDirectory().buyerProfiles[userId] || null;
}

export function upsertDemoArtistProfile(userId: string, patch: Partial<ArtistProfile>) {
  const directory = getDemoDirectory();
  const existing = directory.artistProfiles[userId];
  const base: ArtistProfile =
    existing || {
      id: `artist-profile-${userId}`,
      user_id: userId,
      artist_name: "",
      bio: "",
      location: "",
      website: null,
      social_links: {},
      payout_email: null,
      default_licensing_preferences: null,
      verification_status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

  saveDemoDirectory({
    ...directory,
    artistProfiles: {
      ...directory.artistProfiles,
      [userId]: {
        ...base,
        ...patch,
        social_links: {
          ...(base.social_links || {}),
          ...((patch.social_links as Record<string, string> | undefined) || {})
        },
        updated_at: new Date().toISOString()
      }
    }
  });
}

export function upsertDemoBuyerProfile(userId: string, patch: Partial<BuyerProfile>) {
  const directory = getDemoDirectory();
  const existing = directory.buyerProfiles[userId];
  const base: BuyerProfile =
    existing || {
      id: `buyer-profile-${userId}`,
      user_id: userId,
      company_name: "",
      industry_type: "",
      buyer_type: "",
      billing_email: "",
      music_preferences: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

  saveDemoDirectory({
    ...directory,
    buyerProfiles: {
      ...directory.buyerProfiles,
      [userId]: {
        ...base,
        ...patch,
        music_preferences: {
          ...(base.music_preferences || {}),
          ...((patch.music_preferences as Record<string, unknown> | undefined) || {})
        },
        updated_at: new Date().toISOString()
      }
    }
  });
}

export function setDemoSession(user: SessionUser) {
  cookies().set(SESSION_COOKIE, JSON.stringify(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
}

export function clearDemoSession() {
  cookies().delete(SESSION_COOKIE);
}

export function toSessionUser(user: DemoDirectoryUser): SessionUser {
  const role = user.role || detectStoredRole(user.id);

  return {
    id: user.id,
    email: user.email,
    role,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl || null,
    onboardingStep: role === "admin" ? null : user.onboardingStep || null,
    onboardingStartedAt: user.onboardingStartedAt || null,
    onboardingCompletedAt: role === "admin" ? user.onboardingCompletedAt || new Date().toISOString() : user.onboardingCompletedAt || null,
    onboardingData: user.onboardingData || {},
    onboardingComplete: role === "admin" || (Boolean(role) && Boolean(user.onboardingCompletedAt))
  };
}

function getDemoDirectory(): DemoDirectory {
  const raw = cookies().get(DIRECTORY_COOKIE)?.value;
  if (!raw) {
    return buildDefaultDirectory();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DemoDirectory>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : buildDefaultDirectory().users,
      artistProfiles: parsed.artistProfiles || buildDefaultDirectory().artistProfiles,
      buyerProfiles: parsed.buyerProfiles || buildDefaultDirectory().buyerProfiles
    };
  } catch {
    return buildDefaultDirectory();
  }
}

function detectStoredRole(userId: string): UserRole | null {
  const directory = getDemoDirectory();
  const hasArtistProfile = Boolean(directory.artistProfiles[userId]);
  const hasBuyerProfile = Boolean(directory.buyerProfiles[userId]);

  if (hasArtistProfile && !hasBuyerProfile) return "artist";
  if (hasBuyerProfile && !hasArtistProfile) return "buyer";
  return null;
}

function saveDemoDirectory(directory: DemoDirectory) {
  cookies().set(DIRECTORY_COOKIE, JSON.stringify(directory), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
}

function buildDefaultDirectory(): DemoDirectory {
  return {
    users: demoUsers.map((user) => ({
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
      avatarUrl: user.avatar_url || null,
      onboardingStep: user.role === "admin" ? null : "complete",
      onboardingStartedAt: user.created_at,
      onboardingCompletedAt: user.created_at,
      onboardingData: {}
    })),
    artistProfiles: Object.fromEntries(artistProfiles.map((profile) => [profile.user_id, profile])),
    buyerProfiles: Object.fromEntries(buyerProfiles.map((profile) => [profile.user_id, profile]))
  };
}
