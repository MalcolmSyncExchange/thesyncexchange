-- Founder-authorized monthly allowance. Preserve every reservation and liability.
begin;
lock table submission_media.do_control in exclusive mode;
alter table submission_media.do_control drop constraint do_control_monthly_ceiling_usd_check;
alter table submission_media.do_control add constraint do_control_monthly_ceiling_usd_check
 check (monthly_ceiling_usd in (15,35) or (month='2026-11' and monthly_ceiling_usd=20));
do $$
declare n integer;
begin
 update submission_media.do_control set monthly_ceiling_usd=35
 where singleton and host_id='620470021' and month='2026-11' and monthly_ceiling_usd in (20,35);
 get diagnostics n=row_count;
 if n<>1 then raise exception 'Unexpected DO allowance identity or month';end if;
end $$;
-- Enabled flag, finite expiry, founder scope, boot/images, all usage and holds unchanged.
commit;
