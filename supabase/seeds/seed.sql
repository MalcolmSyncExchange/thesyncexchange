insert into public.users (id, email, role, full_name)
values
  ('11111111-1111-1111-1111-111111111111', 'maya@sync.exchange', 'artist', 'Maya Sol'),
  ('22222222-2222-2222-2222-222222222222', 'caleb@sync.exchange', 'artist', 'Caleb Rowe'),
  ('33333333-3333-3333-3333-333333333333', 'linh@sync.exchange', 'artist', 'Linh Hart'),
  ('44444444-4444-4444-4444-444444444444', 'omar@sync.exchange', 'artist', 'Omar Vale'),
  ('55555555-5555-5555-5555-555555555555', 'serena@sync.exchange', 'artist', 'Serena North'),
  ('66666666-6666-6666-6666-666666666666', 'music@northframe.co', 'buyer', 'Elena Park'),
  ('77777777-7777-7777-7777-777777777777', 'licensing@bayshore.studio', 'buyer', 'Jordan Pike'),
  ('88888888-8888-8888-8888-888888888888', 'admin@thesyncexchange.com', 'admin', 'Platform Admin')
on conflict (id) do nothing;

insert into public.artist_profiles (user_id, artist_name, bio, location, website, social_links, payout_email, verification_status)
values
  ('11111111-1111-1111-1111-111111111111', 'Maya Sol', 'Cinematic electronic songwriter with premium sync-ready toplines.', 'Los Angeles, CA', 'https://mayasol.studio', '{"instagram":"@mayasolmusic"}', 'maya@sync.exchange', 'verified'),
  ('22222222-2222-2222-2222-222222222222', 'Caleb Rowe', 'Indie-folk producer creating emotionally direct records for story-led placements.', 'Nashville, TN', 'https://calebrowe.com', '{"instagram":"@calebrowesounds"}', 'caleb@sync.exchange', 'verified'),
  ('33333333-3333-3333-3333-333333333333', 'Linh Hart', 'Modern pop writer delivering polished, ad-ready vocal production.', 'New York, NY', 'https://linhhart.io', '{"instagram":"@linhhartmusic"}', 'linh@sync.exchange', 'pending'),
  ('44444444-4444-4444-4444-444444444444', 'Omar Vale', 'Dark electronic composer focused on cinematic tension and pulse.', 'Austin, TX', 'https://omarvale.audio', '{"instagram":"@omarvalescore"}', 'omar@sync.exchange', 'verified'),
  ('55555555-5555-5555-5555-555555555555', 'Serena North', 'Organic indie-pop artist blending intimacy with commercial finish.', 'Portland, OR', 'https://serenanorthmusic.com', '{"instagram":"@serenanorth"}', 'serena@sync.exchange', 'unverified')
on conflict do nothing;

insert into public.buyer_profiles (user_id, company_name, industry_type, buyer_type, billing_email)
values
  ('66666666-6666-6666-6666-666666666666', 'Northframe Creative', 'Advertising', 'Music Supervisor', 'music@northframe.co'),
  ('77777777-7777-7777-7777-777777777777', 'Bayshore Studio', 'Film & TV', 'Producer', 'licensing@bayshore.studio')
on conflict do nothing;

insert into public.license_types (id, name, slug, description, exclusive, base_price, terms_summary, active)
values
  ('99999999-0000-0000-0000-000000000001', 'Digital Campaign', 'digital-campaign', 'Paid social, web, and short-form branded content.', false, 1200, '12-month digital-only usage.', true),
  ('99999999-0000-0000-0000-000000000002', 'Broadcast', 'broadcast', 'TV, streaming, and regional or national campaign rollout.', false, 4800, 'Broadcast and streaming usage.', true),
  ('99999999-0000-0000-0000-000000000003', 'Trailer / Promo', 'trailer-promo', 'High-impact promo and trailer deployment.', false, 6800, 'Non-exclusive trailer and promo use.', true),
  ('99999999-0000-0000-0000-000000000004', 'Exclusive Buyout', 'exclusive-buyout', 'Premium exclusive rights negotiation scaffold.', true, 18000, 'TODO: final legal terms required.', true)
on conflict (id) do nothing;

-- Demo track and related data inserts should be expanded or generated via app-side seed loaders.
-- TODO: connect this seed file to a proper Supabase seed pipeline if live local SQL seeding becomes part of setup.
