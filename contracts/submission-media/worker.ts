import type { LeasedMediaJob, ValidatorResult, OperationalMediaError } from './profiles';
export type LeaseIdentity = Pick<LeasedMediaJob,'job_id'|'lease_epoch'|'lease_token'>;
export interface ValidatedSourceEvidence {
  asset_id: string; object_id: string; version: string; sha256: string;
  container: 'wav'|'aiff'|'aifc'|'flac'; frames: number; duration_us: number;
  sample_rate: number; channels: 1|2; bit_depth: number;
}
// Internal broker contract only; never add this to Artist/Buyer serialization.
export interface WorkerBroker<OutputCapability = string> {
  claim(): Promise<LeasedMediaJob|null>;
  read(lease: LeaseIdentity, target: string, signal?: AbortSignal): Promise<LeasedMediaJob>;
  writeOutput(lease: LeaseIdentity, capability: OutputCapability, result: ValidatorResult, signal?: AbortSignal): Promise<unknown>;
  heartbeat(lease: LeaseIdentity): Promise<void>;
  authorizeOutput(lease: LeaseIdentity): Promise<OutputCapability>;
  complete(lease: LeaseIdentity,result: ValidatorResult): Promise<unknown>;
  fail(lease: LeaseIdentity,error: OperationalMediaError): Promise<unknown>;
}
export interface WaveformHeader {
  encoding: 'waveform_minmax_i16_v1'; profile: 'waveform-minmax-v1';
  source_asset_id: string; source_object_id: string; source_version: string;
  source_sha256: string; duration_us: number; points: number; points_per_second: 100;
}

export interface ExecutionIdentity { permit_id: string; execution_name: string; }
export interface TargetedNomination { job_id: string; asset_id: string; job_type: LeasedMediaJob['job_type']; profile: string; state: 'queued'|'retry_wait'|'running'; attempt: number; correlation_id: string; }
