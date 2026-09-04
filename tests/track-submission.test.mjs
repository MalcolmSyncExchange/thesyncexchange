import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  rightsHolderRoleValues,
  trackSubmissionClientSchema,
  trackSubmissionServerSchema
} from "../lib/validation/track-submission.ts";

const validSubmission = {
  title: "Launch Track",
  description: "A full production-ready description for launch submission.",
  genre: "Electronic",
  subgenre: "Cinematic",
  moods: "Focused, Premium",
  bpm: 120,
  key: "Am",
  duration: 180,
  instrumental: false,
  vocals: true,
  explicit: false,
  lyrics: "",
  releaseYear: 2026,
  priceDigital: 1200,
  priceBroadcast: 4800,
  priceExclusive: 18000,
  saveMode: "draft",
  rightsHolders: [{ name: "Owner", email: "owner@example.com", roleType: "owner", ownershipPercent: 100 }]
};

test("track submission surfaces the instrumental and vocals conflict during client validation", () => {
  const result = trackSubmissionClientSchema.safeParse({
    ...validSubmission,
    instrumental: true,
    vocals: true
  });

  assert.equal(result.success, false);
  assert.deepEqual(
    result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    [{ path: "vocals", message: "A track marked instrumental cannot also be marked as having vocals." }]
  );
});

test("rights holder roles match the production database constraint", () => {
  assert.deepEqual([...rightsHolderRoleValues], ["writer", "producer", "publisher", "owner", "other"]);

  const result = trackSubmissionServerSchema.safeParse({
    ...validSubmission,
    saveMode: "publish",
    coverArtPath: "cover.png",
    audioFilePath: "source.wav",
    previewFilePath: "preview.mp3",
    waveformPath: "",
    uploadedAssets: [],
    rightsHolders: [{ name: "Owner", email: "owner@example.com", roleType: "master owner", ownershipPercent: 100 }]
  });

  assert.equal(result.success, false);
  assert.equal(result.error.issues[0].message, "Choose a valid rights holder role.");
});

test("track asset uploads use signed Supabase URLs instead of proxying files through app functions", () => {
  const uploadHelperSource = readFileSync(new URL("../services/tracks/uploads.ts", import.meta.url), "utf8");
  const signedUploadRouteSource = readFileSync(new URL("../app/api/storage/upload-url/route.ts", import.meta.url), "utf8");

  assert.ok(uploadHelperSource.includes("/api/storage/upload-url"));
  assert.ok(uploadHelperSource.includes("uploadToSignedUrl"));
  assert.ok(!uploadHelperSource.includes('/api/storage/upload"'));
  assert.ok(signedUploadRouteSource.includes("createSignedUploadUrl"));
  assert.ok(signedUploadRouteSource.includes("Only artist or admin accounts can upload track assets"));
});
