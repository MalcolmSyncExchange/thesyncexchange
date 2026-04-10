export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      users: { Row: unknown; Insert: unknown; Update: unknown };
      artist_profiles: { Row: unknown; Insert: unknown; Update: unknown };
      buyer_profiles: { Row: unknown; Insert: unknown; Update: unknown };
      tracks: { Row: unknown; Insert: unknown; Update: unknown };
      rights_holders: { Row: unknown; Insert: unknown; Update: unknown };
      license_types: { Row: unknown; Insert: unknown; Update: unknown };
      track_license_options: { Row: unknown; Insert: unknown; Update: unknown };
      orders: { Row: unknown; Insert: unknown; Update: unknown };
      favorites: { Row: unknown; Insert: unknown; Update: unknown };
      admin_flags: { Row: unknown; Insert: unknown; Update: unknown };
    };
  };
}
