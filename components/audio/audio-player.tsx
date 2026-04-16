"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function AudioPlayer({ title, artist, src }: { title: string; artist: string; src?: string | null }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handlePlay = () => setPlaying(true);
    const handlePause = () => setPlaying(false);
    const handleEnded = () => setPlaying(false);
    const handleError = () => {
      setPlaying(false);
      setErrorMessage("Preview is not available right now.");
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
    };
  }, [src]);

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !src) {
      return;
    }

    if (audio.paused) {
      try {
        setErrorMessage(null);
        await audio.play();
      } catch {
        setPlaying(false);
        setErrorMessage("Preview could not start in this browser session.");
      }
      return;
    }

    audio.pause();
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Preview</p>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{artist}</p>
        </div>
        <Button type="button" onClick={togglePlayback} disabled={!src}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {!src ? "Preview Unavailable" : playing ? "Pause" : "Play"}
        </Button>
      </div>
      <audio ref={audioRef} src={src || undefined} preload="none" />
      <div className="mt-6 h-20 rounded-md border border-border bg-muted p-4">
        <div className="grid h-full grid-cols-12 gap-2">
          {Array.from({ length: 48 }).map((_, index) => (
            <div
              key={index}
              className="rounded-full bg-foreground/80"
              style={{ height: `${30 + ((index * 13) % 55)}%`, alignSelf: "center" }}
            />
          ))}
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {errorMessage || (src ? "Playback uses a time-limited asset URL when the source file is private." : "Preview becomes available once a playable asset has been cleared for this track.")}
      </p>
    </div>
  );
}
