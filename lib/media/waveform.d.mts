export type Envelope = { encoding: 'tse-preview-envelope-v1'; duration_us: number; points: number[][] };
export type Waveform = { durationUs: number; minima: Int16Array; maxima: Int16Array };
export function parseWaveform(bytes: Uint8Array, expectedSourceHash?: string): Waveform;
export function previewEnvelope(waveform: Waveform, region: {startSample:number;endSample:number;sampleRate:number;durationUs:number}, columns?: number): Envelope;
export function envelopePath(envelope: Envelope): string;
export function readWaveformResponse(response: Response, maxBytes?: number): Promise<Uint8Array>;
