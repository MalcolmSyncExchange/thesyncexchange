export type Envelope = { encoding: 'tse-preview-envelope-v1'; duration_us: number; points: number[][]; levels?:number[] };
export type Waveform = { durationUs: number; minima: Int16Array; maxima: Int16Array };
export function parseWaveform(bytes: Uint8Array, expectedSourceHash?: string): Waveform;
export function previewEnvelope(waveform: Waveform, region: {startSample:number;endSample:number;sampleRate:number;durationUs:number}, columns?: number): Envelope;
export function envelopePath(envelope: Envelope): string;
export function readWaveformResponse(response: Response, maxBytes?: number): Promise<Uint8Array>;
export function waveformBars(envelope: Envelope, columns?: number): {heights:number[];peakHeights:number[];gain:number};
export function masterEnvelope(wave: Waveform, region?: {startSample:number;endSample:number;sampleRate:number;durationUs:number}): Envelope;
export function seekTime(fraction: number, duration: number): number;
export function artistPreviewRegion(asset:{sourceId?:string;startMs?:number;endMs?:number;durationUs?:number},source?:{id:string;sampleRate?:number;durationUs?:number}): {startSample:number;endSample:number;sampleRate:number;durationUs:number}|undefined;

export function waveformBarGeometry(height:number, displayHeight?:number): {y:number;height:number};
