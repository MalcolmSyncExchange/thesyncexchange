"use client";

import { useAnalytics } from "@/components/analytics/provider";
import { previewTracker, type PreviewSurface } from "@/lib/analytics/triggers";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

import { PreviewAudioButton, PreviewAudioProvider, usePreviewAudio, type PreviewAudioTrack } from "@/components/audio/preview-audio-provider";
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
  const capture = useAnalytics();
  const playbackObserver = useMemo(() => previewTracker(capture), [capture]);
  const [filters, setFilters] = useState(defaultCatalogFilters);
  const context = useMemo(() => ({ filters, setFilters }), [filters]);
  return <Context.Provider value={context}><PreviewAudioProvider playbackObserver={playbackObserver}>{children}</PreviewAudioProvider></Context.Provider>;
}

export function PreviewButton({ track, surface = "buyer_workspace" }: { track: BuyerTrack; surface?: PreviewSurface }) {
  const previewTrack=buyerPreviewTrack(track,surface);
  return <PreviewAudioButton track={previewTrack} />;
}

function buyerPreviewTrack(track:BuyerTrack,surface:PreviewSurface="catalog"):PreviewAudioTrack {
  return {
    id: track.id,
    discoverySurface: surface,
    slug: track.slug,
    title: track.title,
    artistName: track.artist_name,
    artworkUrl: track.cover_art_url || null,
    previewUrl: track.audio_file_url || null,
    waveformUrl: track.waveform_preview_url || null,
    durationSeconds: track.duration_seconds,
    href: `/buyer/catalog/${track.slug}`
  };
 }
export function BuyerPreviewQueue({tracks}:{tracks:BuyerTrack[]}){const {setQueue}=usePreviewAudio();useEffect(()=>{setQueue(tracks.map(t=>buyerPreviewTrack(t)));return()=>setQueue([]);},[tracks,setQueue]);return null;}
