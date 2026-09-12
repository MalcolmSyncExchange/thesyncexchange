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
  avatarPath?: string | null;
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

export async function getDemoDirectoryUserByEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  return (await getDemoDirectory()).users.find((user) => user.email.toLowerCase() === normalizedEmail) || null;
}

export async function getDemoDirectoryUserById(userId: string) {
  return (await getDemoDirectory()).users.find((user) => user.id === userId) || null;
}

export async function upsertDemoDirectoryUser(user: DemoDirectoryUser) {
  const directory = await getDemoDirectory();
  const users = directory.users.filter((entry) => entry.id !== user.id && entry.email.toLowerCase() !== user.email.toLowerCase());
  users.push(user);
  await saveDemoDirectory({
    ...directory,
    users
  });
}

export async function getDemoArtistProfile(userId: string) {
  return (await getDemoDirectory()).artistProfiles[userId] || null;
}

export async function getDemoBuyerProfile(userId: string) {
  return (await getDemoDirectory()).buyerProfiles[userId] || null;
}

export async function upsertDemoArtistProfile(userId: string, patch: Partial<ArtistProfile>) {
  const directory = await getDemoDirectory();
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

  await saveDemoDirectory({
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

export async function upsertDemoBuyerProfile(userId: string, patch: Partial<BuyerProfile>) {
  const directory = await getDemoDirectory();
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

  await saveDemoDirectory({
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

export async function setDemoSession(user: SessionUser) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/"
  });
}

export async function clearDemoSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function toSessionUser(user: DemoDirectoryUser): Promise<SessionUser> {
  const role = user.role || (await detectStoredRole(user.id));

  return {
    id: user.id,
    email: user.email,
    role,
    fullName: user.fullName,
    avatarPath: user.avatarPath || null,
    avatarUrl: user.avatarUrl || null,
    onboardingStep: role === "admin" ? null : user.onboardingStep || null,
    onboardingStartedAt: user.onboardingStartedAt || null,
    onboardingCompletedAt: role === "admin" ? user.onboardingCompletedAt || new Date().toISOString() : user.onboardingCompletedAt || null,
    onboardingData: user.onboardingData || {},
    onboardingComplete: role === "admin" || (Boolean(role) && Boolean(user.onboardingCompletedAt))
  };
}

async function getDemoDirectory(): Promise<DemoDirectory> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DIRECTORY_COOKIE)?.value;
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

async function detectStoredRole(userId: string): Promise<UserRole | null> {
  const directory = await getDemoDirectory();
  const hasArtistProfile = Boolean(directory.artistProfiles[userId]);
  const hasBuyerProfile = Boolean(directory.buyerProfiles[userId]);

  if (hasArtistProfile && !hasBuyerProfile) return "artist";
  if (hasBuyerProfile && !hasArtistProfile) return "buyer";
  return null;
}

async function saveDemoDirectory(directory: DemoDirectory) {
  const cookieStore = await cookies();
  cookieStore.set(DIRECTORY_COOKIE, JSON.stringify(directory), {
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
      avatarPath: null,
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
