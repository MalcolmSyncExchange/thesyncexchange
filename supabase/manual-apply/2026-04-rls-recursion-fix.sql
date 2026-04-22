-- The Sync Exchange
-- Manual patch for hosted Supabase projects that already ran the bootstrap SQL
-- before `public.current_app_role()` and `public.is_admin()` were marked
-- SECURITY DEFINER.
--
-- Why this exists:
-- RLS policies on multiple tables call `public.is_admin()`. That helper reads
-- `public.user_profiles`, and if it runs under the caller's RLS context it can
-- recurse back into policies that call `public.is_admin()` again.
--
-- This patch is safe to rerun and only updates the function execution context.

create or replace function public.current_app_role()
returns public.user_role
language sql
stable
security definer
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
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin', false)
$$;

comment on function public.current_app_role() is
  'Returns the current authenticated user role through a definer context so RLS policies can check role state without recursive user_profiles policy evaluation.';

comment on function public.is_admin() is
  'Returns true when the current authenticated user has the admin role, using a definer context that is safe for RLS policy checks.';
