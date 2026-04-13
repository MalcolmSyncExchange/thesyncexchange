"use client";

import {
  type StorageAssetRef,
  type TrackAssetKind
} from "@/lib/storage";

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
  const formData = new FormData();
  formData.set("file", file);
  formData.set("kind", kind);
  formData.set("scope", scope);

  const response = await fetch("/api/storage/upload", {
    method: "POST",
    body: formData
  });
  const payload = (await response.json().catch(() => null)) as UploadedAsset | { error?: string } | null;

  if (!response.ok) {
    throw new Error(payload && "error" in payload && payload.error ? payload.error : "Unable to upload asset.");
  }

  if (!payload || !("bucket" in payload) || !("path" in payload)) {
    throw new Error("Upload response was incomplete.");
  }

  return payload;
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
