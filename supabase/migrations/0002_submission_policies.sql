create policy "Artists can manage rights holders for owned tracks"
on public.rights_holders
for all
using (
  exists(
    select 1
    from public.tracks
    where tracks.id = rights_holders.track_id
      and tracks.artist_user_id = auth.uid()
  )
)
with check (
  exists(
    select 1
    from public.tracks
    where tracks.id = rights_holders.track_id
      and tracks.artist_user_id = auth.uid()
  )
);

create policy "Artists can manage license options for owned tracks"
on public.track_license_options
for all
using (
  exists(
    select 1
    from public.tracks
    where tracks.id = track_license_options.track_id
      and tracks.artist_user_id = auth.uid()
  )
)
with check (
  exists(
    select 1
    from public.tracks
    where tracks.id = track_license_options.track_id
      and tracks.artist_user_id = auth.uid()
  )
);
