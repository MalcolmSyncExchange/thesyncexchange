"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function AudioPlayer({ title, artist }: { title: string; artist: string }) {
  const [playing, setPlaying] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Preview</p>
          <h3 className="text-lg font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground">{artist}</p>
        </div>
        <Button onClick={() => setPlaying((value) => !value)}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          {playing ? "Pause" : "Play"}
        </Button>
      </div>
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
    </div>
  );
}
