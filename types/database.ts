export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          email: string;
          role: Database["public"]["Enums"]["user_role"] | null;
          full_name: string;
          avatar_path: string | null;
          avatar_url: string | null;
          onboarding_started_at: string | null;
          onboarding_completed_at: string | null;
          onboarding_step: string | null;
          onboarding_payload: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: Database["public"]["Enums"]["user_role"] | null;
          full_name: string;
          avatar_path?: string | null;
          avatar_url?: string | null;
          onboarding_started_at?: string | null;
          onboarding_completed_at?: string | null;
          onboarding_step?: string | null;
          onboarding_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: Database["public"]["Enums"]["user_role"] | null;
          full_name?: string;
          avatar_path?: string | null;
          avatar_url?: string | null;
          onboarding_started_at?: string | null;
          onboarding_completed_at?: string | null;
          onboarding_step?: string | null;
          onboarding_payload?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      artist_profiles: {
        Row: {
          id: string;
          user_id: string;
          artist_name: string;
          bio: string;
          location: string;
          website: string | null;
          social_links: Json;
          instagram_url: string | null;
          spotify_url: string | null;
          youtube_url: string | null;
          payout_email: string | null;
          default_licensing_preferences: string | null;
          verification_status: Database["public"]["Enums"]["verification_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          artist_name: string;
          bio?: string;
          location?: string;
          website?: string | null;
          social_links?: Json;
          instagram_url?: string | null;
          spotify_url?: string | null;
          youtube_url?: string | null;
          payout_email?: string | null;
          default_licensing_preferences?: string | null;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          artist_name?: string;
          bio?: string;
          location?: string;
          website?: string | null;
          social_links?: Json;
          instagram_url?: string | null;
          spotify_url?: string | null;
          youtube_url?: string | null;
          payout_email?: string | null;
          default_licensing_preferences?: string | null;
          verification_status?: Database["public"]["Enums"]["verification_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      buyer_profiles: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          buyer_type: string;
          industry_type: string;
          billing_email: string;
          music_preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          buyer_type: string;
          industry_type: string;
          billing_email: string;
          music_preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string;
          buyer_type?: string;
          industry_type?: string;
          billing_email?: string;
          music_preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      tracks: {
        Row: {
          id: string;
          artist_user_id: string;
          title: string;
          slug: string;
          description: string;
          status: Database["public"]["Enums"]["track_status"];
          genre: string;
          subgenre: string;
          moods: string[];
          bpm: number;
          musical_key: string;
          duration_seconds: number;
          instrumental: boolean;
          vocals: boolean;
          explicit: boolean;
          lyrics: string | null;
          release_year: number;
          cover_art_path: string | null;
          audio_file_path: string | null;
          preview_file_path: string | null;
          waveform_path: string | null;
          waveform_data: Json;
          featured: boolean;
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          artist_user_id: string;
          title: string;
          slug: string;
          description?: string;
          status?: Database["public"]["Enums"]["track_status"];
          genre: string;
          subgenre: string;
          moods?: string[];
          bpm: number;
          musical_key: string;
          duration_seconds: number;
          instrumental?: boolean;
          vocals?: boolean;
          explicit?: boolean;
          lyrics?: string | null;
          release_year: number;
          cover_art_path?: string | null;
          audio_file_path?: string | null;
          preview_file_path?: string | null;
          waveform_path?: string | null;
          waveform_data?: Json;
          featured?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          artist_user_id?: string;
          title?: string;
          slug?: string;
          description?: string;
          status?: Database["public"]["Enums"]["track_status"];
          genre?: string;
          subgenre?: string;
          moods?: string[];
          bpm?: number;
          musical_key?: string;
          duration_seconds?: number;
          instrumental?: boolean;
          vocals?: boolean;
          explicit?: boolean;
          lyrics?: string | null;
          release_year?: number;
          cover_art_path?: string | null;
          audio_file_path?: string | null;
          preview_file_path?: string | null;
          waveform_path?: string | null;
          waveform_data?: Json;
          featured?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rights_holders: {
        Row: {
          id: string;
          track_id: string;
          user_id: string | null;
          name: string;
          email: string;
          role_type: string;
          ownership_percent: number;
          approval_status: Database["public"]["Enums"]["approval_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          track_id: string;
          user_id?: string | null;
          name: string;
          email: string;
          role_type: string;
          ownership_percent: number;
          approval_status?: Database["public"]["Enums"]["approval_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          track_id?: string;
          user_id?: string | null;
          name?: string;
          email?: string;
          role_type?: string;
          ownership_percent?: number;
          approval_status?: Database["public"]["Enums"]["approval_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      license_types: {
        Row: {
          id: string;
          code: string;
          slug: string;
          name: string;
          description: string;
          terms_summary: string;
          exclusive: boolean;
          active: boolean;
          default_price_cents: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          slug: string;
          name: string;
          description: string;
          terms_summary?: string;
          exclusive?: boolean;
          active?: boolean;
          default_price_cents: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          slug?: string;
          name?: string;
          description?: string;
          terms_summary?: string;
          exclusive?: boolean;
          active?: boolean;
          default_price_cents?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      track_license_options: {
        Row: {
          id: string;
          track_id: string;
          license_type_id: string;
          active: boolean;
          price_cents: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          track_id: string;
          license_type_id: string;
          active?: boolean;
          price_cents?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          track_id?: string;
          license_type_id?: string;
          active?: boolean;
          price_cents?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      favorites: {
        Row: {
          id: string;
          buyer_user_id: string;
          track_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          buyer_user_id: string;
          track_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          buyer_user_id?: string;
          track_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          buyer_user_id: string;
          track_id: string;
          license_type_id: string;
          amount_cents: number;
          currency: string;
          status: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id: string | null;
          stripe_payment_intent_id: string | null;
          agreement_url: string | null;
          agreement_path: string | null;
          agreement_content_type: string | null;
          agreement_size_bytes: number | null;
          agreement_generation_error: string | null;
          checkout_created_at: string | null;
          paid_at: string | null;
          agreement_generated_at: string | null;
          fulfilled_at: string | null;
          refunded_at: string | null;
          last_webhook_event_id: string | null;
          last_webhook_event_type: string | null;
          last_webhook_processed_at: string | null;
          last_webhook_error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          buyer_user_id: string;
          track_id: string;
          license_type_id: string;
          amount_cents: number;
          currency?: string;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          agreement_url?: string | null;
          agreement_path?: string | null;
          agreement_content_type?: string | null;
          agreement_size_bytes?: number | null;
          agreement_generation_error?: string | null;
          checkout_created_at?: string | null;
          paid_at?: string | null;
          agreement_generated_at?: string | null;
          fulfilled_at?: string | null;
          refunded_at?: string | null;
          last_webhook_event_id?: string | null;
          last_webhook_event_type?: string | null;
          last_webhook_processed_at?: string | null;
          last_webhook_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          buyer_user_id?: string;
          track_id?: string;
          license_type_id?: string;
          amount_cents?: number;
          currency?: string;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_checkout_session_id?: string | null;
          stripe_payment_intent_id?: string | null;
          agreement_url?: string | null;
          agreement_path?: string | null;
          agreement_content_type?: string | null;
          agreement_size_bytes?: number | null;
          agreement_generation_error?: string | null;
          checkout_created_at?: string | null;
          paid_at?: string | null;
          agreement_generated_at?: string | null;
          fulfilled_at?: string | null;
          refunded_at?: string | null;
          last_webhook_event_id?: string | null;
          last_webhook_event_type?: string | null;
          last_webhook_processed_at?: string | null;
          last_webhook_error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_activity_log: {
        Row: {
          id: string;
          order_id: string;
          actor_id: string | null;
          source: string;
          event_type: string;
          message: string | null;
          metadata: Json;
          dedupe_key: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          actor_id?: string | null;
          source: string;
          event_type: string;
          message?: string | null;
          metadata?: Json;
          dedupe_key?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          actor_id?: string | null;
          source?: string;
          event_type?: string;
          message?: string | null;
          metadata?: Json;
          dedupe_key?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      admin_flags: {
        Row: {
          id: string;
          track_id: string;
          created_by: string;
          flag_type: string;
          severity: string;
          notes: string;
          status: Database["public"]["Enums"]["flag_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          track_id: string;
          created_by: string;
          flag_type: string;
          severity?: string;
          notes: string;
          status?: Database["public"]["Enums"]["flag_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          track_id?: string;
          created_by?: string;
          flag_type?: string;
          severity?: string;
          notes?: string;
          status?: Database["public"]["Enums"]["flag_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      review_notes: {
        Row: {
          id: string;
          track_id: string;
          author_id: string;
          note: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          track_id: string;
          author_id: string;
          note: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          track_id?: string;
          author_id?: string;
          note?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      track_audit_log: {
        Row: {
          id: string;
          track_id: string;
          actor_id: string | null;
          action: string;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          track_id: string;
          actor_id?: string | null;
          action: string;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          track_id?: string;
          actor_id?: string | null;
          action?: string;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      track_rights_holders_public: {
        Row: {
          id: string | null;
          track_id: string | null;
          user_id: string | null;
          name: string | null;
          role_type: string | null;
          ownership_percent: number | null;
          approval_status: Database["public"]["Enums"]["approval_status"] | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      current_app_role: {
        Args: Record<PropertyKey, never>;
        Returns: Database["public"]["Enums"]["user_role"] | null;
      };
      is_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
    };
    Enums: {
      approval_status: "pending" | "approved" | "rejected";
      flag_status: "open" | "resolved";
      order_status: "pending" | "paid" | "fulfilled" | "refunded";
      track_status: "draft" | "pending_review" | "approved" | "rejected" | "archived";
      user_role: "artist" | "buyer" | "admin";
      verification_status: "unverified" | "pending" | "verified";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
