const fail = () => { throw new Error('Invalid waveform'); };

// Server-generated envelope only. No browser decoding or synthetic waveform bars.
export function parseWaveform(bytes, expectedSourceHash) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 516 || bytes.byteLength > 360512) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(0, true);
  if (length < 2 || length > 508) fail();
  let header;
  try { header = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(4, 4 + length))); } catch { fail(); }
  if (header.encoding !== 'waveform_minmax_i16_v1' || header.profile !== 'waveform-minmax-v1' || header.points_per_second !== 100 ||
      !Number.isSafeInteger(header.duration_us) || header.duration_us < 1000000 || header.duration_us > 900000000 ||
      !Number.isSafeInteger(header.points) || header.points !== Math.ceil(header.duration_us / 10000) ||
      bytes.byteLength !== 512 + header.points * 4 || !/^[a-f0-9]{64}$/.test(header.source_sha256) ||
      (expectedSourceHash !== undefined && header.source_sha256 !== expectedSourceHash)) fail();
  const minima = new Int16Array(header.points), maxima = new Int16Array(header.points);
  for (let i = 0; i < header.points; i++) {
    minima[i] = view.getInt16(512 + i * 4, true); maxima[i] = view.getInt16(514 + i * 4, true);
    if (minima[i] > maxima[i]) fail();
  }
  return { durationUs: header.duration_us, minima, maxima };
}

// Output contains only the authorized preview region, never master identifiers.
// Aggregate every covered source point so a narrow transient is not skipped.
export function previewEnvelope(waveform, { startSample, endSample, sampleRate, durationUs }, columns = 600) {
  if (![startSample, endSample, sampleRate, durationUs, columns].every(Number.isSafeInteger) ||
      startSample < 0 || endSample <= startSample || sampleRate < 8000 || sampleRate > 192000 ||
      durationUs < 1 || durationUs > 61000000 || columns < 1 || columns > 600) fail();
  const startUs = startSample * 1000000 / sampleRate, endUs = endSample * 1000000 / sampleRate;
  if (endUs > waveform.durationUs + 1 || endUs - startUs > 60000001 || Math.abs(durationUs - (endUs - startUs)) > 100001) fail();
  const points = [], levels = [];
  for (let i = 0; i < columns; i++) {
    const fromUs = startUs + i * durationUs / columns;
    const toUs = Math.min(endUs, startUs + (i + 1) * durationUs / columns);
    let low = 0, high = 0;
    if (fromUs < endUs) {
      const from = Math.floor(fromUs / 10000), to = Math.min(waveform.minima.length, Math.ceil(toUs / 10000));
      low = 32767; high = -32768;
      for (let j = from; j < to; j++) { low = Math.min(low, waveform.minima[j]); high = Math.max(high, waveform.maxima[j]); }
      if (low > high) fail();
      if (startUs + (i + 1) * durationUs / columns > endUs) { low = Math.min(low, 0); high = Math.max(high, 0); }
    }
    const from = Math.max(0,Math.floor(fromUs/10000)), to = Math.min(waveform.minima.length,Math.ceil(toUs/10000));
    let sum = 0;
    for(let j=from;j<to;j++) sum += Math.max(Math.abs(waveform.minima[j]),Math.abs(waveform.maxima[j]));
    levels.push(fromUs < endUs && to > from ? Math.round(sum/(to-from)) : 0);
    points.push([low, high]);
  }
  return { encoding: 'tse-preview-envelope-v1', duration_us: durationUs, points, levels };
}

export function envelopePath(envelope) {
  if (envelope?.encoding !== 'tse-preview-envelope-v1' || !Number.isSafeInteger(envelope.duration_us) || envelope.duration_us < 1 ||
      envelope.duration_us > 900000000 || !Array.isArray(envelope.points) || !envelope.points.length || envelope.points.length > 600) fail();
  return envelope.points.map((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(v => Number.isInteger(v) && v >= -32768 && v <= 32767) || pair[0] > pair[1]) fail();
    const x = (i + 0.5) / envelope.points.length * 600;
    return `M${x.toFixed(2)},${(40 - pair[0] / 32768 * 38).toFixed(2)}V${(40 - pair[1] / 32768 * 38).toFixed(2)}`;
  }).join('');
}

export async function readWaveformResponse(response, maxBytes = 360512) {
  if (!response.ok || !response.body) fail();
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > maxBytes) fail(); chunks.push(value); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

// Peak-preserving display reduction and one linear gain for the entire region.
// Silence stays silent; relative amplitude is never randomized or per-bar boosted.
export function waveformBars(envelope, columns = 120) {
  envelopePath(envelope); // Reuse strict, bounded envelope validation.
  if (!Number.isInteger(columns) || columns < 1 || columns > 600) fail();
  const count = Math.min(columns, envelope.points.length);
  const peaks = Array.from({length:count}, (_, i) => {
    let peak = 0;
    for (let j = Math.floor(i * envelope.points.length / count); j < Math.floor((i + 1) * envelope.points.length / count); j++) {
      peak = Math.max(peak, Math.abs(envelope.points[j][0]), Math.abs(envelope.points[j][1]));
    }
    return peak;
  });
  const maximum = Math.max(...peaks);
  const levels = envelope.levels;
  if (levels !== undefined && (!Array.isArray(levels) || levels.length !== envelope.points.length || levels.some((v,i) => !Number.isInteger(v) || v<0 || v>Math.max(Math.abs(envelope.points[i][0]),Math.abs(envelope.points[i][1]))))) fail();
  const body = peaks.map((peak,i) => {
    if(!levels)return peak;
    const from=Math.floor(i*levels.length/count),to=Math.floor((i+1)*levels.length/count);
    return levels.slice(from,to).reduce((sum,v)=>sum+v,0)/(to-from);
  });
  return { heights:body.map(p => maximum ? p / maximum : 0), peakHeights:peaks.map(p => maximum ? p / maximum : 0), gain:maximum ? 32768 / maximum : 1 };
}

export function masterEnvelope(wave, region) {
  if (region) return previewEnvelope(wave, region);
  const count = Math.min(600, wave.minima.length), points = [], levels = [];
  for (let i = 0; i < count; i++) {
    let low = 32767, high = -32768, sum = 0;
    const from = Math.floor(i * wave.minima.length / count), to = Math.floor((i + 1) * wave.minima.length / count);
    for (let j = from; j < to; j++) {
      low = Math.min(low, wave.minima[j]); high = Math.max(high, wave.maxima[j]);
      sum += Math.max(Math.abs(wave.minima[j]),Math.abs(wave.maxima[j]));
    }
    points.push([low, high]); levels.push(Math.round(sum/(to-from)));
  }
  return {encoding:'tse-preview-envelope-v1', duration_us:wave.durationUs, points, levels};
}

export function seekTime(fraction, duration) {
  if (!Number.isFinite(fraction) || !Number.isFinite(duration) || duration <= 0) return 0;
  return Math.max(0, Math.min(1, fraction)) * duration;
}

// Use the generated asset's immutable region, never the artist's editable next
// selection. Match worker.region's full-short-track and floor-to-frame rules.
export function artistPreviewRegion(asset, source) {
  if (!source || asset.sourceId !== source.id || ![asset.startMs,asset.endMs,asset.durationUs,source.sampleRate,source.durationUs].every(Number.isSafeInteger) ||
    source.sampleRate<8000 || source.sampleRate>192000 || asset.startMs<0 || asset.endMs<=asset.startMs) return undefined;
  const startSample=Math.floor(asset.startMs*source.sampleRate/1000);
  const endSample=source.durationUs<15000000 && asset.startMs===0 && asset.endMs===Math.floor(source.durationUs/1000)
    ? Math.round(source.durationUs*source.sampleRate/1000000) : Math.floor(asset.endMs*source.sampleRate/1000);
  if(endSample<=startSample || asset.endMs*1000>source.durationUs+1000) return undefined;
  return {startSample,endSample,sampleRate:source.sampleRate,durationUs:asset.durationUs};
}
