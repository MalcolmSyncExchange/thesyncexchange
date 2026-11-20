-- Private editorial vocabulary only: never adds marketplace filters or changes rights.
begin;
create table if not exists submission_media.personal_moods(
 owner_id uuid not null references public.user_profiles(id) on delete cascade,
 label text not null check(char_length(label) between 1 and 80),
 normalized text not null check(normalized=lower(label)),
 created_at timestamptz not null default clock_timestamp(),
 primary key(owner_id,normalized)
);
create table if not exists submission_media.personal_mood_limits(owner_id uuid primary key references public.user_profiles(id) on delete cascade,window_start timestamptz not null,operations integer not null check(operations between 1 and 30));
alter table submission_media.personal_mood_limits enable row level security;
revoke all on submission_media.personal_mood_limits from public,anon,authenticated;
alter table submission_media.personal_moods enable row level security;
revoke all on submission_media.personal_moods from public,anon,authenticated;
create or replace function public.media_personal_moods(p_action text default 'list',p_label text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=submission_media.require_actor('artist');mood_label text;result jsonb;
begin
 if p_action not in ('list','save','remove') then raise exception using errcode='22023',message='Invalid mood action';end if;
 if p_action<>'list' then
  if p_label is null or octet_length(p_label)>320 or p_label~'[[:cntrl:]<>/,;:@]' then raise exception using errcode='22023',message='Invalid personal mood';end if;
  mood_label:=initcap(regexp_replace(btrim(normalize(p_label,NFKC)),'[[:space:]]+',' ','g'));
  if char_length(mood_label) not between 1 and 80 or mood_label!~'[[:alnum:]]' or mood_label~'[[:cntrl:]<>/,;:@]' or lower(mood_label)~'(^|[^[:alnum:]])(fuck|shit|cunt|nigger|faggot)([^[:alnum:]]|$)' then raise exception using errcode='22023',message='Invalid personal mood';end if;
  perform pg_advisory_xact_lock(hashtextextended('personal-moods:'||actor::text,0));
  if exists(select 1 from submission_media.personal_mood_limits where owner_id=actor and window_start>clock_timestamp()-interval '1 minute' and operations>=30) then raise exception using errcode='54000',message='Personal mood changes are temporarily limited';end if;
  insert into submission_media.personal_mood_limits values(actor,clock_timestamp(),1) on conflict(owner_id) do update set operations=case when personal_mood_limits.window_start<=clock_timestamp()-interval '1 minute' then 1 else personal_mood_limits.operations+1 end,window_start=case when personal_mood_limits.window_start<=clock_timestamp()-interval '1 minute' then clock_timestamp() else personal_mood_limits.window_start end;
  if p_action='remove' then delete from submission_media.personal_moods where owner_id=actor and normalized=lower(mood_label);
  else
   if not exists(select 1 from submission_media.personal_moods where owner_id=actor and normalized=lower(mood_label)) and (select count(*) from submission_media.personal_moods where owner_id=actor)>=100 then raise exception using errcode='54000',message='Personal mood library is full';end if;
   insert into submission_media.personal_moods(owner_id,label,normalized) values(actor,mood_label,lower(mood_label)) on conflict(owner_id,normalized) do nothing;
  end if;
 end if;
 select coalesce(jsonb_agg(m.label order by m.label),'[]'::jsonb) into result from submission_media.personal_moods m where m.owner_id=actor;
 return result;
end $$;
revoke all on function public.media_personal_moods(text,text) from public,anon;
grant execute on function public.media_personal_moods(text,text) to authenticated;
commit;
