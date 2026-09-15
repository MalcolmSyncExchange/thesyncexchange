import type { Track } from "../types/models.ts";

export type CatalogFilters = {
  query: string; genre: string; mood: string; licenseType: string; vocalProfile: string;
  explicitFilter: string; priceBand: string; minBpm: string; maxBpm: string;
  sort: string; layout: "grid" | "list";
};
export const defaultCatalogFilters: CatalogFilters = {
  query: "", genre: "all", mood: "all", licenseType: "all", vocalProfile: "all",
  explicitFilter: "all", priceBand: "all", minBpm: "", maxBpm: "", sort: "featured", layout: "list"
};

// Display, budget matching and ordering share the same eligible license price.
// Null means unavailable; zero is an explicit price, never a fallback for missing data.
export function getCatalogPrice(track: Pick<Track, "license_options">, licenseType = "all") {
  const eligible = track.license_options.flatMap((option) => {
    const amount = option.price_override ?? option.base_price;
    if (option.active === false || (licenseType !== "all" && option.slug !== licenseType) ||
      typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) return [];
    return [{ amount, name: option.name }];
  });
  return eligible.sort((a, b) => a.amount - b.amount)[0] ?? null;
}

export function filterCatalog(tracks: Track[], filters: CatalogFilters) {
  const query = filters.query.trim().toLocaleLowerCase();
  const min = filters.minBpm === "" ? null : Number(filters.minBpm);
  const max = filters.maxBpm === "" ? null : Number(filters.maxBpm);
  return tracks.filter((track) => {
    const price = getCatalogPrice(track, filters.licenseType);
    const matchesQuery = [track.title, track.artist_name, track.genre, track.subgenre, ...track.mood]
      .some((value) => value?.toLocaleLowerCase().includes(query));
    return matchesQuery &&
      (filters.genre === "all" || track.genre === filters.genre) &&
      (filters.mood === "all" || track.mood.includes(filters.mood)) &&
      (filters.licenseType === "all" || price !== null) &&
      (filters.vocalProfile === "all" || (filters.vocalProfile === "vocals" ? track.vocals : track.instrumental)) &&
      (filters.explicitFilter === "all" || (filters.explicitFilter === "clean" ? !track.explicit : track.explicit)) &&
      (filters.priceBand === "all" || (price !== null && (
        filters.priceBand === "under-2000" ? price.amount < 2000 :
        filters.priceBand === "2000-5000" ? price.amount >= 2000 && price.amount <= 5000 : price.amount > 5000))) &&
      (min === null || (Number.isFinite(min) && track.bpm >= min)) &&
      (max === null || (Number.isFinite(max) && track.bpm <= max));
  }).sort((a, b) => {
    if (filters.sort === "price-low") {
      const pa = getCatalogPrice(a, filters.licenseType)?.amount ?? Infinity;
      const pb = getCatalogPrice(b, filters.licenseType)?.amount ?? Infinity;
      return pa === pb ? 0 : pa - pb;
    }
    if (filters.sort === "tempo-high") return b.bpm - a.bpm;
    return Number(b.featured) - Number(a.featured);
  });
}
