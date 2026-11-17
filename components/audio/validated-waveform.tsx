"use client";

import { useEffect, useState } from 'react';
import { envelopePath, parseWaveform, previewEnvelope, readWaveformResponse } from '@/lib/media/waveform.mjs';

export function ValidatedWaveform({ url, format = 'preview', label = 'Preview waveform' }: {url:string;format?:'preview'|'master';label?:string}) {
  const [path, setPath] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setPath(''); setFailed(false);
    const deadline = setTimeout(() => { setFailed(true); controller.abort(); }, 15000);
    (async () => {
      // Only same-origin, authorized delivery routes; never arbitrary Storage URLs.
      const endpoint = new URL(url, window.location.origin);
      if (endpoint.origin !== window.location.origin || endpoint.username || endpoint.password || endpoint.hash ||
          !(format === 'master' ? /^\/api\/media\/[a-f0-9-]+\/[a-f0-9-]+$/.test(endpoint.pathname) : /^\/api\/buyer\/preview\/[a-f0-9-]+$/.test(endpoint.pathname))) throw Error();
      const response = await fetch(endpoint, { signal:controller.signal, cache:'no-store', credentials:'same-origin', redirect:'error' });
      const bytes = await readWaveformResponse(response, format === 'master' ? 360512 : 40000);
      let nextPath;
      if (format === 'master') {
        const wave = parseWaveform(bytes);
        // Master display is not subject to the preview's 60-second bound.
        const bins = Math.min(600, wave.minima.length);
        const points = Array.from({length:bins}, (_, i) => {
          const from = Math.floor(i * wave.minima.length / bins), to = Math.floor((i + 1) * wave.minima.length / bins);
          let low = 32767, high = -32768;
          for (let j = from; j < to; j++) { low = Math.min(low, wave.minima[j]); high = Math.max(high, wave.maxima[j]); }
          return [low, high];
        });
        nextPath = envelopePath({encoding:'tse-preview-envelope-v1', duration_us:wave.durationUs, points});
      } else nextPath = envelopePath(JSON.parse(new TextDecoder('utf-8', {fatal:true}).decode(bytes)));
      if (!controller.signal.aborted) setPath(nextPath);
    })().catch(() => { if (!controller.signal.aborted) setFailed(true); }).finally(() => clearTimeout(deadline));
    return () => { controller.abort(); clearTimeout(deadline); };
  }, [url, format]);
  return failed ? <span role="status">Waveform unavailable.</span> : <svg role="img" aria-label={label} viewBox="0 0 600 80" className="h-full w-full text-accent" preserveAspectRatio="none"><path d={path} fill="none" stroke="currentColor" strokeWidth="1" /></svg>;
}
