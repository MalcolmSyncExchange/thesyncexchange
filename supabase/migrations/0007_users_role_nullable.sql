alter table public.users
  alter column role drop not null;

comment on column public.users.role is 'Nullable until onboarding role selection is completed. Do not infer buyer or artist without an explicit user choice.';
