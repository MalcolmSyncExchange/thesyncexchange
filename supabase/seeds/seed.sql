insert into public.license_types (id, code, slug, name, description, exclusive, default_price_cents, terms_summary, active)
values
  ('99999999-0000-0000-0000-000000000001', 'digital-campaign', 'digital-campaign', 'Digital Campaign', 'Paid social, web, and short-form branded content.', false, 120000, '12-month digital-only usage.', true),
  ('99999999-0000-0000-0000-000000000002', 'broadcast', 'broadcast', 'Broadcast', 'TV, streaming, and regional or national campaign rollout.', false, 480000, 'Broadcast and streaming usage.', true),
  ('99999999-0000-0000-0000-000000000003', 'trailer-promo', 'trailer-promo', 'Trailer / Promo', 'High-impact promo and trailer deployment.', false, 680000, 'Non-exclusive trailer and promo use.', true),
  ('99999999-0000-0000-0000-000000000004', 'exclusive-buyout', 'exclusive-buyout', 'Exclusive Buyout', 'Premium exclusive rights negotiation scaffold.', true, 1800000, 'TODO: final legal terms required.', true)
on conflict (id) do update
set
  code = excluded.code,
  slug = excluded.slug,
  name = excluded.name,
  description = excluded.description,
  exclusive = excluded.exclusive,
  default_price_cents = excluded.default_price_cents,
  terms_summary = excluded.terms_summary,
  active = excluded.active;

with existing_auth_users as (
  select
    id,
    email,
    case
      when email in (
        'maya@sync.exchange',
        'caleb@sync.exchange',
        'linh@sync.exchange',
        'omar@sync.exchange',
        'serena@sync.exchange'
      ) then 'artist'
      when email in (
        'music@northframe.co',
        'licensing@bayshore.studio'
      ) then 'buyer'
      when email = 'admin@thesyncexchange.com' then 'admin'
      else null
    end as role,
    case email
      when 'maya@sync.exchange' then 'Maya Sol'
      when 'caleb@sync.exchange' then 'Caleb Rowe'
      when 'linh@sync.exchange' then 'Linh Hart'
      when 'omar@sync.exchange' then 'Omar Vale'
      when 'serena@sync.exchange' then 'Serena North'
      when 'music@northframe.co' then 'Elena Park'
      when 'licensing@bayshore.studio' then 'Jordan Pike'
      when 'admin@thesyncexchange.com' then 'Platform Admin'
      else split_part(email, '@', 1)
    end as full_name
  from auth.users
  where email in (
    'maya@sync.exchange',
    'caleb@sync.exchange',
    'linh@sync.exchange',
    'omar@sync.exchange',
    'serena@sync.exchange',
    'music@northframe.co',
    'licensing@bayshore.studio',
    'admin@thesyncexchange.com'
  )
)
insert into public.user_profiles (
  id,
  email,
  role,
  full_name,
  onboarding_started_at,
  onboarding_completed_at,
  onboarding_step
)
select
  id,
  email,
  role::public.user_role,
  full_name,
  now(),
  now(),
  case when role = 'admin' then null else 'complete' end
from existing_auth_users
where role is not null
on conflict (id) do update
set
  email = excluded.email,
  role = excluded.role,
  full_name = excluded.full_name,
  onboarding_started_at = coalesce(public.user_profiles.onboarding_started_at, excluded.onboarding_started_at),
  onboarding_completed_at = excluded.onboarding_completed_at,
  onboarding_step = excluded.onboarding_step;

insert into public.artist_profiles (user_id, artist_name, bio, location, website, instagram_url, payout_email, verification_status)
select
  id,
  case email
    when 'maya@sync.exchange' then 'Maya Sol'
    when 'caleb@sync.exchange' then 'Caleb Rowe'
    when 'linh@sync.exchange' then 'Linh Hart'
    when 'omar@sync.exchange' then 'Omar Vale'
    when 'serena@sync.exchange' then 'Serena North'
  end,
  case email
    when 'maya@sync.exchange' then 'Cinematic electronic songwriter with premium sync-ready toplines.'
    when 'caleb@sync.exchange' then 'Indie-folk producer creating emotionally direct records for story-led placements.'
    when 'linh@sync.exchange' then 'Modern pop writer delivering polished, ad-ready vocal production.'
    when 'omar@sync.exchange' then 'Dark electronic composer focused on cinematic tension and pulse.'
    when 'serena@sync.exchange' then 'Organic indie-pop artist blending intimacy with commercial finish.'
  end,
  case email
    when 'maya@sync.exchange' then 'Los Angeles, CA'
    when 'caleb@sync.exchange' then 'Nashville, TN'
    when 'linh@sync.exchange' then 'New York, NY'
    when 'omar@sync.exchange' then 'Austin, TX'
    when 'serena@sync.exchange' then 'Portland, OR'
  end,
  case email
    when 'maya@sync.exchange' then 'https://mayasol.studio'
    when 'caleb@sync.exchange' then 'https://calebrowe.com'
    when 'linh@sync.exchange' then 'https://linhhart.io'
    when 'omar@sync.exchange' then 'https://omarvale.audio'
    when 'serena@sync.exchange' then 'https://serenanorthmusic.com'
  end,
  case email
    when 'maya@sync.exchange' then '@mayasolmusic'
    when 'caleb@sync.exchange' then '@calebrowesounds'
    when 'linh@sync.exchange' then '@linhhartmusic'
    when 'omar@sync.exchange' then '@omarvalescore'
    when 'serena@sync.exchange' then '@serenanorth'
  end,
  email,
  case
    when email in ('maya@sync.exchange', 'caleb@sync.exchange', 'omar@sync.exchange') then 'verified'::public.verification_status
    when email = 'linh@sync.exchange' then 'pending'::public.verification_status
    else 'unverified'::public.verification_status
  end
from auth.users
where email in (
  'maya@sync.exchange',
  'caleb@sync.exchange',
  'linh@sync.exchange',
  'omar@sync.exchange',
  'serena@sync.exchange'
)
on conflict (user_id) do update
set
  artist_name = excluded.artist_name,
  bio = excluded.bio,
  location = excluded.location,
  website = excluded.website,
  instagram_url = excluded.instagram_url,
  payout_email = excluded.payout_email,
  verification_status = excluded.verification_status;

insert into public.buyer_profiles (user_id, company_name, industry_type, buyer_type, billing_email)
select
  id,
  case email
    when 'music@northframe.co' then 'Northframe Creative'
    when 'licensing@bayshore.studio' then 'Bayshore Studio'
  end,
  case email
    when 'music@northframe.co' then 'Advertising'
    when 'licensing@bayshore.studio' then 'Film & TV'
  end,
  case email
    when 'music@northframe.co' then 'Music Supervisor'
    when 'licensing@bayshore.studio' then 'Producer'
  end,
  email
from auth.users
where email in ('music@northframe.co', 'licensing@bayshore.studio')
on conflict (user_id) do update
set
  company_name = excluded.company_name,
  industry_type = excluded.industry_type,
  buyer_type = excluded.buyer_type,
  billing_email = excluded.billing_email;

-- Tracks, license options, favorites, and orders should be seeded after the local
-- auth users above exist so foreign keys remain aligned to auth.users ids.
