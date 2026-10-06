import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { toBuyerSafeTrackPreview } from "../services/buyer/contract.ts";

const buyerTrack = {
  id: "track-a",
  slug: "midnight-run",
  title: "Midnight Run",
  artist_name: "Maya Sol",
  description: "Public description",
  genre: "Electronic",
  subgenre: "Synthwave",
  mood: ["Driving"],
  bpm: 118,
  key: "Am",
  duration_seconds: 184,
  instrumental: false,
  vocals: true,
  explicit: false,
  release_year: 2025,
  cover_art_url: "https://public.test/cover.webp",
  audio_file_url: "https://public.test/preview.webp",
  waveform_preview_url: "https://public.test/waveform.webp",
  rights_holders: [{ id: "right-a", track_id: "track-a", name: "Maya Sol", role_type: "Writer", ownership_percent: 100, email: "private@test.invalid" }],
  license_options: [{ id: "license-a", name: "Digital", slug: "digital", description: "Digital use", exclusive: false, base_price: 149, price_override: null, terms_summary: "Summary", active: true }],
  artist_user_id: "private-artist-id",
  audio_file_path: "private-user/track-a/audio/full-master.wav",
  preview_file_path: "public-user/track-a/previews/preview.mp3",
  cover_art_path: "public-user/track-a/cover/cover.webp",
  approved_by: "private-admin-id",
  finance: { payoutEmail: "private@test.invalid" }
};

test("Buyer Preview serializes only the approved buyer-safe track contract", () => {
  const preview = toBuyerSafeTrackPreview(buyerTrack);
  assert.deepEqual(Object.keys(preview).sort(), [
    "artistName", "bpm", "coverArtUrl", "description", "durationSeconds", "explicit", "genre", "id",
    "instrumental", "licenseOptions", "moods", "musicalKey", "previewAudioUrl", "releaseYear",
    "rightsCredits", "slug", "subgenre", "title", "vocals", "waveformUrl"
  ].sort());
  const serialized = JSON.stringify(preview);
  for (const forbidden of ["audio_file_path", "track-audio", "purchase-assets", "private@test.invalid", "private-admin-id", "payoutEmail"]) {
    assert.equal(serialized.includes(forbidden), false, `Buyer Preview leaked ${forbidden}`);
  }
  assert.deepEqual(preview.rightsCredits, [{ id: "right-a", name: "Maya Sol", role: "Writer", percentage: 100 }]);
});

test("shared player owns one audio element and exposes seek, volume, mute and recovery states", async () => {
  const source = await readFile(new URL("../components/audio/preview-audio-provider.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/<audio\b/g) || []).length, 1);
  for (const requirement of ["activeIdRef", "audio.currentTime", "audio.volume", "audio.muted", "Buyer preview volume", "Buyer preview position", "onWaiting", "onError"]) {
    assert.match(source, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of ["audio_file_path", "track-audio", "purchase-assets", "createSignedUrl", "signAuthorizedTrackAudio"]) {
    assert.equal(source.includes(forbidden), false, `shared player references ${forbidden}`);
  }
});

test("Buyer discovery composes the shared player without replacing its filter contract", async () => {
  const source = await readFile(new URL("../components/audio/buyer-discovery-provider.tsx", import.meta.url), "utf8");
  assert.match(source, /<PreviewAudioProvider>/);
  assert.match(source, /filters, setFilters/);
  assert.match(source, /export function PreviewButton/);
});

test("local visual QA uses the preview-only fixture and never the Full Master fixture", async () => {
  const demoData = await readFile(new URL("../lib/demo-data.ts", import.meta.url), "utf8");
  assert.match(demoData, /\/demo\/audio-preview\.wav/);
  assert.doesNotMatch(demoData, /fixtures\/full-track|full-track\.wav/);
});

test("the public demo preview is audible synthetic PCM rather than the zero-frame test fixture", async () => {
  const audio = await readFile(new URL("../public/demo/audio-preview.wav", import.meta.url));
  assert.equal(audio.toString("ascii", 0, 4), "RIFF");
  assert.equal(audio.toString("ascii", 8, 12), "WAVE");
  assert.equal(audio.readUInt16LE(22), 1);
  assert.equal(audio.readUInt32LE(24), 22050);
  assert.equal(audio.readUInt16LE(34), 16);
  assert.ok(audio.length > 100_000, "the runtime demo should contain several seconds of samples");
  assert.ok(audio.subarray(44).some(byte => byte !== 0), "the runtime demo should contain audible samples");
});
