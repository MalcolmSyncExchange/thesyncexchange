"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";

import { env, hasSupabaseEnv } from "@/lib/env";
import { storageBuckets, type StorageAssetRef } from "@/lib/storage";
import { slugify } from "@/lib/utils";
import { parseTrackSubmissionFormData } from "@/lib/validation/track-submission";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { deleteStorageAssetsWithServerAccess } from "@/services/storage/server";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { Database, Json } from "@/types/database";
import type { SessionUser, UserRole } from "@/types/models";

export interface SubmitTrackState {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  redirectTo?: string;
}

const initialState: SubmitTrackState = {
  success: false
};

export async function submitTrackAction(_prevState: SubmitTrackState, formData: FormData): Promise<SubmitTrackState> {
  let uploadedAssets: StorageAssetRef[] = [];

  try {
    const parsed = parseTrackSubmissionFormData(formData);
    uploadedAssets = parsed.uploadedAssets;
    const user = await requireArtistUser();
    const supabase = (createAdminSupabaseClient() ?? createServerSupabaseClient()) as SupabaseClient<Database>;

    const slug = await ensureUniqueTrackSlug(supabase, slugify(parsed.title));
    const status = parsed.saveMode === "publish" ? "pending_review" : "draft";

    const { data: track, error: trackError } = await supabase
      .from("tracks")
      .insert({
        artist_user_id: user.id,
        title: parsed.title,
        slug,
        description: parsed.description,
        genre: parsed.genre,
        subgenre: parsed.subgenre,
        moods: parsed.moods
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean),
        bpm: parsed.bpm,
        musical_key: parsed.key,
        duration_seconds: parsed.duration,
        instrumental: parsed.instrumental,
        vocals: parsed.vocals,
        explicit: parsed.explicit,
        lyrics: parsed.lyrics || null,
        release_year: parsed.releaseYear,
        waveform_path: parsed.waveformPath || null,
        audio_file_path: parsed.audioFilePath,
        preview_file_path: parsed.previewFilePath || null,
        cover_art_path: parsed.coverArtPath,
        status,
        featured: false
      })
      .select("id")
      .single();

    if (trackError || !track) {
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: trackError?.message || "Unable to create track."
      };
    }

    const { error: rightsError } = await supabase.from("rights_holders").insert(
      parsed.rightsHolders.map((holder: (typeof parsed.rightsHolders)[number]) => ({
        track_id: track.id,
        name: holder.name,
        email: holder.email,
        role_type: holder.roleType,
        ownership_percent: holder.ownershipPercent,
        approval_status: holder.email === user.email ? "approved" : "pending"
      }))
    );

    if (rightsError) {
      await supabase.from("tracks").delete().eq("id", track.id);
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: rightsError.message
      };
    }

    const { data: licenseTypes, error: licenseTypeError } = await supabase
      .from("license_types")
      .select("id, slug")
      .in("slug", ["digital-campaign", "broadcast", "exclusive-buyout"]);

    if (licenseTypeError || !licenseTypes) {
      await supabase.from("tracks").delete().eq("id", track.id);
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: licenseTypeError?.message || "Unable to resolve license types."
      };
    }

    const priceMap = new Map<string, number>([
      ["digital-campaign", parsed.priceDigital],
      ["broadcast", parsed.priceBroadcast],
      ["exclusive-buyout", parsed.priceExclusive]
    ]);

    const { error: licenseOptionError } = await supabase.from("track_license_options").insert(
      licenseTypes.map((licenseType: { id: string; slug: string }) => ({
        track_id: track.id,
        license_type_id: licenseType.id,
        price_cents: priceMap.get(licenseType.slug) ? Math.round((priceMap.get(licenseType.slug) || 0) * 100) : null,
        active: true
      }))
    );

    if (licenseOptionError) {
      await supabase.from("rights_holders").delete().eq("track_id", track.id);
      await supabase.from("tracks").delete().eq("id", track.id);
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: licenseOptionError.message
      };
    }

    await appendTrackAuditLog(supabase, track.id, user.id, "track_created", {
      status,
      title: parsed.title
    }).catch(() => undefined);

    revalidatePath("/artist/dashboard");
    revalidatePath("/artist/catalog");
    revalidatePath("/artist/rights-holders");

    return {
      success: true,
      message: parsed.saveMode === "publish" ? "Track submitted for review." : "Draft saved successfully."
    };
  } catch (error) {
    await cleanupUploadedAssets(uploadedAssets).catch(() => undefined);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Please correct the highlighted fields.",
        errors: flattenZodErrors(error)
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Unexpected submission error."
    };
  }
}

export async function updateTrackAction(_prevState: SubmitTrackState, formData: FormData): Promise<SubmitTrackState> {
  let uploadedAssets: StorageAssetRef[] = [];

  try {
    const parsed = parseTrackSubmissionFormData(formData);
    uploadedAssets = parsed.uploadedAssets;
    const trackId = String(formData.get("trackId") || "");
    const existingSlug = String(formData.get("existingSlug") || "");
    const user = await requireArtistUser();
    const supabase = (createAdminSupabaseClient() ?? createServerSupabaseClient()) as SupabaseClient<Database>;

    if (!trackId || !existingSlug) {
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: "Track update is missing required identifiers."
      };
    }

    const { data: existingTrack } = await supabase
      .from("tracks")
      .select("id, artist_user_id, cover_art_path, audio_file_path, preview_file_path, waveform_path")
      .eq("id", trackId)
      .maybeSingle();

    if (!existingTrack || existingTrack.artist_user_id !== user.id) {
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: "You can only update your own tracks."
      };
    }

    const nextSlugBase = slugify(parsed.title);
    const nextSlug =
      nextSlugBase === existingSlug
        ? existingSlug
        : await ensureUniqueTrackSlug(supabase, nextSlugBase, trackId);
    const status = parsed.saveMode === "publish" ? "pending_review" : "draft";

    const { error: trackError } = await supabase
      .from("tracks")
      .update({
        title: parsed.title,
        slug: nextSlug,
        description: parsed.description,
        genre: parsed.genre,
        subgenre: parsed.subgenre,
        moods: parsed.moods
          .split(",")
          .map((value: string) => value.trim())
          .filter(Boolean),
        bpm: parsed.bpm,
        musical_key: parsed.key,
        duration_seconds: parsed.duration,
        instrumental: parsed.instrumental,
        vocals: parsed.vocals,
        explicit: parsed.explicit,
        lyrics: parsed.lyrics || null,
        release_year: parsed.releaseYear,
        waveform_path: parsed.waveformPath || null,
        audio_file_path: parsed.audioFilePath,
        preview_file_path: parsed.previewFilePath || null,
        cover_art_path: parsed.coverArtPath,
        status
      })
      .eq("id", trackId);

    if (trackError) {
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: trackError.message
      };
    }

    const { error: deleteRightsError } = await supabase.from("rights_holders").delete().eq("track_id", trackId);
    if (deleteRightsError) {
      await cleanupUploadedAssets(uploadedAssets);
      return { success: false, message: deleteRightsError.message };
    }

    const { error: rightsError } = await supabase.from("rights_holders").insert(
      parsed.rightsHolders.map((holder: (typeof parsed.rightsHolders)[number]) => ({
        track_id: trackId,
        name: holder.name,
        email: holder.email,
        role_type: holder.roleType,
        ownership_percent: holder.ownershipPercent,
        approval_status: holder.email === user.email ? "approved" : "pending"
      }))
    );

    if (rightsError) {
      await cleanupUploadedAssets(uploadedAssets);
      return { success: false, message: rightsError.message };
    }

    const { data: licenseTypes, error: licenseTypeError } = await supabase
      .from("license_types")
      .select("id, slug")
      .in("slug", ["digital-campaign", "broadcast", "exclusive-buyout"]);

    if (licenseTypeError || !licenseTypes) {
      await cleanupUploadedAssets(uploadedAssets);
      return {
        success: false,
        message: licenseTypeError?.message || "Unable to resolve license types."
      };
    }

    const { error: deleteLicenseOptionsError } = await supabase.from("track_license_options").delete().eq("track_id", trackId);
    if (deleteLicenseOptionsError) {
      await cleanupUploadedAssets(uploadedAssets);
      return { success: false, message: deleteLicenseOptionsError.message };
    }

    const priceMap = new Map<string, number>([
      ["digital-campaign", parsed.priceDigital],
      ["broadcast", parsed.priceBroadcast],
      ["exclusive-buyout", parsed.priceExclusive]
    ]);

    const { error: licenseOptionError } = await supabase.from("track_license_options").insert(
      licenseTypes.map((licenseType: { id: string; slug: string }) => ({
        track_id: trackId,
        license_type_id: licenseType.id,
        price_cents: priceMap.get(licenseType.slug) ? Math.round((priceMap.get(licenseType.slug) || 0) * 100) : null,
        active: true
      }))
    );

    if (licenseOptionError) {
      await cleanupUploadedAssets(uploadedAssets);
      return { success: false, message: licenseOptionError.message };
    }

    await appendTrackAuditLog(supabase, trackId, user.id, "track_updated", {
      status,
      title: parsed.title,
      slug: nextSlug
    }).catch(() => undefined);

    const supersededAssets = buildSupersededTrackAssets(existingTrack, parsed);
    await cleanupUploadedAssets(supersededAssets);

    revalidatePath("/artist/dashboard");
    revalidatePath("/artist/catalog");
    revalidatePath("/artist/rights-holders");
    revalidatePath(`/artist/tracks/${nextSlug}`);
    revalidatePath("/buyer/catalog");

    return {
      success: true,
      message: parsed.saveMode === "publish" ? "Track changes submitted for review." : "Track updates saved successfully.",
      redirectTo: `/artist/tracks/${nextSlug}`
    };
  } catch (error) {
    await cleanupUploadedAssets(uploadedAssets).catch(() => undefined);

    if (error instanceof z.ZodError) {
      return {
        success: false,
        message: "Please correct the highlighted fields.",
        errors: flattenZodErrors(error)
      };
    }

    return {
      success: false,
      message: error instanceof Error ? error.message : "Unexpected track update error."
    };
  }
}

async function requireArtistUser() {
  if (!hasSupabaseEnv || env.demoMode) {
    const raw = cookies().get("sync-exchange-session")?.value;
    if (!raw) {
      throw new Error("You must be signed in to submit music.");
    }

    const user = JSON.parse(raw) as SessionUser;
    if (user.role !== "artist") {
      throw new Error("Only artist accounts can submit tracks.");
    }

    return {
      id: user.id,
      email: user.email
    };
  }

  const supabase = createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) {
    throw new Error("You must be signed in to submit music.");
  }

  const roleFromMetadata = user.user_metadata?.role as UserRole | undefined;
  const roleFromDatabase = await resolveArtistRole(user.id);
  const role = roleFromDatabase || roleFromMetadata;
  if (role !== "artist") {
    throw new Error("Only artist accounts can submit tracks.");
  }

  return {
    id: user.id,
    email: user.email
  };
}

async function resolveArtistRole(userId: string) {
  const client = (createAdminSupabaseClient() ?? createServerSupabaseClient()) as SupabaseClient<Database>;
  const { data } = await selectUserProfileCompat(client, userId);
  return data?.role as UserRole | null | undefined;
}

async function ensureUniqueTrackSlug(
  supabase: SupabaseClient<Database>,
  baseSlug: string,
  ignoreTrackId?: string
) {
  let slug = baseSlug;
  let index = 1;

  while (true) {
    const { data } = await supabase.from("tracks").select("id").eq("slug", slug).maybeSingle();
    if (!data || data.id === ignoreTrackId) {
      return slug;
    }

    index += 1;
    slug = `${baseSlug}-${index}`;
  }
}

function flattenZodErrors(error: z.ZodError) {
  const result: Record<string, string> = {};

  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!result[key]) {
      result[key] = issue.message;
    }
  }

  return result;
}

async function cleanupUploadedAssets(assets: StorageAssetRef[]) {
  if (!assets.length) {
    return;
  }

  await deleteStorageAssetsWithServerAccess(assets);
}

async function appendTrackAuditLog(
  supabase: SupabaseClient<Database>,
  trackId: string,
  actorId: string,
  action: string,
  metadata: Record<string, unknown>
) {
  await supabase.from("track_audit_log").insert({
    track_id: trackId,
    actor_id: actorId,
    action,
    metadata: metadata as Json
  });
}

export { initialState as submitTrackInitialState };

function buildSupersededTrackAssets(
  existingTrack: Pick<Database["public"]["Tables"]["tracks"]["Row"], "cover_art_path" | "audio_file_path" | "preview_file_path" | "waveform_path">,
  parsed: ReturnType<typeof parseTrackSubmissionFormData>
) {
  const nextAssets: StorageAssetRef[] = [];

  if (existingTrack.cover_art_path && existingTrack.cover_art_path !== parsed.coverArtPath) {
    nextAssets.push({ bucket: storageBuckets.coverArt, path: existingTrack.cover_art_path });
  }

  if (existingTrack.audio_file_path && existingTrack.audio_file_path !== parsed.audioFilePath) {
    nextAssets.push({ bucket: storageBuckets.trackAudio, path: existingTrack.audio_file_path });
  }

  if (existingTrack.preview_file_path && existingTrack.preview_file_path !== parsed.previewFilePath) {
    nextAssets.push({ bucket: storageBuckets.trackPreviews, path: existingTrack.preview_file_path });
  }

  if (existingTrack.waveform_path && existingTrack.waveform_path !== parsed.waveformPath) {
    nextAssets.push({ bucket: storageBuckets.trackPreviews, path: existingTrack.waveform_path });
  }

  return nextAssets;
}
