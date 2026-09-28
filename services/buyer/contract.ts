import type { BuyerTrack, Track } from "@/types/models";

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
