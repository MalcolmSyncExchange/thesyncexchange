"use client";

import styles from "./buyer-discovery-provider.module.css";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { Pause, Play, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { defaultCatalogFilters, type CatalogFilters } from "@/lib/catalog-discovery";
import { formatDuration } from "@/lib/utils";
import type { Track } from "@/types/models";

type PreviewTrack = Pick<Track, "id" | "slug" | "title" | "artist_name" | "audio_file_url">;
type DiscoveryContext = {
  active: PreviewTrack | null; playing: boolean; toggle: (track: PreviewTrack) => void;
  filters: CatalogFilters; setFilters: Dispatch<SetStateAction<CatalogFilters>>;
};
const Context = createContext<DiscoveryContext | null>(null);
export function useBuyerDiscovery() {
  const value = useContext(Context);
  if (!value) throw new Error("Buyer discovery requires its workspace provider.");
  return value;
}

export function BuyerDiscoveryProvider({ children }: { children: ReactNode }) {
  const audio = useRef<HTMLAudioElement>(null);
  const activeId = useRef<string | null>(null);
  const request = useRef(0);
  const [active, setActive] = useState<PreviewTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [filters, setFilters] = useState(defaultCatalogFilters);

  const toggle = useCallback(async (track: PreviewTrack) => {
    const element = audio.current;
    if (!element || !track.audio_file_url) return;
    const token = ++request.current;
    setError("");
    if (activeId.current === track.id && !element.paused) {
      element.pause();
      return;
    }
    if (activeId.current !== track.id) {
      element.pause();
      activeId.current = track.id;
      element.src = track.audio_file_url;
      setTime(0);
      setDuration(0);
      setActive(track);
    }
    try {
      await element.play();
    } catch {
      if (token === request.current) setError("This preview could not play. Try again or choose another track.");
    }
  }, []);
  const context = useMemo(() => ({ active, playing, toggle, filters, setFilters }), [active, playing, toggle, filters]);
  function close() {
    ++request.current;
    audio.current?.pause();
    audio.current?.removeAttribute("src");
    audio.current?.load();
    activeId.current = null;
    setActive(null);
    setError("");
  }
  return (
    <Context.Provider value={context}>
      <div className={active ? "pb-60 sm:pb-40" : undefined}>{children}</div>
      <audio ref={audio} preload="none"
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
        onTimeUpdate={() => setTime(audio.current?.currentTime || 0)}
        onDurationChange={() => setDuration(Number.isFinite(audio.current?.duration) ? audio.current!.duration : 0)}
        onError={() => { setPlaying(false); if (activeId.current) setError("Preview unavailable. Try again or choose another track."); }} />
      {active ? (
        <section aria-label="Music preview player" className={`${styles.player} fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4`}>
          <div className="mx-auto max-w-5xl space-y-2">
            <div className="flex items-center gap-3">
              <Button type="button" className="h-11 w-11 shrink-0 p-0" aria-label={`${playing ? "Pause" : "Play"} ${active.title}`} onClick={() => void toggle(active)}>
                {playing ? <Pause aria-hidden="true" className="h-5 w-5" /> : <Play aria-hidden="true" className="h-5 w-5" />}
              </Button>
              <div className="min-w-0 flex-1"><Link href={`/buyer/catalog/${active.slug}`} className="block truncate font-medium underline-offset-4 hover:underline">{active.title}</Link><p className="truncate text-sm text-muted-foreground">{active.artist_name} · Preview</p></div>
              <Button type="button" variant="ghost" className="h-11 w-11 shrink-0 p-0" aria-label="Close preview player" onClick={close}><X aria-hidden="true" className="h-5 w-5" /></Button>
            </div>
            <div className="flex items-center gap-3 text-xs tabular-nums text-muted-foreground">
              <span>{formatDuration(Math.floor(time))}</span>
              <input aria-label="Preview position" aria-valuetext={`${formatDuration(Math.floor(time))} of ${formatDuration(Math.floor(duration))}`} type="range" className="h-6 min-w-0 flex-1 accent-accent" min={0} max={duration || 1} step={0.1} value={Math.min(time, duration || 1)} disabled={!duration}
                onChange={(event) => { const value = Number(event.target.value); if (audio.current) audio.current.currentTime = value; setTime(value); }} />
              <span>{formatDuration(Math.floor(duration))}</span>
            </div>
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          </div>
        </section>
      ) : null}
    </Context.Provider>
  );
}

export function PreviewButton({ track }: { track: PreviewTrack }) {
  const { active, playing, toggle } = useBuyerDiscovery();
  const isPlaying = active?.id === track.id && playing;
  return <Button type="button" variant="outline" className="h-11 shrink-0" disabled={!track.audio_file_url}
    aria-label={`${!track.audio_file_url ? "Preview unavailable for" : isPlaying ? "Pause" : "Preview"} ${track.title}`}
    onClick={() => void toggle(track)}>
    {isPlaying ? <Pause aria-hidden="true" className="h-4 w-4" /> : <Play aria-hidden="true" className="h-4 w-4" />}
    {!track.audio_file_url ? "Unavailable" : isPlaying ? "Pause" : "Preview"}
  </Button>;
}
