-- Founder-authorized November ceiling only. No admission or ledger reset.
begin;
lock table submission_media.do_control in exclusive mode;
alter table submission_media.do_control drop constraint do_control_monthly_ceiling_usd_check;
alter table submission_media.do_control add constraint do_control_monthly_ceiling_usd_check
 check (monthly_ceiling_usd=15 or (month='2026-11' and monthly_ceiling_usd=20));
update submission_media.do_control set monthly_ceiling_usd=20
 where singleton and host_id='620470021' and month='2026-11' and monthly_ceiling_usd=15;
-- Existing enabled/expiry/owner/identity/accounting and all historical runs stay intact.
commit;
