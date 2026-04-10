create extension if not exists "pgcrypto";

create type public.user_role as enum ('artist', 'buyer', 'admin');
create type public.verification_status as enum ('unverified', 'pending', 'verified');
create type public.track_status as enum ('draft', 'pending_review', 'approved', 'rejected');
create type public.approval_status as enum ('pending', 'approved', 'rejected');
create type public.order_status as enum ('pending', 'paid', 'fulfilled', 'refunded');
create type public.flag_status as enum ('open', 'resolved');

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  role public.user_role not null,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.artist_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  artist_name text not null,
  bio text not null default '',
  location text not null default '',
  website text,
  social_links jsonb not null default '{}'::jsonb,
  payout_email text,
  verification_status public.verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.buyer_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  company_name text not null,
  industry_type text not null,
  buyer_type text not null,
  billing_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tracks (
  id uuid primary key default gen_random_uuid(),
  artist_user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  slug text not null unique,
  description text not null default '',
  genre text not null,
  subgenre text not null,
  mood text[] not null default '{}',
  bpm integer not null,
  key text not null,
  duration_seconds integer not null,
  instrumental boolean not null default false,
  vocals boolean not null default true,
  explicit boolean not null default false,
  lyrics text,
  release_year integer not null,
  waveform_preview_url text,
  audio_file_url text,
  cover_art_url text,
  status public.track_status not null default 'draft',
  featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rights_holders (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  name text not null,
  email text not null,
  role_type text not null,
  ownership_percent numeric(5,2) not null check (ownership_percent >= 0 and ownership_percent <= 100),
  approval_status public.approval_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.license_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null,
  exclusive boolean not null default false,
  base_price integer not null,
  terms_summary text not null,
  active boolean not null default true
);

create table if not exists public.track_license_options (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  license_type_id uuid not null references public.license_types(id) on delete cascade,
  price_override integer,
  active boolean not null default true,
  unique(track_id, license_type_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references public.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id),
  license_type_id uuid not null references public.license_types(id),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  amount_paid integer not null,
  currency text not null default 'USD',
  order_status public.order_status not null default 'pending',
  agreement_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.favorites (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references public.users(id) on delete cascade,
  track_id uuid not null references public.tracks(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(buyer_user_id, track_id)
);

create table if not exists public.admin_flags (
  id uuid primary key default gen_random_uuid(),
  track_id uuid not null references public.tracks(id) on delete cascade,
  flag_type text not null,
  notes text not null,
  status public.flag_status not null default 'open',
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_users_updated_at before update on public.users for each row execute function public.update_updated_at_column();
create trigger update_artist_profiles_updated_at before update on public.artist_profiles for each row execute function public.update_updated_at_column();
create trigger update_buyer_profiles_updated_at before update on public.buyer_profiles for each row execute function public.update_updated_at_column();
create trigger update_tracks_updated_at before update on public.tracks for each row execute function public.update_updated_at_column();
create trigger update_rights_holders_updated_at before update on public.rights_holders for each row execute function public.update_updated_at_column();
create trigger update_orders_updated_at before update on public.orders for each row execute function public.update_updated_at_column();
create trigger update_admin_flags_updated_at before update on public.admin_flags for each row execute function public.update_updated_at_column();

alter table public.users enable row level security;
alter table public.artist_profiles enable row level security;
alter table public.buyer_profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.rights_holders enable row level security;
alter table public.track_license_options enable row level security;
alter table public.orders enable row level security;
alter table public.favorites enable row level security;
alter table public.admin_flags enable row level security;

create policy "Users can read their own record" on public.users for select using (auth.uid() = id);
create policy "Artists can manage their profile" on public.artist_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Buyers can manage their profile" on public.buyer_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Approved tracks are public" on public.tracks for select using (status = 'approved' or auth.uid() = artist_user_id);
create policy "Artists can manage their tracks" on public.tracks for all using (auth.uid() = artist_user_id) with check (auth.uid() = artist_user_id);
create policy "Track rights holders visible to owner" on public.rights_holders for select using (
  exists(select 1 from public.tracks where tracks.id = rights_holders.track_id and tracks.artist_user_id = auth.uid())
);
create policy "Track license options are public for approved tracks" on public.track_license_options for select using (true);
create policy "Buyers manage their orders" on public.orders for select using (auth.uid() = buyer_user_id);
create policy "Buyers manage their favorites" on public.favorites for all using (auth.uid() = buyer_user_id) with check (auth.uid() = buyer_user_id);

comment on table public.orders is 'TODO: legal review required before agreement_url is treated as production contract output.';
