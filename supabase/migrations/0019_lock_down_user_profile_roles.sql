-- Lock application role changes to trusted server/admin paths.
-- public.user_profiles.role is the canonical authorization source for the app.
-- Normal authenticated users may edit legitimate profile fields, but they may
-- not assign or change their own application role through direct table writes.

begin;

create or replace function public.guard_user_profile_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Service-role operations and verified admins are trusted role-management paths.
  if auth.role() = 'service_role' or public.is_admin() then
    return new;
  end if;

  if auth.uid() is null then
    raise exception 'Authenticated access is required to manage a profile.';
  end if;

  if new.id <> auth.uid() then
    raise exception 'You may only manage your own profile.';
  end if;

  if tg_op = 'INSERT' and new.role is not null then
    raise exception 'Role assignment is managed by trusted server workflows only.';
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    raise exception 'Role changes are managed by trusted server workflows only.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_user_profiles_write on public.user_profiles;
create trigger guard_user_profiles_write
before insert or update on public.user_profiles
for each row execute function public.guard_user_profile_write();

comment on function public.guard_user_profile_write() is
  'Prevents normal authenticated users from assigning or changing application roles. Role changes require service-role execution or a verified admin.';

commit;
