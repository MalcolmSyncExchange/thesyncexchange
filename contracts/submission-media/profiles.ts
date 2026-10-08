// Immutable provenance identifiers. Changing a profile requires a new identifier.
export const MEDIA_PROFILES = Object.freeze({
  source: { version: "source-validator-v1", maxBytes: 250_000_000, containers: ["wav", "aiff", "aifc", "flac"], minDurationUs: 1_000_000, maxDurationUs: 900_000_000, maxChannels: 2, minSampleRate: 8_000, maxSampleRate: 192_000 },
  preview: { version: "preview-aac-lc-v1", container: "m4a", codec: "aac_lc", bitrate: 256_000, sampleRate: 44_100, maxBytes: 4_000_000, minMs: 15_000, maxMs: 60_000, defaultMs: 30_000, precisionMs: 100, normalization: false },
  waveform: { version: "waveform-minmax-v1", encoding: "waveform_minmax_i16_v1", pointsPerSecond: 100, maxPoints: 90_000, maxBytes: 2_000_000 },
  artwork: { version: "artwork-validator-v1", containers: ["jpeg", "png", "webp"], maxBytes: 10_000_000, minDimension: 256, maxDimension: 8_192, maxPixels: 32_000_000, maxAspectRatio: 4, animated: false, squareRequired: false }
} as const);
export const ARTIST_MEDIA_ERRORS = ["UNSUPPORTED_FORMAT", "FILE_TOO_LARGE", "AUDIO_UNREADABLE", "NO_AUDIO_FRAMES", "UNSUPPORTED_AUDIO_CONFIGURATION", "UPLOAD_INTERRUPTED", "VALIDATION_FAILED", "WAVEFORM_GENERATION_FAILED", "PREVIEW_GENERATION_FAILED", "ARTWORK_INVALID", "STALE_REVISION", "TEMPORARY_SYSTEM_ERROR"] as const;
export type ArtistMediaError = typeof ARTIST_MEDIA_ERRORS[number];
export const OPERATIONAL_MEDIA_ERRORS = ["validator_timeout", "storage_identity_mismatch", "checksum_mismatch", "worker_lease_expired", "unsupported_format", "file_too_large", "audio_unreadable", "no_audio_frames", "unsupported_audio_configuration", "waveform_generation_failed", "preview_generation_failed", "artwork_invalid", "temporary_system_error"] as const;
export type OperationalMediaError = typeof OPERATIONAL_MEDIA_ERRORS[number];
export type AssetKind = "source_master" | "buyer_preview" | "artwork" | "waveform";
export type AssetTechnicalState = "reserved" | "uploaded" | "verifying" | "ready" | "failed" | "expired";
export interface ValidatorResult {
  sha256: string;
  actual_bytes: number;
  container: string;
  build_digest: `sha256:${string}`;
  codec?: string;
  frames?: number;
  duration_us?: number;
  sample_rate?: number;
  channels?: number;
  bit_depth?: number;
  width?: number;
  height?: number;
  animated?: false;
  waveform_points?: number;
  source_sha256?: string;
}
// Trusted broker-only envelope, never an Artist/Buyer DTO. No arbitrary URL input.
export interface LeasedMediaJob {
  job_id: string;
  lease_epoch: number;
  lease_token: string;
  job_type: "source_validation" | "artwork_validation" | "waveform_generation" | "preview_generation" | "legacy_source_verification";
  profile: string;
  asset_id: string;
  bucket: string;
  path: string;
  object_id: string | null;
  version: string | null;
  source: { asset_id: string; bucket: string; path: string; object_id: string; version: string; sha256: string; sample_rate: number; frames: number } | null;
  start_sample: number | null;
  end_sample: number | null;
}
export interface MediaWorkerContract {
  claim(): Promise<LeasedMediaJob | null>;
  heartbeat(job: Pick<LeasedMediaJob, "job_id" | "lease_epoch" | "lease_token">): Promise<void>;
  complete(job: Pick<LeasedMediaJob, "job_id" | "lease_epoch" | "lease_token">, result: ValidatorResult): Promise<void>;
  fail(job: Pick<LeasedMediaJob, "job_id" | "lease_epoch" | "lease_token">, code: OperationalMediaError): Promise<void>;
}
// Opaque Artist projection. Dedicated playback/upload capabilities are separate APIs.
export interface ArtistMediaAsset {
  id: string;
  kind: AssetKind;
  state: AssetTechnicalState;
  filename?: string;
  bytes?: number;
  duration_us?: number;
  format?: string;
  sample_rate?: number;
  bit_depth?: number;
  channels?: number;
  width?: number;
  height?: number;
  source_id?: string;
  start_ms?: number;
  end_ms?: number;
  profile?: string;
  points?: number;
  accepted: boolean;
  error_code?: ArtistMediaError;
}
export interface SubmissionAudioState {
  submission_id: string;
  track_id: string | null;
  revision: number;
  source: ArtistMediaAsset | null;
  current_source: ArtistMediaAsset | null;
  accepted_preview: ArtistMediaAsset | null;
  active_preview: ArtistMediaAsset | null;
  accepted_artwork: ArtistMediaAsset | null;
  active_artwork: ArtistMediaAsset | null;
  selection: { master_id: string | null; start_ms: number | null; end_ms: number | null; revision: number };
  waveform: ArtistMediaAsset | null;
  assets: ArtistMediaAsset[];
  review: { id: string; state: "pending" | "approved" | "rejected" } | null;
  last_saved_at: string;
}
