export type PreparedArtifact = {size: number; read(offset: number, length: number): Promise<Uint8Array>; close(): Promise<void>};
export function spoolArtifact(response: Response, expected: {byteSize: number; sha256: string}, options?: {signal?: AbortSignal}): Promise<PreparedArtifact>;
export function guardedArtifactStream(prepared: PreparedArtifact, authorization: {expiresAt: string}, operations: {signal?: AbortSignal; check(): Promise<boolean>; record(outcome: string, count: number): Promise<boolean>}): Promise<ReadableStream<Uint8Array>>;
