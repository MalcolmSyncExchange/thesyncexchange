export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      artist_account_details: { Row: { user_id: string; identity: Json; declarations: Json; updated_at: string }; Insert: { user_id: string; identity?: Json; declarations?: Json; updated_at?: string }; Update: { identity?: Json; declarations?: Json; updated_at?: string }; Relationships: [] };
      artist_account_acceptances: { Row: { id: number; user_id: string; notice_version: string; notice_snapshot: Json; accepted_at: string }; Insert: { user_id: string; notice_version: string; notice_snapshot: Json }; Update: never; Relationships: [] };
      artist_account_events: { Row: { id: number; user_id: string; actor_id: string | null; action: string; snapshot: Json; created_at: string }; Insert: { user_id: string; actor_id?: string | null; action: string; snapshot: Json }; Update: never; Relationships: [] };
      analytics_outbox: {
        Row: { id: string; dedupe_key: string; environment: string; event: string; actor_id: string; actor_role: string; properties: Json; is_internal: boolean; is_test: boolean; occurred_at: string; delivered_at: string | null; lease_id: string | null; lease_until: string | null; delivery_status: string; attempt_count: number; delivery_cycle: number; last_attempt_at: string | null; next_retry_at: string | null; failure_category: string | null };
        Insert: { id?: string; dedupe_key: string; environment: string; event: string; actor_id: string; actor_role: string; properties: Json; is_internal: boolean; is_test: boolean; occurred_at?: string; delivered_at?: string | null; lease_id?: string | null; lease_until?: string | null; delivery_status?: string; attempt_count?: number; delivery_cycle?: number; last_attempt_at?: string | null; next_retry_at?: string | null; failure_category?: string | null };
        Update: { delivered_at?: string | null; lease_until?: string | null; delivery_status?: string; attempt_count?: number; delivery_cycle?: number; last_attempt_at?: string | null; next_retry_at?: string | null; failure_category?: string | null };
        Relationships: [];
      };

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
      buyer_notification_preferences: {
        Row: {
          user_id: string;
          purchase_receipts: boolean;
          license_agreement_ready: boolean;
          platform_updates: boolean;
          security_alerts: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          purchase_receipts?: boolean;
          license_agreement_ready?: boolean;
          platform_updates?: boolean;
          security_alerts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          purchase_receipts?: boolean;
          license_agreement_ready?: boolean;
          platform_updates?: boolean;
          security_alerts?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      buyer_team_invites: {
        Row: {
          id: string;
          buyer_user_id: string;
          invited_by: string;
          email: string;
          role: string;
          status: string;
          accepted_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          buyer_user_id: string;
          invited_by: string;
          email: string;
          role: string;
          status?: string;
          accepted_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          buyer_user_id?: string;
          invited_by?: string;
          email?: string;
          role?: string;
          status?: string;
          accepted_user_id?: string | null;
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
      generated_licenses: {
        Row: {
          id: string;
          order_id: string;
          buyer_id: string;
          track_id: string;
          license_type_id: string | null;
          agreement_number: string;
          status: string;
          terms_snapshot_json: Json;
          pdf_storage_path: string | null;
          pdf_content_type: string | null;
          pdf_size_bytes: number | null;
          html_snapshot: string | null;
          generation_error: string | null;
          generated_at: string;
          downloaded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          buyer_id: string;
          track_id: string;
          license_type_id?: string | null;
          agreement_number: string;
          status?: string;
          terms_snapshot_json: Json;
          pdf_storage_path?: string | null;
          pdf_content_type?: string | null;
          pdf_size_bytes?: number | null;
          html_snapshot?: string | null;
          generation_error?: string | null;
          generated_at?: string;
          downloaded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          buyer_id?: string;
          track_id?: string;
          license_type_id?: string | null;
          agreement_number?: string;
          status?: string;
          terms_snapshot_json?: Json;
          pdf_storage_path?: string | null;
          pdf_content_type?: string | null;
          pdf_size_bytes?: number | null;
          html_snapshot?: string | null;
          generation_error?: string | null;
          generated_at?: string;
          downloaded_at?: string | null;
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
      buyer_catalog_public: {
        Row: Pick<Database["public"]["Tables"]["tracks"]["Row"], "id" | "title" | "slug" | "description" | "genre" | "subgenre" | "moods" | "bpm" | "musical_key" | "duration_seconds" | "instrumental" | "vocals" | "explicit" | "lyrics" | "release_year" | "cover_art_path" | "preview_file_path" | "waveform_path" | "featured" | "created_at" | "updated_at"> & { artist_id: string; artist_name: string };
        Relationships: [];
      };
      track_rights_holders_public: {
        Row: Pick<Database["public"]["Tables"]["rights_holders"]["Row"], "id" | "track_id" | "name" | "role_type" | "ownership_percent">;
        Relationships: [];
      };
    };
    Functions: {
      save_artist_account_step: { Args: { p_actor: string; p_expected: string; p_step: string; p_public: Json; p_private: Json; p_avatar?: string | null; p_remove_avatar?: boolean; p_notice_version?: string | null; p_accept?: boolean }; Returns: string };
      claim_staging_analytics_validation: { Args: { p_authorization: string; p_artist: string; p_event: string; p_operator: string }; Returns: Database["public"]["Tables"]["analytics_outbox"]["Row"][] };
      arm_staging_analytics_validation: { Args: { p_authorization: string; p_artist: string; p_operator: string; p_event: string }; Returns: { id: string; created_at: string; expires_at: string }[] };
      get_staging_analytics_validation_readiness: { Args: { p_authorization: string; p_artist: string; p_operator: string }; Returns: { authorization_matches: boolean; artist_matches: boolean; operator_matches: boolean; grant_usable: boolean }[] };
      finish_staging_analytics_validation: { Args: { p_authorization: string; p_lease: string; p_accepted: boolean }; Returns: string };

      save_artist_onboarding_atomic: {
        Args: { p_actor_id: string; p_expected_updated_at: string; p_step: string; p_data: Json; p_avatar_path?: string | null };
        Returns: string;
      };
      complete_artist_onboarding_atomic: {
        Args: { p_actor_id: string; p_expected_updated_at: string };
        Returns: string;
      };

      get_admin_purchase_capabilities: {
        Args: Record<string, never>;
        Returns: { foundation_enabled: boolean; asset_preparation_enabled: boolean; receipt_generation_enabled: boolean; entitlement_activation_enabled: boolean; transaction_projection_enabled: boolean; payment_adapter_enabled: boolean }[];
      };
      get_analytics_verified_purchase: {
        Args: { p_order_id: string; p_provider_account: string; p_provider_event_id: string };
        Returns: { order_id: string; buyer_user_id: string; track_id: string; license_type: string; checkout_session_id: string; payment_intent_id: string; amount_minor: number; currency: string; payment_mode: string; paid_at: string; payment_event_id: string; verified_at: string }[];
      };
      enqueue_analytics_event: { Args: { p_environment: string; p_event: string; p_actor_id: string; p_actor_role: string; p_properties: Json; p_dedupe_key: string; p_is_internal: boolean; p_is_test: boolean }; Returns: string | null };
      claim_analytics_event: { Args: { p_environment: string; p_id?: string }; Returns: Database["public"]["Tables"]["analytics_outbox"]["Row"][] };
      complete_analytics_event: { Args: { p_id: string; p_lease_id: string }; Returns: boolean };
      fail_analytics_event: { Args: { p_id: string; p_lease_id: string; p_category: string; p_retry_at?: string | null }; Returns: boolean };
      hold_analytics_event: { Args: { p_environment: string; p_id: string }; Returns: boolean };
      release_analytics_event: { Args: { p_environment: string; p_id: string }; Returns: boolean };
      get_analytics_delivery_health: { Args: { p_environment: string }; Returns: Json };

      update_artist_track_atomic: { Args: { p_actor_id: string; p_track_id: string; p_expected_updated_at: string; p_values: Json; p_rights: Json; p_options: Json }; Returns: string };
      get_own_artist_finance: { Args: Record<string, never>; Returns: { payout_email: string | null }[] };
      consume_rate_limit: {
        Args: { p_namespace: string; p_operation: string; p_subject: string };
        Returns: Array<{ allowed: boolean; remaining: number; retry_after_seconds: number; reset_at: string }>;
      };
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
