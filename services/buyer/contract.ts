import type { BuyerTrack, Track } from "@/types/models";

export interface BuyerSafeTrackPreview {
  id: string;
  slug: string;
  title: string;
  artistName: string;
  description: string;
  genre: string;
  subgenre: string;
  moods: string[];
  bpm: number;
  musicalKey: string;
  durationSeconds: number;
  instrumental: boolean;
  vocals: boolean;
  explicit: boolean;
  releaseYear: number;
  coverArtUrl: string | null;
  previewAudioUrl: string | null;
  waveformUrl: string | null;
  rightsCredits: Array<{ id: string; name: string; role: string; percentage: number }>;
  licenseOptions: Array<{
    id: string;
    name: string;
    slug: string;
    description: string;
    exclusive: boolean;
    price: number;
    termsSummary: string;
  }>;
}

export function toBuyerTrack(track: Track, favorite = false): BuyerTrack {
  return {
    id: track.id,
    artist_name: track.artist_name,
    title: track.title,
    slug: track.slug,
    description: track.description,
    genre: track.genre,
    subgenre: track.subgenre,
    mood: track.mood,
    bpm: track.bpm,
    key: track.key,
    duration_seconds: track.duration_seconds,
    instrumental: track.instrumental,
    vocals: track.vocals,
    explicit: track.explicit,
    lyrics: track.lyrics,
    release_year: track.release_year,
    cover_art_path: track.cover_art_path,
    preview_file_path: track.preview_file_path,
    waveform_path: track.waveform_path,
    waveform_preview_url: track.waveform_preview_url,
    cover_art_url: track.cover_art_url,
    status: track.status,
    featured: track.featured,
    created_at: track.created_at,
    updated_at: track.updated_at,
    audio_file_url: null,
    rights_holders: track.rights_holders.map(holder => ({ id: holder.id, track_id: holder.track_id, name: holder.name, role_type: holder.role_type, ownership_percent: holder.ownership_percent })),
    license_options: track.license_options.map(option => ({ id: option.id, name: option.name, slug: option.slug, description: option.description, exclusive: option.exclusive, base_price: option.base_price, terms_summary: option.terms_summary, active: option.active, price_override: option.price_override })),
    is_favorite: favorite
  };
}

export function toBuyerSafeTrackPreview(track: BuyerTrack): BuyerSafeTrackPreview {
  return {
    id: track.id,
    slug: track.slug,
    title: track.title,
    artistName: track.artist_name,
    description: track.description,
    genre: track.genre,
    subgenre: track.subgenre,
    moods: [...track.mood],
    bpm: track.bpm,
    musicalKey: track.key,
    durationSeconds: track.duration_seconds,
    instrumental: track.instrumental,
    vocals: track.vocals,
    explicit: track.explicit,
    releaseYear: track.release_year,
    coverArtUrl: track.cover_art_url || null,
    previewAudioUrl: track.audio_file_url || null,
    waveformUrl: track.waveform_preview_url || null,
    rightsCredits: track.rights_holders.map(holder => ({
      id: holder.id,
      name: holder.name,
      role: holder.role_type,
      percentage: Number(holder.ownership_percent)
    })),
    licenseOptions: track.license_options.filter(option => option.active !== false).map(option => ({
      id: option.id,
      name: option.name,
      slug: option.slug,
      description: option.description,
      exclusive: option.exclusive,
      price: option.price_override ?? option.base_price,
      termsSummary: option.terms_summary
    }))
  };
}
