"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env, hasSupabaseEnv } from "@/lib/env";
import { slugify } from "@/lib/utils";
import { parseTrackSubmissionFormData } from "@/lib/validation/track-submission";
import { selectUserProfileCompat } from "@/services/auth/user-profiles";
import { createAdminSupabaseClient } from "@/services/supabase/admin";
import { trackAssetFields, verifyTrackAssetReferences } from "@/services/storage/track-assets";
import { createServerSupabaseClient } from "@/services/supabase/server";
import type { Database, Json } from "@/types/database";
import type { UserRole } from "@/types/models";

export interface SubmitTrackState {
  success: boolean;
  message?: string;
  errors?: Record<string, string>;
  redirectTo?: string;
  trackId?: string;
  trackStatus?: string;
}

const requiredTrackLicenseSlugs = ["digital-campaign", "broadcast", "exclusive-buyout"] as const;

export async function submitTrackAction(_prevState: SubmitTrackState, formData: FormData): Promise<SubmitTrackState> {
  try {
    const user = await requireArtistUser();
    const parsed = parseTrackSubmissionFormData(formData);
    const supabase = (createAdminSupabaseClient() ?? await createServerSupabaseClient()) as SupabaseClient<Database>;
    Object.assign(parsed, await verifyTrackAssetReferences(supabase, user.id, parsed));

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
      return {
        success: false,
        message: rightsError.message
      };
    }

    const { licenseTypes, errorMessage: licenseTypeMessage } = await loadRequiredLicenseTypes(supabase);

    if (licenseTypeMessage || !licenseTypes) {
      await supabase.from("tracks").delete().eq("id", track.id);
      return {
        success: false,
        message: licenseTypeMessage || "Unable to resolve license types."
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
      message: parsed.saveMode === "publish" ? "Track submitted for review." : "Draft saved successfully.",
      trackId: track.id,
      trackStatus: status,
      redirectTo: `/artist/catalog?submitted=${track.id}`
    };
  } catch (error) {
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
  try {
    const user = await requireArtistUser();
    const trackId = String(formData.get("trackId") || "");
    const existingSlug = String(formData.get("existingSlug") || "");
    const supabase = (createAdminSupabaseClient() ?? await createServerSupabaseClient()) as SupabaseClient<Database>;

    if (!trackId || !existingSlug) {
      return {
        success: false,
        message: "Track update is missing required identifiers."
      };
    }

    const { data: existingTrack, error: existingTrackError } = await supabase
      .from("tracks")
      .select(
        "id, artist_user_id, updated_at, title, slug, description, genre, subgenre, moods, bpm, musical_key, duration_seconds, instrumental, vocals, explicit, lyrics, release_year, status, cover_art_path, audio_file_path, preview_file_path, waveform_path"
      )
      .eq("id", trackId)
      .eq("artist_user_id", user.id)
      .maybeSingle();

    if (existingTrackError || !existingTrack || existingTrack.artist_user_id !== user.id) {
      return { success: false, message: "Unable to load an artist-owned track for this update." };
    }

    const input = new FormData();
    for (const [key, value] of formData.entries()) input.append(key, value);
    for (const { field, column } of trackAssetFields) {
      if (!input.has(field) || input.get(field) === (existingTrack[column] || "")) {
        input.set(field, existingTrack[column] || "");
      }
    }
    const parsed = parseTrackSubmissionFormData(input);
    Object.assign(parsed, await verifyTrackAssetReferences(supabase, user.id, parsed, existingTrack));

    const nextSlugBase = slugify(parsed.title);
    const nextSlug =
      nextSlugBase === existingSlug
        ? existingSlug
        : await ensureUniqueTrackSlug(supabase, nextSlugBase, trackId);
    const status = parsed.saveMode === "publish" ? "pending_review" : "draft";
    const updatedTrackValues = {
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
    } satisfies Database["public"]["Tables"]["tracks"]["Update"];

    const { licenseTypes, errorMessage: licenseTypeMessage } = await loadRequiredLicenseTypes(supabase);

    if (licenseTypeMessage || !licenseTypes) {
      return {
        success: false,
        message: licenseTypeMessage || "Unable to resolve license types."
      };
    }

    const priceMap = new Map<string, number>([
      ["digital-campaign", parsed.priceDigital],
      ["broadcast", parsed.priceBroadcast],
      ["exclusive-buyout", parsed.priceExclusive]
    ]);
    const nextRightsHolders = parsed.rightsHolders.map((holder: (typeof parsed.rightsHolders)[number]) => ({
      track_id: trackId,
      name: holder.name,
      email: holder.email,
      role_type: holder.roleType,
      ownership_percent: holder.ownershipPercent,
      approval_status: holder.email === user.email ? "approved" : "pending"
    }));
    const nextLicenseOptions = licenseTypes.map((licenseType: { id: string; slug: string }) => ({
      track_id: trackId,
      license_type_id: licenseType.id,
      price_cents: priceMap.get(licenseType.slug) ? Math.round((priceMap.get(licenseType.slug) || 0) * 100) : null,
      active: true
    }));

    const { error: mutationError } = await supabase.rpc("update_artist_track_atomic", {
      p_actor_id: user.id,
      p_track_id: trackId,
      p_expected_updated_at: existingTrack.updated_at,
      p_values: updatedTrackValues,
      p_rights: nextRightsHolders,
      p_options: nextLicenseOptions
    });
    if (mutationError) return { success: false, message: mutationError.message };

    // Retain superseded objects until provenance and concurrent reference-safe cleanup exist.

    revalidatePath("/artist/dashboard");
    revalidatePath("/artist/catalog");
    revalidatePath("/artist/rights-holders");
    revalidatePath(`/artist/tracks/${nextSlug}`);
    revalidatePath("/buyer/catalog");

    return {
      success: true,
      message: parsed.saveMode === "publish" ? "Track changes submitted for review." : "Track updates saved successfully.",
      trackId,
      trackStatus: status,
      redirectTo: `/artist/tracks/${nextSlug}`
    };
  } catch (error) {
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
    throw new Error("Track writes require an authenticated artist account.");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user }, error: authError
  } = await supabase.auth.getUser();

  if (authError || !user?.email) {
    throw new Error("You must be signed in to submit music.");
  }

  const roleFromDatabase = await resolveArtistRole(user.id);
  const role = roleFromDatabase;
  if (role !== "artist") {
    throw new Error("Only artist accounts can submit tracks.");
  }

  return {
    id: user.id,
    email: user.email
  };
}

async function resolveArtistRole(userId: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await selectUserProfileCompat(client, userId);
  if (error) throw new Error("Unable to verify artist authorization.");
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

async function loadRequiredLicenseTypes(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase
    .from("license_types")
    .select("id, slug")
    .in("slug", [...requiredTrackLicenseSlugs]);

  if (error) {
    return {
      licenseTypes: null,
      errorMessage: error.message
    };
  }

  const licenseTypes = (data || []) as Array<{ id: string; slug: string }>;
  const missingSlugs = requiredTrackLicenseSlugs.filter(
    (slug) => !licenseTypes.some((licenseType) => licenseType.slug === slug)
  );

  if (missingSlugs.length > 0) {
    return {
      licenseTypes: null,
      errorMessage: `Required license types are missing: ${missingSlugs.join(", ")}. Run the license type seed/bootstrap before submitting tracks.`
    };
  }

  return {
    licenseTypes,
    errorMessage: null
  };
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
