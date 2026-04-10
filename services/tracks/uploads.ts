"use client";

import { env } from "@/lib/env";
import { createBrowserSupabaseClient } from "@/services/supabase/client";

export interface UploadedAsset {
  path: string;
  publicUrl: string;
}

export async function uploadTrackAsset({
  file,
  userId,
  kind
}: {
  file: File;
  userId: string;
  kind: "cover-art" | "audio" | "waveforms";
}): Promise<UploadedAsset> {
  const supabase = createBrowserSupabaseClient();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${userId}/${kind}/${Date.now()}-${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage.from(env.trackAssetsBucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data } = supabase.storage.from(env.trackAssetsBucket).getPublicUrl(path);

  return {
    path,
    publicUrl: data.publicUrl
  };
}

export async function deleteTrackAssets(paths: string[]) {
  if (!paths.length) {
    return;
  }

  const supabase = createBrowserSupabaseClient();
  await supabase.storage.from(env.trackAssetsBucket).remove(paths);
}
