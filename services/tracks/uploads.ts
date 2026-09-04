"use client";

import {
  getPublicStorageUrl,
  type StorageAssetRef,
  type TrackAssetKind
} from "@/lib/storage";
import { createBrowserSupabaseClient } from "@/services/supabase/client";

export interface UploadedAsset extends StorageAssetRef {
  publicUrl: string | null;
}

export async function uploadTrackAsset({
  file,
  kind,
  scope
}: {
  file: File;
  kind: TrackAssetKind;
  scope: string;
}): Promise<UploadedAsset> {
  const signedUploadResponse = await fetch("/api/storage/upload-url", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      kind,
      scope,
      fileName: file.name,
      fileSize: file.size,
      contentType: file.type || null
    })
  });
  const signedUpload = (await signedUploadResponse.json().catch(() => null)) as
    | (UploadedAsset & { token?: string })
    | { error?: string }
    | null;

  if (!signedUploadResponse.ok) {
    throw new Error(
      signedUpload && "error" in signedUpload && signedUpload.error
        ? signedUpload.error
        : "Unable to prepare asset upload."
    );
  }

  if (!signedUpload || !("bucket" in signedUpload) || !("path" in signedUpload) || !signedUpload.token) {
    throw new Error("Upload preparation response was incomplete.");
  }

  const supabase = createBrowserSupabaseClient();
  const { error } = await supabase.storage
    .from(signedUpload.bucket)
    .uploadToSignedUrl(signedUpload.path, signedUpload.token, file, {
      contentType: file.type || undefined
    });

  if (error) {
    throw new Error(error.message || "Unable to upload asset.");
  }

  return {
    bucket: signedUpload.bucket,
    path: signedUpload.path,
    publicUrl: signedUpload.publicUrl || getPublicStorageUrl(signedUpload.bucket, signedUpload.path)
  };
}

export async function deleteTrackAssets(assets: StorageAssetRef[]) {
  if (!assets.length) {
    return;
  }

  await fetch("/api/storage/delete", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({ assets })
  }).catch(() => undefined);
}
