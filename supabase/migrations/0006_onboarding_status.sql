alter table public.users
  add column if not exists onboarding_started_at timestamptz,
  add column if not exists onboarding_completed_at timestamptz,
  add column if not exists onboarding_step text,
  add column if not exists onboarding_payload jsonb not null default '{}'::jsonb;

alter table public.artist_profiles
  add column if not exists default_licensing_preferences text;

alter table public.buyer_profiles
  add column if not exists music_preferences jsonb not null default '{}'::jsonb;

drop policy if exists "Users can update their own record" on public.users;
drop policy if exists "Users can insert their own record" on public.users;
create policy "Users can insert their own record" on public.users for insert with check (auth.uid() = id);
create policy "Users can update their own record" on public.users for update using (auth.uid() = id) with check (auth.uid() = id);

comment on column public.users.onboarding_payload is 'Partial onboarding data persisted between steps so refreshes and re-logins resume safely.';
comment on column public.artist_profiles.default_licensing_preferences is 'TODO: legal/business review required before default licensing preferences become production policy.';
comment on column public.buyer_profiles.music_preferences is 'Stored onboarding preferences for discovery, recommendation, and buyer workflow tuning.';
