import type {
  AdminFlag,
  ArtistProfile,
  BuyerProfile,
  Favorite,
  LicenseType,
  Order,
  SessionUser,
  Track,
  User
} from "@/types/models";

const now = "2026-04-09T12:00:00.000Z";

export const demoUsers: User[] = [
  { id: "artist-1", email: "maya@sync.exchange", role: "artist", full_name: "Maya Sol", avatar_url: null, created_at: now, updated_at: now },
  { id: "artist-2", email: "caleb@sync.exchange", role: "artist", full_name: "Caleb Rowe", avatar_url: null, created_at: now, updated_at: now },
  { id: "artist-3", email: "linh@sync.exchange", role: "artist", full_name: "Linh Hart", avatar_url: null, created_at: now, updated_at: now },
  { id: "artist-4", email: "omar@sync.exchange", role: "artist", full_name: "Omar Vale", avatar_url: null, created_at: now, updated_at: now },
  { id: "artist-5", email: "serena@sync.exchange", role: "artist", full_name: "Serena North", avatar_url: null, created_at: now, updated_at: now },
  { id: "buyer-1", email: "music@northframe.co", role: "buyer", full_name: "Elena Park", avatar_url: null, created_at: now, updated_at: now },
  { id: "buyer-2", email: "licensing@bayshore.studio", role: "buyer", full_name: "Jordan Pike", avatar_url: null, created_at: now, updated_at: now },
  { id: "admin-1", email: "admin@thesyncexchange.com", role: "admin", full_name: "Platform Admin", avatar_url: null, created_at: now, updated_at: now }
];

export const artistProfiles: ArtistProfile[] = [
  { id: "ap-1", user_id: "artist-1", artist_name: "Maya Sol", bio: "Cinematic electronic songwriter delivering high-fidelity toplines and instrumental cuts for premium sync placements.", location: "Los Angeles, CA", website: "https://mayasol.studio", social_links: { instagram: "@mayasolmusic" }, payout_email: "maya@sync.exchange", verification_status: "verified", created_at: now, updated_at: now },
  { id: "ap-2", user_id: "artist-2", artist_name: "Caleb Rowe", bio: "Indie-folk and alt-country producer with emotionally direct songs built for story-first licensing.", location: "Nashville, TN", website: "https://calebrowe.com", social_links: { instagram: "@calebrowesounds" }, payout_email: "caleb@sync.exchange", verification_status: "verified", created_at: now, updated_at: now },
  { id: "ap-3", user_id: "artist-3", artist_name: "Linh Hart", bio: "Modern pop writer and vocal producer creating precise, ad-ready records with crisp hooks.", location: "New York, NY", website: "https://linhhart.io", social_links: { instagram: "@linhhartmusic" }, payout_email: "linh@sync.exchange", verification_status: "pending", created_at: now, updated_at: now },
  { id: "ap-4", user_id: "artist-4", artist_name: "Omar Vale", bio: "Dark electronic composer focused on tension, pulse, and bold trailer-ready sonic architecture.", location: "Austin, TX", website: "https://omarvale.audio", social_links: { instagram: "@omarvalescore" }, payout_email: "omar@sync.exchange", verification_status: "verified", created_at: now, updated_at: now },
  { id: "ap-5", user_id: "artist-5", artist_name: "Serena North", bio: "Organic indie-pop artist blending intimate lyric writing with polished commercial production.", location: "Portland, OR", website: "https://serenanorthmusic.com", social_links: { instagram: "@serenanorth" }, payout_email: "serena@sync.exchange", verification_status: "unverified", created_at: now, updated_at: now }
];

export const buyerProfiles: BuyerProfile[] = [
  { id: "bp-1", user_id: "buyer-1", company_name: "Northframe Creative", industry_type: "Advertising", buyer_type: "Music Supervisor", billing_email: "music@northframe.co", created_at: now, updated_at: now },
  { id: "bp-2", user_id: "buyer-2", company_name: "Bayshore Studio", industry_type: "Film & TV", buyer_type: "Producer", billing_email: "licensing@bayshore.studio", created_at: now, updated_at: now }
];

export const licenseTypes: LicenseType[] = [
  { id: "lt-1", name: "Digital Campaign", slug: "digital-campaign", description: "Ideal for paid social, web spots, and short-form branded content.", exclusive: false, base_price: 1200, terms_summary: "12-month campaign use, digital only.", active: true },
  { id: "lt-2", name: "Broadcast", slug: "broadcast", description: "For TV, streaming spots, and regional or national campaign rollouts.", exclusive: false, base_price: 4800, terms_summary: "Broadcast and streaming usage, term defined at checkout.", active: true },
  { id: "lt-3", name: "Trailer / Promo", slug: "trailer-promo", description: "Built for cinematic promo placements and high-impact cutdowns.", exclusive: false, base_price: 6800, terms_summary: "Promo/trailer use, non-exclusive.", active: true },
  { id: "lt-4", name: "Exclusive Buyout", slug: "exclusive-buyout", description: "Full exclusive negotiation scaffold for premium placements.", exclusive: true, base_price: 18000, terms_summary: "Exclusive placement subject to negotiated scope, term, territory, and final legal approval.", active: true }
];

const demoTrackBase = [
  ["midnight-run", "Midnight Run", "Maya Sol", "Electronic", "Synthwave", ["Driving", "Confident"], 118, "Am", 184, false, true, false, 2025],
  ["signal-flare", "Signal Flare", "Maya Sol", "Electronic", "Cinematic Pop", ["Urgent", "Shimmering"], 126, "F#m", 201, false, true, false, 2026],
  ["open-highway", "Open Highway", "Caleb Rowe", "Folk", "Americana", ["Hopeful", "Warm"], 96, "G", 214, false, true, false, 2024],
  ["small-town-gold", "Small Town Gold", "Caleb Rowe", "Folk", "Indie Folk", ["Nostalgic", "Earnest"], 88, "D", 196, false, true, false, 2023],
  ["golden-hour-club", "Golden Hour Club", "Linh Hart", "Pop", "Dance Pop", ["Bright", "Upbeat"], 122, "C", 189, false, true, false, 2026],
  ["afterlight", "Afterlight", "Linh Hart", "Pop", "Alt Pop", ["Emotive", "Polished"], 110, "E", 207, false, true, false, 2025],
  ["black-glass", "Black Glass", "Omar Vale", "Electronic", "Dark Pulse", ["Tense", "Cinematic"], 132, "Dm", 172, true, false, false, 2026],
  ["gravity-well", "Gravity Well", "Omar Vale", "Electronic", "Trailer Hybrid", ["Massive", "Dark"], 140, "Bm", 158, true, false, false, 2025],
  ["stay-in-frame", "Stay In Frame", "Serena North", "Indie Pop", "Bedroom Pop", ["Tender", "Airy"], 104, "A", 212, false, true, false, 2026],
  ["closer-than-light", "Closer Than Light", "Serena North", "Indie Pop", "Dream Pop", ["Romantic", "Floating"], 98, "F", 220, false, true, false, 2025]
] as const;

export const tracks: Track[] = Array.from({ length: 20 }, (_, index) => {
  const base = demoTrackBase[index % demoTrackBase.length];
  const id = `track-${index + 1}`;
  const artistUserId = `artist-${(index % 5) + 1}`;
  return {
    id,
    artist_user_id: artistUserId,
    artist_name: base[2],
    title: index < 10 ? base[1] : `${base[1]} Edit ${index - 9}`,
    slug: index < 10 ? base[0] : `${base[0]}-edit-${index - 9}`,
    description: "Broadcast-ready production with clear metadata, rights visibility, and licensing options designed for fast clearance.",
    genre: base[3],
    subgenre: base[4],
    mood: [...base[5]],
    bpm: base[6],
    key: base[7],
    duration_seconds: base[8],
    instrumental: base[9],
    vocals: base[10],
    explicit: base[11],
    lyrics: base[10] ? "Sample lyric excerpt reserved for lyric review and placement notes." : null,
    release_year: base[12],
    waveform_preview_url: null,
    audio_file_url: "/demo/audio-preview.mp3",
    cover_art_url: `https://images.unsplash.com/photo-${index % 2 === 0 ? "1493225457124-a3eb161ffa5f" : "1511379938547-c1f69419868d"}?auto=format&fit=crop&w=1200&q=80`,
    status: index < 15 ? "approved" : index < 18 ? "pending_review" : "draft",
    featured: index < 4,
    created_at: now,
    updated_at: now,
    rights_holders: [
      { id: `${id}-rh-1`, track_id: id, name: base[2], email: `${base[2].toLowerCase().replace(/ /g, ".")}@sync.exchange`, role_type: "writer", ownership_percent: 50, approval_status: "approved", created_at: now, updated_at: now },
      { id: `${id}-rh-2`, track_id: id, name: `${base[2]} Publishing`, email: "publishing@sync.exchange", role_type: "publisher", ownership_percent: 50, approval_status: "pending", created_at: now, updated_at: now }
    ],
    license_options: licenseTypes.map((license) => ({
      ...license,
      price_override: license.exclusive ? license.base_price + index * 150 : license.base_price + index * 25
    }))
  };
});

export const favorites: Favorite[] = [
  { id: "fav-1", buyer_user_id: "buyer-1", track_id: "track-1", created_at: now },
  { id: "fav-2", buyer_user_id: "buyer-1", track_id: "track-7", created_at: now },
  { id: "fav-3", buyer_user_id: "buyer-2", track_id: "track-5", created_at: now }
];

export const orders: Order[] = [
  { id: "ord-1", buyer_user_id: "buyer-1", track_id: "track-2", license_type_id: "lt-2", stripe_checkout_session_id: "cs_demo_123", stripe_payment_intent_id: "pi_demo_123", amount_paid: 4800, currency: "USD", order_status: "fulfilled", agreement_url: "/agreements/demo-broadcast-license.pdf", created_at: now, updated_at: now },
  { id: "ord-2", buyer_user_id: "buyer-2", track_id: "track-8", license_type_id: "lt-4", stripe_checkout_session_id: "cs_demo_456", stripe_payment_intent_id: "pi_demo_456", amount_paid: 19200, currency: "USD", order_status: "paid", agreement_url: "/agreements/demo-exclusive-license.pdf", created_at: now, updated_at: now }
];

export const adminFlags: AdminFlag[] = [
  { id: "flag-1", track_id: "track-18", flag_type: "Metadata Review", severity: "medium", notes: "Lyrics field incomplete for vocal submission.", status: "open", created_by: "admin-1", created_at: now, updated_at: now },
  { id: "flag-2", track_id: "track-19", flag_type: "Rights Split Issue", severity: "high", notes: "Writer and publisher percentages do not reconcile to 100%.", status: "open", created_by: "admin-1", created_at: now, updated_at: now }
];

export const demoSessionUsers: Record<string, SessionUser> = {
  artist: {
    id: "artist-1",
    email: "maya@sync.exchange",
    role: "artist",
    fullName: "Maya Sol",
    onboardingComplete: true,
    onboardingStep: "complete",
    onboardingStartedAt: now,
    onboardingCompletedAt: now,
    onboardingData: {}
  },
  buyer: {
    id: "buyer-1",
    email: "music@northframe.co",
    role: "buyer",
    fullName: "Elena Park",
    onboardingComplete: true,
    onboardingStep: "complete",
    onboardingStartedAt: now,
    onboardingCompletedAt: now,
    onboardingData: {}
  },
  admin: {
    id: "admin-1",
    email: "admin@thesyncexchange.com",
    role: "admin",
    fullName: "Platform Admin",
    onboardingComplete: true,
    onboardingStep: null,
    onboardingStartedAt: now,
    onboardingCompletedAt: now,
    onboardingData: {}
  }
};
