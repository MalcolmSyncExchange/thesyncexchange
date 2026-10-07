"use client";

import Image from "next/image";
import Link from "next/link";
import {
  LoaderCircle,
  Music2,
  Pause,
  Play,
  Volume1,
  Volume2,
  VolumeX,
  X
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/lib/utils";
import styles from "./preview-audio-provider.module.css";

export interface PreviewAudioTrack {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  artworkUrl: string | null;
  previewUrl: string | null;
  waveformUrl: string | null;
  durationSeconds: number;
  href?: string;
}

interface PreviewAudioContextValue {
  active: PreviewAudioTrack | null;
  playing: boolean;
  loading: boolean;
  error: string;
  time: number;
  duration: number;
  volume: number;
  muted: boolean;
  toggle: (track: PreviewAudioTrack) => Promise<void>;
  close: () => void;
  seek: (seconds: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
}

const PreviewAudioContext = createContext<PreviewAudioContextValue | null>(null);
const previewFailureMessage = "Buyer preview unavailable. Try again or choose another track.";

export function usePreviewAudio() {
  const value = useContext(PreviewAudioContext);
  if (!value) throw new Error("Preview audio controls require PreviewAudioProvider.");
  return value;
}

export function PreviewAudioProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  const requestRef = useRef(0);
  const [active, setActive] = useState<PreviewAudioTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.72);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = muted;
  }, [muted, volume]);

  const toggle = useCallback(async (track: PreviewAudioTrack) => {
    const audio = audioRef.current;
    if (!audio || !track.previewUrl) return;
    const requestToken = ++requestRef.current;
    const retryingFailedPreview = activeIdRef.current === track.id && Boolean(error);
    setError("");

    if (activeIdRef.current === track.id && !audio.paused) {
      audio.pause();
      return;
    }

    if (activeIdRef.current !== track.id) {
      audio.pause();
      activeIdRef.current = track.id;
      audio.src = track.previewUrl;
      audio.load();
      setActive(track);
      setTime(0);
      setDuration(track.durationSeconds || 0);
    } else if (retryingFailedPreview) {
      // A preview fetch is safe to retry; this reloads only the current public preview.
      audio.load();
    }

    setLoading(true);
    try {
      await audio.play();
    } catch {
      if (requestToken === requestRef.current) {
        setPlaying(false);
        setLoading(false);
        setError(previewFailureMessage);
      }
    }
  }, [error]);

  const close = useCallback(() => {
    ++requestRef.current;
    const audio = audioRef.current;
    audio?.pause();
    audio?.removeAttribute("src");
    audio?.load();
    activeIdRef.current = null;
    setActive(null);
    setPlaying(false);
    setLoading(false);
    setTime(0);
    setDuration(0);
    setError("");
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const safeDuration = Number.isFinite(audio.duration) ? audio.duration : duration;
    const next = Math.max(0, Math.min(seconds, safeDuration || 0));
    audio.currentTime = next;
    setTime(next);
  }, [duration]);

  const setVolume = useCallback((next: number) => {
    const normalized = Math.max(0, Math.min(1, next));
    setVolumeState(normalized);
    if (normalized > 0) setMuted(false);
  }, []);

  const toggleMute = useCallback(() => setMuted(current => !current), []);
  const value = useMemo(() => ({
    active,
    playing,
    loading,
    error,
    time,
    duration,
    volume,
    muted,
    toggle,
    close,
    seek,
    setVolume,
    toggleMute
  }), [active, close, duration, error, loading, muted, playing, seek, time, toggle, toggleMute, volume, setVolume]);

  return (
    <PreviewAudioContext.Provider value={value}>
      <div className={active ? styles.contentWithPlayer : undefined} data-player-error={Boolean(active && error)}>{children}</div>
      <audio
        ref={audioRef}
        preload="metadata"
        onLoadStart={() => activeIdRef.current && setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => { setPlaying(true); setLoading(false); }}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onWaiting={() => setLoading(true)}
        onTimeUpdate={() => setTime(audioRef.current?.currentTime || 0)}
        onDurationChange={() => {
          const next = audioRef.current?.duration;
          if (Number.isFinite(next)) setDuration(Number(next));
        }}
        onError={() => {
          setPlaying(false);
          setLoading(false);
          if (activeIdRef.current) setError(previewFailureMessage);
        }}
      />
      {active ? <PersistentPreviewPlayer /> : null}
    </PreviewAudioContext.Provider>
  );
}

export function PreviewAudioButton({
  track,
  className,
  compact = false
}: {
  track: PreviewAudioTrack;
  className?: string;
  compact?: boolean;
}) {
  const { active, playing, loading, toggle } = usePreviewAudio();
  const selected = active?.id === track.id;
  const isPlaying = selected && playing;
  const isLoading = selected && loading;
  const label = !track.previewUrl ? "Buyer preview unavailable" : isPlaying ? "Pause Buyer preview" : "Play Buyer preview";

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={!track.previewUrl}
      aria-label={`${label} for ${track.title}`}
      aria-pressed={isPlaying}
      onClick={() => void toggle(track)}
    >
      {isLoading ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
      {compact ? <span className="sr-only">{label}</span> : <span>{!track.previewUrl ? "Unavailable" : isPlaying ? "Pause" : "Preview"}</span>}
    </Button>
  );
}

function PersistentPreviewPlayer() {
  const { active, playing, loading, error, time, duration, volume, muted, toggle, close, seek, setVolume, toggleMute } = usePreviewAudio();
  const [volumeOpen, setVolumeOpen] = useState(false);
  if (!active) return null;
  const total = duration || active.durationSeconds || 0;
  const VolumeIcon = muted || volume === 0 ? VolumeX : volume < 0.55 ? Volume1 : Volume2;
  const identity = (
    <>
      <strong>{active.title}</strong>
      <span>{active.artistName} · Buyer preview</span>
    </>
  );

  return (
    <section className={styles.player} aria-label="Buyer preview player" data-testid="persistent-preview-player" data-error={Boolean(error)}>
      <div className={styles.inner}>
        <div className={styles.identity}>
          <div className={styles.artwork}>
            {active.artworkUrl ? <Image src={active.artworkUrl} alt="" fill sizes="48px" className={styles.artworkImage} /> : <Music2 aria-hidden="true" />}
          </div>
          <div className={styles.trackText}>{active.href ? <Link href={active.href}>{identity}</Link> : identity}</div>
        </div>
        <Button type="button" className={styles.playButton} aria-label={`${playing ? "Pause" : "Play"} ${active.title}`} onClick={() => void toggle(active)}>
          {loading ? <LoaderCircle aria-hidden="true" className={styles.spinner} /> : playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
        </Button>
        <div className={styles.timeline}>
          {active.waveformUrl ? <Image src={active.waveformUrl} alt="" fill sizes="(max-width: 850px) 50vw, 600px" unoptimized className={styles.waveformImage} /> : null}
          <input
            type="range"
            min={0}
            max={total || 1}
            step={0.1}
            value={Math.min(time, total || 1)}
            disabled={!total}
            aria-label="Buyer preview position"
            aria-valuetext={`${formatDuration(Math.floor(time))} of ${formatDuration(Math.floor(total))}`}
            onChange={event => seek(Number(event.target.value))}
          />
        </div>
        <span className={styles.time}>{formatDuration(Math.floor(time))} / {formatDuration(Math.floor(total))}</span>
        <div className={styles.volume} data-open={volumeOpen}>
          <Button type="button" variant="ghost" className={styles.iconButton} aria-label={muted ? "Unmute Buyer preview" : "Mute Buyer preview"} aria-pressed={muted} onClick={toggleMute}>
            <VolumeIcon aria-hidden="true" />
          </Button>
          <Button type="button" variant="ghost" className={styles.mobileVolumeButton} aria-label="Open volume control" aria-expanded={volumeOpen} onClick={() => setVolumeOpen(current => !current)}>
            <VolumeIcon aria-hidden="true" />
          </Button>
          <label className={styles.volumeSlider}>
            <span className="sr-only">Buyer preview volume</span>
            <input type="range" min={0} max={1} step={0.01} value={muted ? 0 : volume} onChange={event => setVolume(Number(event.target.value))} />
          </label>
        </div>
        <Button type="button" variant="ghost" className={styles.iconButton} aria-label="Close Buyer preview player" onClick={close}><X aria-hidden="true" /></Button>
        {error ? (
          <div className={styles.errorNotice} role="alert">
            <span>{error}</span>
            <Button type="button" variant="outline" className={styles.retryButton} onClick={() => void toggle(active)}>Retry</Button>
          </div>
        ) : null}
        <div className={styles.playerStatus} aria-live="polite">{error ? "" : loading ? "Loading Buyer preview" : playing ? `Playing ${active.title}` : `Paused ${active.title}`}</div>
      </div>
    </section>
  );
}
