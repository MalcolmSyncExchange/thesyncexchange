-- Additive access-only rollback. Never reset media, jobs, holds or accounting.
begin;
drop function if exists public.media_master_can_play(uuid,uuid);
drop function if exists public.media_master_playback_authorized(uuid,uuid,uuid);
drop function if exists submission_media.master_playback_locator(uuid,uuid,uuid);
commit;
