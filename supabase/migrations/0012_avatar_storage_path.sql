alter table public.user_profiles
  add column if not exists avatar_path text;

comment on column public.user_profiles.avatar_path is 'Storage object path for the user avatar when the image is hosted in the Supabase avatars bucket.';
