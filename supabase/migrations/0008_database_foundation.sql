begin;

create extension if not exists "pgcrypto";

do $$
begin
  if exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'track_status') then
    alter type public.track_status add value if not exists 'archived';
  end if;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  if to_regclass('public.user_profiles') is null and to_regclass('public.users') is not null then
    alter table public.users rename to user_profiles;
  end if;
end $$;

create table if not exists public.user_profiles (
  id uuid primary key,
  email text not null unique,
  role public.user_role,
  full_name text not null,
  avatar_url text,
  onboarding_started_at timestamptz,
  onboarding_completed_at timestamptz,
  onboarding_step text,
  onboarding_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles
  alter column id drop default,
  alter column role drop not null;

alter table public.user_profiles
  add column if not exists email text,
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_step text,
  add column if not exists onboarding_payload jsonb not null default '{}'::jsonb;

alter table public.user_profiles
  alter column email set not null,
  alter column full_name set not null;

alter table public.user_profiles
  drop constraint if exists user_profiles_id_fkey;

alter table public.user_profiles
  add constraint user_profiles_id_fkey
  foreign key (id)
  references auth.users(id)
  on delete cascade
  not valid;

alter table public.artist_profiles
  add column if not exists instagram_url text,
  add column if not exists spotify_url text,
  add column if not exists youtube_url text;

update public.artist_profiles
set
  instagram_url = coalesce(instagram_url, social_links ->> 'instagram'),
  spotify_url = coalesce(spotify_url, social_links ->> 'spotify'),
  youtube_url = coalesce(youtube_url, social_links ->> 'youtube');

create unique index if not exists artist_profiles_user_id_key on public.artist_profiles(user_id);
create unique index if not exists buyer_profiles_user_id_key on public.buyer_profiles(user_id);

alter table public.artist_profiles
  drop constraint if exists artist_profiles_user_id_fkey;

alter table public.artist_profiles
  add constraint artist_profiles_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade
  not valid;

alter table public.buyer_profiles
  drop constraint if exists buyer_profiles_user_id_fkey;

alter table public.buyer_profiles
  add constraint buyer_profiles_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete cascade
  not valid;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'mood'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'moods'
  ) then
    alter table public.tracks rename column mood to moods;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'key'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'musical_key'
  ) then
    alter table public.tracks rename column key to musical_key;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'cover_art_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'cover_art_path'
  ) then
    alter table public.tracks rename column cover_art_url to cover_art_path;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'audio_file_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'audio_file_path'
  ) then
    alter table public.tracks rename column audio_file_url to audio_file_path;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'waveform_preview_url'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'tracks' and column_name = 'waveform_path'
  ) then
    alter table public.tracks rename column waveform_preview_url to waveform_path;
  end if;
end $$;

alter table public.tracks
  add column if not exists preview_file_path text,
  add column if not exists waveform_data jsonb not null default '[]'::jsonb,
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid;

alter table public.tracks
  drop constraint if exists tracks_artist_user_id_fkey,
  drop constraint if exists tracks_approved_by_fkey;

alter table public.tracks
  add constraint tracks_artist_user_id_fkey
  foreign key (artist_user_id)
  references auth.users(id)
  on delete cascade
  not valid,
  add constraint tracks_approved_by_fkey
  foreign key (approved_by)
  references auth.users(id)
  on delete set null
  not valid;

alter table public.tracks
  drop constraint if exists tracks_bpm_check,
  drop constraint if exists tracks_duration_seconds_check,
  drop constraint if exists tracks_release_year_check,
  drop constraint if exists tracks_vocal_consistency_check;

alter table public.tracks
  add constraint tracks_bpm_check check (bpm between 0 and 300),
  add constraint tracks_duration_seconds_check check (duration_seconds between 1 and 3600),
  add constraint tracks_release_year_check check (release_year between 1900 and 2100),
  add constraint tracks_vocal_consistency_check check (not (instrumental and vocals));

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'rights_holders' and column_name = 'user_id'
  ) then
    null;
  else
    alter table public.rights_holders add column user_id uuid;
  end if;
end $$;

alter table public.rights_holders
  drop constraint if exists rights_holders_user_id_fkey;

alter table public.rights_holders
  add constraint rights_holders_user_id_fkey
  foreign key (user_id)
  references auth.users(id)
  on delete set null
  not valid;

alter table public.rights_holders
  drop constraint if exists rights_holders_role_type_check,
  drop constraint if exists rights_holders_ownership_percent_check;

alter table public.rights_holders
  add constraint rights_holders_role_type_check check (role_type in ('writer', 'producer', 'publisher', 'owner', 'other')),
  add constraint rights_holders_ownership_percent_check check (ownership_percent > 0 and ownership_percent <= 100);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'license_types' and column_name = 'base_price'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'license_types' and column_name = 'default_price_cents'
  ) then
    alter table public.license_types rename column base_price to default_price_cents;
    update public.license_types
    set default_price_cents = default_price_cents * 100
    where default_price_cents is not null;
  end if;
end $$;

alter table public.license_types
  add column if not exists code text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists terms_summary text not null default '';

update public.license_types
set code = coalesce(code, slug)
where code is null;

alter table public.license_types
  alter column code set not null,
  alter column default_price_cents set not null;

alter table public.license_types
  drop constraint if exists license_types_default_price_cents_check;

alter table public.license_types
  add constraint license_types_default_price_cents_check check (default_price_cents >= 0);

create unique index if not exists license_types_code_key on public.license_types(code);
create unique index if not exists license_types_slug_key on public.license_types(slug);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'track_license_options' and column_name = 'price_override'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'track_license_options' and column_name = 'price_cents'
  ) then
    alter table public.track_license_options rename column price_override to price_cents;
    update public.track_license_options
    set price_cents = price_cents * 100
    where price_cents is not null;
  end if;
end $$;

alter table public.track_license_options
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.track_license_options
  drop constraint if exists track_license_options_price_cents_check;

alter table public.track_license_options
  add constraint track_license_options_price_cents_check check (price_cents is null or price_cents >= 0);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'amount_paid'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'amount_cents'
  ) then
    alter table public.orders rename column amount_paid to amount_cents;
    update public.orders
    set amount_cents = amount_cents * 100
    where amount_cents is not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'order_status'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'status'
  ) then
    alter table public.orders rename column order_status to status;
  end if;
end $$;

alter table public.orders
  drop constraint if exists orders_buyer_user_id_fkey,
  drop constraint if exists orders_amount_cents_check,
  drop constraint if exists orders_currency_check,
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_buyer_user_id_fkey
  foreign key (buyer_user_id)
  references auth.users(id)
  on delete cascade
  not valid,
  add constraint orders_amount_cents_check check (amount_cents >= 0),
  add constraint orders_currency_check check (char_length(currency) = 3 and currency = upper(currency));

create unique index if not exists orders_stripe_checkout_session_id_key
  on public.orders(stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

create unique index if not exists orders_stripe_payment_intent_id_key
  on public.orders(stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.favorites
  drop constraint if exists favorites_buyer_user_id_fkey;

alter table public.favorites
  add constraint favorites_buyer_user_id_fkey
  foreign key (buyer_user_id)
  references auth.users(id)
  on delete cascade
  not valid;

alter table public.admin_flags
  drop constraint if exists admin_flags_created_by_fkey;

alter table public.admin_flags
  add constraint admin_flags_created_by_fkey
  foreign key (created_by)
  references auth.users(id)
  on delete cascade
  not valid;

alter table public.review_notes
  drop constraint if exists review_notes_author_id_fkey;

alter table public.review_notes
  add constraint review_notes_author_id_fkey
  foreign key (author_id)
  references auth.users(id)
  on delete cascade
  not valid;

alter table public.track_audit_log
  drop constraint if exists track_audit_log_actor_id_fkey;

alter table public.track_audit_log
  add constraint track_audit_log_actor_id_fkey
  foreign key (actor_id)
  references auth.users(id)
  on delete set null
  not valid;

create index if not exists user_profiles_role_idx on public.user_profiles(role);
create index if not exists user_profiles_onboarding_idx on public.user_profiles(onboarding_completed_at, onboarding_step);
create index if not exists tracks_artist_status_idx on public.tracks(artist_user_id, status, created_at desc);
create index if not exists tracks_status_featured_idx on public.tracks(status, featured, created_at desc);
create index if not exists tracks_approved_at_idx on public.tracks(approved_at desc);
create index if not exists rights_holders_track_idx on public.rights_holders(track_id);
create index if not exists rights_holders_user_idx on public.rights_holders(user_id);
create index if not exists track_license_options_track_idx on public.track_license_options(track_id);
create index if not exists orders_buyer_status_idx on public.orders(buyer_user_id, status, created_at desc);
create index if not exists orders_track_idx on public.orders(track_id);
create index if not exists favorites_buyer_idx on public.favorites(buyer_user_id, created_at desc);
create index if not exists admin_flags_track_status_idx on public.admin_flags(track_id, status, created_at desc);
create index if not exists review_notes_track_created_idx on public.review_notes(track_id, created_at desc);
create index if not exists track_audit_log_track_created_idx on public.track_audit_log(track_id, created_at desc);

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
set search_path = public
as $$
  select role
  from public.user_profiles
  where id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  metadata_role public.user_role;
begin
  metadata_role :=
    case
      when new.raw_user_meta_data ->> 'role' in ('artist', 'buyer') then (new.raw_user_meta_data ->> 'role')::public.user_role
      when new.raw_user_meta_data ->> 'role' = 'admin' then null
      else null
    end;

  insert into public.user_profiles (
    id,
    email,
    role,
    full_name,
    avatar_url
  )
  values (
    new.id,
    new.email,
    metadata_role,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = coalesce(public.user_profiles.full_name, excluded.full_name),
    avatar_url = coalesce(public.user_profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

create or replace function public.guard_user_profile_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.id <> auth.uid() then
    raise exception 'You may only manage your own profile.';
  end if;

  if new.role = 'admin' then
    raise exception 'Role escalation is not allowed.';
  end if;

  if tg_op = 'UPDATE' and old.role is not null and new.role is distinct from old.role then
    raise exception 'Role changes are locked once selected.';
  end if;

  if tg_op = 'INSERT' and new.role is not null and new.role not in ('artist', 'buyer') then
    raise exception 'Invalid role selection.';
  end if;

  if tg_op = 'UPDATE' and old.role is null and new.role is not null and new.role not in ('artist', 'buyer') then
    raise exception 'Invalid role selection.';
  end if;

  return new;
end;
$$;

create or replace function public.guard_track_write()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  rights_total numeric(7,2);
begin
  if auth.uid() is null or public.is_admin() then
    if new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved') then
      select coalesce(sum(ownership_percent), 0)
      into rights_total
      from public.rights_holders
      where track_id = new.id;

      if abs(rights_total - 100) > 0.01 then
        raise exception 'Approved tracks must have rights holder ownership totals equal to 100%%.';
      end if;

      new.approved_at = coalesce(new.approved_at, now());
      new.approved_by = coalesce(new.approved_by, auth.uid());
    end if;

    return new;
  end if;

  if new.artist_user_id <> auth.uid() then
    raise exception 'Artists may only manage their own tracks.';
  end if;

  if new.status not in ('draft', 'pending_review', 'rejected', 'archived') then
    raise exception 'Artists may only save drafts, submit for review, revise rejected tracks, or archive their own catalog.';
  end if;

  if new.approved_at is not null or new.approved_by is not null then
    raise exception 'Approval fields are managed by admin workflows only.';
  end if;

  if new.featured then
    raise exception 'Featured state is managed by admins.';
  end if;

  return new;
end;
$$;

drop trigger if exists update_users_updated_at on public.user_profiles;
drop trigger if exists update_user_profiles_updated_at on public.user_profiles;
create trigger update_user_profiles_updated_at
before update on public.user_profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists update_artist_profiles_updated_at on public.artist_profiles;
create trigger update_artist_profiles_updated_at
before update on public.artist_profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists update_buyer_profiles_updated_at on public.buyer_profiles;
create trigger update_buyer_profiles_updated_at
before update on public.buyer_profiles
for each row execute function public.update_updated_at_column();

drop trigger if exists update_tracks_updated_at on public.tracks;
create trigger update_tracks_updated_at
before update on public.tracks
for each row execute function public.update_updated_at_column();

drop trigger if exists guard_tracks_write on public.tracks;
create trigger guard_tracks_write
before insert or update on public.tracks
for each row execute function public.guard_track_write();

drop trigger if exists update_rights_holders_updated_at on public.rights_holders;
create trigger update_rights_holders_updated_at
before update on public.rights_holders
for each row execute function public.update_updated_at_column();

drop trigger if exists update_license_types_updated_at on public.license_types;
create trigger update_license_types_updated_at
before update on public.license_types
for each row execute function public.update_updated_at_column();

drop trigger if exists update_track_license_options_updated_at on public.track_license_options;
create trigger update_track_license_options_updated_at
before update on public.track_license_options
for each row execute function public.update_updated_at_column();

drop trigger if exists update_orders_updated_at on public.orders;
create trigger update_orders_updated_at
before update on public.orders
for each row execute function public.update_updated_at_column();

drop trigger if exists update_admin_flags_updated_at on public.admin_flags;
create trigger update_admin_flags_updated_at
before update on public.admin_flags
for each row execute function public.update_updated_at_column();

drop trigger if exists guard_user_profiles_write on public.user_profiles;
create trigger guard_user_profiles_write
before insert or update on public.user_profiles
for each row execute function public.guard_user_profile_write();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email on auth.users
for each row execute function public.handle_auth_user_updated();

create or replace view public.track_rights_holders_public
with (security_barrier = true) as
select
  rights_holders.id,
  rights_holders.track_id,
  rights_holders.user_id,
  rights_holders.name,
  rights_holders.role_type,
  rights_holders.ownership_percent,
  rights_holders.approval_status,
  rights_holders.created_at,
  rights_holders.updated_at
from public.rights_holders
join public.tracks on tracks.id = rights_holders.track_id
where tracks.status = 'approved';

grant select on public.track_rights_holders_public to authenticated;

alter table public.user_profiles enable row level security;
alter table public.artist_profiles enable row level security;
alter table public.buyer_profiles enable row level security;
alter table public.tracks enable row level security;
alter table public.rights_holders enable row level security;
alter table public.license_types enable row level security;
alter table public.track_license_options enable row level security;
alter table public.favorites enable row level security;
alter table public.orders enable row level security;
alter table public.admin_flags enable row level security;
alter table public.review_notes enable row level security;
alter table public.track_audit_log enable row level security;

do $$
declare
  policy_record record;
  table_name text;
begin
  foreach table_name in array array[
    'user_profiles',
    'artist_profiles',
    'buyer_profiles',
    'tracks',
    'rights_holders',
    'license_types',
    'track_license_options',
    'favorites',
    'orders',
    'admin_flags',
    'review_notes',
    'track_audit_log'
  ]
  loop
    for policy_record in
      select policyname
      from pg_policies
      where schemaname = 'public'
        and tablename = table_name
    loop
      execute format('drop policy if exists %I on public.%I', policy_record.policyname, table_name);
    end loop;
  end loop;
end $$;

create policy "User profiles are readable by self or admin"
on public.user_profiles
for select
to authenticated
using (auth.uid() = id or public.is_admin());

create policy "User profiles can be inserted by self"
on public.user_profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "User profiles can be updated by self or admin"
on public.user_profiles
for update
to authenticated
using (auth.uid() = id or public.is_admin())
with check (auth.uid() = id or public.is_admin());

create policy "Artist profiles are readable by owner or admin"
on public.artist_profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "Artist profiles are writable by owner or admin"
on public.artist_profiles
for all
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "Buyer profiles are readable by owner or admin"
on public.buyer_profiles
for select
to authenticated
using (auth.uid() = user_id or public.is_admin());

create policy "Buyer profiles are writable by owner or admin"
on public.buyer_profiles
for all
to authenticated
using (auth.uid() = user_id or public.is_admin())
with check (auth.uid() = user_id or public.is_admin());

create policy "Tracks are readable by approved buyers, owners, or admins"
on public.tracks
for select
to authenticated
using (
  public.is_admin()
  or auth.uid() = artist_user_id
  or status = 'approved'
);

create policy "Artists can insert their own tracks"
on public.tracks
for insert
to authenticated
with check (auth.uid() = artist_user_id);

create policy "Artists and admins can update owned tracks"
on public.tracks
for update
to authenticated
using (public.is_admin() or auth.uid() = artist_user_id)
with check (public.is_admin() or auth.uid() = artist_user_id);

create policy "Artists and admins can delete owned tracks"
on public.tracks
for delete
to authenticated
using (public.is_admin() or auth.uid() = artist_user_id);

create policy "Rights holders are readable by track owners or admins"
on public.rights_holders
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tracks
    where tracks.id = rights_holders.track_id
      and tracks.artist_user_id = auth.uid()
  )
);

create policy "Rights holders are writable by track owners or admins"
on public.rights_holders
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tracks
    where tracks.id = rights_holders.track_id
      and tracks.artist_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tracks
    where tracks.id = rights_holders.track_id
      and tracks.artist_user_id = auth.uid()
  )
);

create policy "Active license types are readable to authenticated users"
on public.license_types
for select
to authenticated
using (active or public.is_admin());

create policy "License types are writable by admins"
on public.license_types
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Track license options are readable for approved tracks, owners, or admins"
on public.track_license_options
for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tracks
    where tracks.id = track_license_options.track_id
      and tracks.artist_user_id = auth.uid()
  )
  or exists (
    select 1
    from public.tracks
    where tracks.id = track_license_options.track_id
      and tracks.status = 'approved'
  )
);

create policy "Track license options are writable by track owners or admins"
on public.track_license_options
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tracks
    where tracks.id = track_license_options.track_id
      and tracks.artist_user_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tracks
    where tracks.id = track_license_options.track_id
      and tracks.artist_user_id = auth.uid()
  )
);

create policy "Favorites are managed by the owning buyer or admins"
on public.favorites
for all
to authenticated
using (public.is_admin() or auth.uid() = buyer_user_id)
with check (public.is_admin() or auth.uid() = buyer_user_id);

create policy "Orders are readable by the owning buyer or admins"
on public.orders
for select
to authenticated
using (public.is_admin() or auth.uid() = buyer_user_id);

create policy "Buyers can create pending orders for themselves"
on public.orders
for insert
to authenticated
with check (
  auth.uid() = buyer_user_id
  and status = 'pending'
);

create policy "Orders are writable by admins"
on public.orders
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admin flags are admin-only"
on public.admin_flags
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Review notes are admin-only"
on public.review_notes
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Track audit log is admin-only"
on public.track_audit_log
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

comment on table public.user_profiles is 'Application profile state keyed 1:1 to auth.users. auth.users remains the identity source.';
comment on table public.track_rights_holders_public is 'Safe buyer-facing rights holder projection without email addresses.';
comment on column public.user_profiles.role is 'Nullable until onboarding role selection is completed. Never infer buyer or artist without explicit user choice.';
comment on column public.license_types.default_price_cents is 'Stored in the smallest currency unit for Stripe and accounting consistency.';
comment on column public.track_license_options.price_cents is 'Optional track-level override stored in the smallest currency unit.';
comment on column public.orders.amount_cents is 'Final paid or pending amount stored in the smallest currency unit.';
comment on column public.orders.agreement_url is 'Generated agreement delivery URL. Final legal templates still require counsel review.';
comment on table public.orders is 'Order/payment records for hosted checkout. Agreement delivery remains subject to legal review.';

commit;
