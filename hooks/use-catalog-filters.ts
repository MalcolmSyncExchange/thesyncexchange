"use client";

import { useMemo, useState } from "react";

import type { Track } from "@/types/models";

export function useCatalogFilters(tracks: Track[]) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("all");
  const [mood, setMood] = useState("all");
  const [licenseType, setLicenseType] = useState("all");
  const [vocalProfile, setVocalProfile] = useState("all");
  const [explicitFilter, setExplicitFilter] = useState("all");
  const [priceBand, setPriceBand] = useState("all");
  const [minBpm, setMinBpm] = useState("");
  const [maxBpm, setMaxBpm] = useState("");
  const [sort, setSort] = useState("featured");
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  const filteredTracks = useMemo(() => {
    const normalized = query.toLowerCase();
    const minTempo = minBpm ? Number(minBpm) : null;
    const maxTempo = maxBpm ? Number(maxBpm) : null;
    const result = [...tracks].filter((track) => {
      const matchesQuery =
        !normalized ||
        track.title.toLowerCase().includes(normalized) ||
        track.artist_name.toLowerCase().includes(normalized) ||
        track.genre.toLowerCase().includes(normalized) ||
        track.subgenre.toLowerCase().includes(normalized);
      const matchesGenre = genre === "all" || track.genre === genre;
      const matchesMood = mood === "all" || track.mood.includes(mood);
      const matchesLicense =
        licenseType === "all" || track.license_options.some((option) => option.slug === licenseType);
      const matchesVocalProfile =
        vocalProfile === "all" ||
        (vocalProfile === "vocals" && track.vocals) ||
        (vocalProfile === "instrumental" && track.instrumental);
      const matchesExplicit =
        explicitFilter === "all" ||
        (explicitFilter === "clean" && !track.explicit) ||
        (explicitFilter === "explicit" && track.explicit);
      const primaryPrice = track.license_options[0]?.price_override || track.license_options[0]?.base_price || 0;
      const matchesPrice =
        priceBand === "all" ||
        (priceBand === "under-2000" && primaryPrice < 2000) ||
        (priceBand === "2000-5000" && primaryPrice >= 2000 && primaryPrice <= 5000) ||
        (priceBand === "5000-plus" && primaryPrice > 5000);
      const matchesMinTempo = minTempo === null || track.bpm >= minTempo;
      const matchesMaxTempo = maxTempo === null || track.bpm <= maxTempo;

      return (
        matchesQuery &&
        matchesGenre &&
        matchesMood &&
        matchesLicense &&
        matchesVocalProfile &&
        matchesExplicit &&
        matchesPrice &&
        matchesMinTempo &&
        matchesMaxTempo
      );
    });

    if (sort === "price-low") {
      return result.sort((a, b) => (a.license_options[0]?.price_override || 0) - (b.license_options[0]?.price_override || 0));
    }

    if (sort === "tempo-high") {
      return result.sort((a, b) => b.bpm - a.bpm);
    }

    return result.sort((a, b) => Number(b.featured) - Number(a.featured));
  }, [explicitFilter, genre, licenseType, maxBpm, minBpm, mood, priceBand, query, sort, tracks, vocalProfile]);

  return {
    query,
    setQuery,
    genre,
    setGenre,
    mood,
    setMood,
    licenseType,
    setLicenseType,
    vocalProfile,
    setVocalProfile,
    explicitFilter,
    setExplicitFilter,
    priceBand,
    setPriceBand,
    minBpm,
    setMinBpm,
    maxBpm,
    setMaxBpm,
    sort,
    setSort,
    layout,
    setLayout,
    filteredTracks
  };
}
