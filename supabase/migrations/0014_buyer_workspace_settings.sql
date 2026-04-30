create table if not exists public.buyer_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  purchase_receipts boolean not null default true,
  license_agreement_ready boolean not null default true,
  platform_updates boolean not null default true,
  security_alerts boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

drop trigger if exists update_buyer_notification_preferences_updated_at on public.buyer_notification_preferences;
create trigger update_buyer_notification_preferences_updated_at
before update on public.buyer_notification_preferences
for each row
execute function public.update_updated_at_column();

alter table public.buyer_notification_preferences enable row level security;

drop policy if exists "Buyers can manage own notification preferences" on public.buyer_notification_preferences;
drop policy if exists "Admins can read notification preferences" on public.buyer_notification_preferences;

create policy "Buyers can manage own notification preferences"
on public.buyer_notification_preferences
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "Admins can read notification preferences"
on public.buyer_notification_preferences
for select
to authenticated
using (public.is_admin());

create table if not exists public.buyer_team_invites (
  id uuid primary key default gen_random_uuid(),
  buyer_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'member', 'billing')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint buyer_team_invites_pending_unique unique (buyer_user_id, email, status)
);

create index if not exists buyer_team_invites_buyer_created_idx on public.buyer_team_invites(buyer_user_id, created_at desc);
create index if not exists buyer_team_invites_email_idx on public.buyer_team_invites(email);

drop trigger if exists update_buyer_team_invites_updated_at on public.buyer_team_invites;
create trigger update_buyer_team_invites_updated_at
before update on public.buyer_team_invites
for each row
execute function public.update_updated_at_column();

alter table public.buyer_team_invites enable row level security;

drop policy if exists "Buyers can manage own team invites" on public.buyer_team_invites;
drop policy if exists "Admins can read team invites" on public.buyer_team_invites;

create policy "Buyers can manage own team invites"
on public.buyer_team_invites
for all
to authenticated
using (buyer_user_id = auth.uid())
with check (buyer_user_id = auth.uid() and invited_by = auth.uid());

create policy "Admins can read team invites"
on public.buyer_team_invites
for select
to authenticated
using (public.is_admin());

comment on table public.buyer_notification_preferences is 'Buyer workspace notification settings for receipts, license readiness, product updates, and required security alerts.';
comment on column public.buyer_notification_preferences.security_alerts is 'Security alerts are required and should remain enabled for account safety.';
comment on table public.buyer_team_invites is 'Pending buyer workspace team invitations. Pending records do not grant access until accepted by a future invite flow.';
