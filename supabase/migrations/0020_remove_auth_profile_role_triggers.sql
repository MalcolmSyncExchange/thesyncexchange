-- Stop Supabase Auth database triggers from creating/updating app profile rows.
-- Profile creation, email reconciliation, and role assignment are handled by
-- trusted application server code using the Supabase service-role client.
-- This preserves the 0019 role guard without restoring a broad NULL auth.uid()
-- bypass or trusting user-controlled auth metadata for application roles.

begin;

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;

comment on function public.handle_auth_user_created() is
  'Deprecated: profile creation is handled by trusted application service-role code so auth metadata cannot assign application roles.';

comment on function public.handle_auth_user_updated() is
  'Deprecated: profile email reconciliation is handled by trusted application service-role code.';

commit;
