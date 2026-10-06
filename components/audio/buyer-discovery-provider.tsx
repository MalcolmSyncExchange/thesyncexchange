"use client";

import { createContext, useContext, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { PreviewAudioButton, PreviewAudioProvider, type PreviewAudioTrack } from "@/components/audio/preview-audio-provider";
import { defaultCatalogFilters, type CatalogFilters } from "@/lib/catalog-discovery";
import type { BuyerTrack } from "@/types/models";

type DiscoveryContext = {
  filters: CatalogFilters;
  setFilters: Dispatch<SetStateAction<CatalogFilters>>;
};

const Context = createContext<DiscoveryContext | null>(null);

export function useBuyerDiscovery() {
  const value = useContext(Context);
  if (!value) throw new Error("Buyer discovery requires its workspace provider.");
  return value;
}

export function BuyerDiscoveryProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState(defaultCatalogFilters);
  const context = useMemo(() => ({ filters, setFilters }), [filters]);
  return <Context.Provider value={context}><PreviewAudioProvider>{children}</PreviewAudioProvider></Context.Provider>;
}

export function PreviewButton({ track }: { track: BuyerTrack }) {
  const previewTrack: PreviewAudioTrack = {
    id: track.id,
    slug: track.slug,
    title: track.title,
    artistName: track.artist_name,
    artworkUrl: track.cover_art_url || null,
    previewUrl: track.audio_file_url || null,
    waveformUrl: track.waveform_preview_url || null,
    durationSeconds: track.duration_seconds,
    href: `/buyer/catalog/${track.slug}`
  };
  return <PreviewAudioButton track={previewTrack} />;
}
