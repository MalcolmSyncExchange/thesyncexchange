// Never attach parser/provider errors as causes: only these codes cross the boundary.
export class MediaError extends Error {
  constructor(code) { super(code); this.code = code; this.retryable = ['temporary_system_error', 'validator_timeout'].includes(code); }
}
export const deny = () => { throw new MediaError('worker_lease_expired'); };
export const safeError = error => error instanceof MediaError ? error : new MediaError('temporary_system_error');
export const limits = Object.freeze({ tempBytes: 256_000_000, processMs: 480_000, probeBytes: 16_384, stderrBytes: 8192, memoryBytes: 805_306_368 });
