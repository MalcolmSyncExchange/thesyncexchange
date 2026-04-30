export type UserRole = "artist" | "buyer" | "admin";
export type TrackStatus = "draft" | "pending_review" | "approved" | "rejected" | "archived";
export type VerificationStatus = "unverified" | "pending" | "verified";
export type OrderStatus = "pending" | "paid" | "fulfilled" | "refunded";
export type AdminFlagSeverity = "low" | "medium" | "high" | "critical";
export type ArtistOnboardingStep = "basics" | "profile" | "licensing" | "first-track" | "complete";
export type BuyerOnboardingStep = "basics" | "profile" | "interests" | "complete";
export type OnboardingStep = ArtistOnboardingStep | BuyerOnboardingStep;

export interface User {
  id: string;
  email: string;
  role: UserRole | null;
  full_name: string;
  avatar_path?: string | null;
  avatar_url?: string | null;
  onboarding_started_at?: string | null;
  onboarding_completed_at?: string | null;
  onboarding_step?: string | null;
  onboarding_payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface ArtistProfile {
  id: string;
  user_id: string;
  artist_name: string;
  bio: string;
  location: string;
  website?: string | null;
  instagram_url?: string | null;
  spotify_url?: string | null;
  youtube_url?: string | null;
  social_links: Record<string, string>;
  payout_email?: string | null;
  default_licensing_preferences?: string | null;
  verification_status: VerificationStatus;
  created_at: string;
  updated_at: string;
}

export interface BuyerProfile {
  id: string;
  user_id: string;
  company_name: string;
  industry_type: string;
  buyer_type: string;
  billing_email: string;
  music_preferences?: {
    genres?: string[];
    moods?: string[];
    intended_use?: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface RightsHolder {
  id: string;
  track_id: string;
  name: string;
  email: string;
  role_type: string;
  ownership_percent: number;
  approval_status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
}

export interface LicenseType {
  id: string;
  name: string;
  slug: string;
  description: string;
  exclusive: boolean;
  base_price: number;
  terms_summary: string;
  active: boolean;
}

export interface TrackLicenseOption {
  id: string;
  track_id: string;
  license_type_id: string;
  price_override?: number | null;
  active: boolean;
}

export interface Track {
  id: string;
  artist_user_id: string;
  artist_name: string;
  title: string;
  slug: string;
  description: string;
  genre: string;
  subgenre: string;
  mood: string[];
  bpm: number;
  key: string;
  duration_seconds: number;
  instrumental: boolean;
  vocals: boolean;
  explicit: boolean;
  lyrics?: string | null;
  release_year: number;
  cover_art_path?: string | null;
  audio_file_path?: string | null;
  preview_file_path?: string | null;
  waveform_path?: string | null;
  waveform_preview_url?: string | null;
  audio_file_url?: string | null;
  cover_art_url?: string | null;
  status: TrackStatus;
  featured: boolean;
  approved_at?: string | null;
  approved_by?: string | null;
  created_at: string;
  updated_at: string;
  rights_holders: RightsHolder[];
  license_options: Array<LicenseType & { price_override?: number | null }>;
  is_favorite?: boolean;
}

export interface Order {
  id: string;
  buyer_user_id: string;
  track_id: string;
  license_type_id: string;
  stripe_checkout_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  amount_paid: number;
  currency: string;
  order_status: OrderStatus;
  agreement_url?: string | null;
  agreement_path?: string | null;
  agreement_content_type?: string | null;
  agreement_size_bytes?: number | null;
  agreement_generation_error?: string | null;
  agreement_generated?: boolean;
  agreement_ready?: boolean;
  checkout_created_at?: string | null;
  paid_at?: string | null;
  agreement_generated_at?: string | null;
  fulfilled_at?: string | null;
  refunded_at?: string | null;
  last_webhook_event_id?: string | null;
  last_webhook_event_type?: string | null;
  last_webhook_processed_at?: string | null;
  last_webhook_error?: string | null;
  agreement_delivery_blocked?: boolean;
  agreement_number?: string | null;
  generated_license_status?: string | null;
  generated_license_downloaded_at?: string | null;
  schema_degraded?: boolean;
  activity_degraded?: boolean;
  degraded_messages?: string[];
  created_at: string;
  updated_at: string;
}

export interface GeneratedLicense {
  id: string;
  order_id: string;
  buyer_id: string;
  track_id: string;
  license_type_id?: string | null;
  agreement_number: string;
  status: string;
  terms_snapshot_json: Record<string, unknown>;
  pdf_storage_path?: string | null;
  pdf_content_type?: string | null;
  pdf_size_bytes?: number | null;
  html_snapshot?: string | null;
  generation_error?: string | null;
  generated_at: string;
  downloaded_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderActivityLog {
  id: string;
  order_id: string;
  actor_id?: string | null;
  source: "system" | "stripe_webhook" | "admin" | "buyer";
  event_type: string;
  message?: string | null;
  metadata: Record<string, unknown>;
  dedupe_key?: string | null;
  created_at: string;
}

export interface Favorite {
  id: string;
  buyer_user_id: string;
  track_id: string;
  created_at: string;
}

export interface AdminFlag {
  id: string;
  track_id: string;
  flag_type: string;
  severity: AdminFlagSeverity;
  notes: string;
  status: "open" | "resolved";
  created_by: string;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
}

export interface ReviewNote {
  id: string;
  track_id: string;
  author_id: string;
  note: string;
  created_at: string;
  author_name?: string | null;
}

export interface TrackAuditLog {
  id: string;
  track_id: string;
  actor_id?: string | null;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
  actor_name?: string | null;
}

export interface SessionUser {
  id: string;
  email: string;
  role: UserRole | null;
  fullName: string;
  avatarPath?: string | null;
  avatarUrl?: string | null;
  onboardingComplete?: boolean;
  onboardingStep?: string | null;
  onboardingStartedAt?: string | null;
  onboardingCompletedAt?: string | null;
  onboardingData?: Record<string, unknown> | null;
}
