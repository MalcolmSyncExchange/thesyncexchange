import type { LeasedMediaJob, ValidatorResult, OperationalMediaError } from './profiles';
export type LeaseIdentity = Pick<LeasedMediaJob,'job_id'|'lease_epoch'|'lease_token'>;
export interface ValidatedSourceEvidence {
  asset_id: string; object_id: string; version: string; sha256: string;
  container: 'wav'|'aiff'|'aifc'|'flac'; frames: number; duration_us: number;
  sample_rate: number; channels: 1|2; bit_depth: number;
}
// Internal broker contract only; never add this to Artist/Buyer serialization.
export interface WorkerBroker {
  claim(): Promise<LeasedMediaJob|null>;
  heartbeat(lease: LeaseIdentity): Promise<void>;
  authorizeOutput(lease: LeaseIdentity): Promise<string>;
  complete(lease: LeaseIdentity,result: ValidatorResult): Promise<unknown>;
  fail(lease: LeaseIdentity,error: OperationalMediaError): Promise<unknown>;
}
export interface WaveformHeader {
  encoding: 'waveform_minmax_i16_v1'; profile: 'waveform-minmax-v1';
  source_asset_id: string; source_object_id: string; source_version: string;
  source_sha256: string; duration_us: number; points: number; points_per_second: 100;
}
