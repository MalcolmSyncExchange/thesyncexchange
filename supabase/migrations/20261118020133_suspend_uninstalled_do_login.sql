-- Preserve the actual installation history: an encrypted-response extraction
-- failure suspended the unused login before corrected delivery. Fresh installs
-- also remain dormant until the installer-only bootstrap is deliberately called.
begin;
do $$begin if exists(select 1 from submission_media.do_control where singleton and enabled) then raise exception 'ADMISSION_MUST_BE_CLOSED';end if;end$$;
alter role media_broker_do_login nologin;
commit;
