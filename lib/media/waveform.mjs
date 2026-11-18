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
  const points = [];
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
    points.push([low, high]);
  }
  return { encoding: 'tse-preview-envelope-v1', duration_us: durationUs, points };
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
