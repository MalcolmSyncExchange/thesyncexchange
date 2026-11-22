import assert from 'node:assert/strict';
import * as selection from '../../lib/media/preview-selection.mjs';
import { privatePlaybackSession } from '../../lib/media/private-playback-session.mjs';
import { elements, load as loadTsx } from './license-selection-harness.mjs';

export const signedMaster = 'https://media.fixture.invalid/signed-master';
export const masterRequest = { path: '/api/media/submission/master/original', method: 'POST' };

export function renderRecordingPlayer(props = {}) {
  const requests = [];
  const effects = [];
  const cleanups = [];
  const observers = new Set();
  const audio = {
    paused: true,
    currentTime: 0,
    pause() { this.paused = true; },
    play() { this.paused = false; },
    getAttribute() { return this.src; },
    removeAttribute() { delete this.src; },
    load() {}
  };

  function element(type, props) {
    if (props.ref) props.ref.current = type === 'audio' ? audio : {};
    return { type, props };
  }

  const { RecordingPlayer } = loadTsx('components/audio/recording-player.tsx', {
    react: {
      useCallback: callback => callback,
      useEffect: effect => { effects.push(effect); },
      useMemo: create => create(),
      useRef: current => ({ current }),
      useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}]
    },
    'react/jsx-runtime': { jsx: element, jsxs: element },
    'lucide-react': { Pause: 'pause', Play: 'play', Volume2: 'volume', VolumeX: 'mute' },
    '@/lib/media/preview-selection.mjs': selection,
    '@/lib/media/private-playback-session.mjs': {
      privatePlaybackSession: (submission, master) => privatePlaybackSession(submission, master, {
        now: () => 0,
        async fetcher(path, { method }) {
          requests.push({ path, method });
          return Response.json({ url: signedMaster, assetId: master, expiresAt: 55_000 });
        }
      })
    },
    './validated-waveform': { ValidatedWaveform: 'waveform' },
    './waveform-player.module.css': { default: {} }
  }, {
    document: { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} },
    IntersectionObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { observers.add(this); }
      disconnect() { observers.delete(this); }
    },
    setTimeout,
    clearTimeout
  });

  // Commit effects separately from rendering so the test can examine activation
  // before any viewport or input event is delivered.
  const tree = RecordingPlayer({
    submission: 'submission',
    source: { id: 'master', duration_us: 30_000_000 },
    waveformUrl: '/fixture/waveform',
    selection: { start_ms: 0, end_ms: 30_000 },
    ...props
  });
  return {
    requests,
    audio,
    mount() {
      for (const effect of effects) {
        const cleanup = effect();
        if (cleanup) cleanups.push(cleanup);
      }
    },
    intersect(isIntersecting) {
      for (const { callback } of [...observers]) callback([{ isIntersecting }]);
    },
    button(label) {
      const buttons = elements(tree, node => {
        const children = node.props.children;
        return node.type === 'button' && [].concat(children).includes(label);
      });
      assert.equal(buttons.length, 1, label);
      return buttons[0].props;
    },
    unmount() {
      for (const cleanup of cleanups.reverse()) cleanup();
    }
  };
}
