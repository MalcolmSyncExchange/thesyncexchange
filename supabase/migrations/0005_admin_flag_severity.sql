alter table public.admin_flags
add column if not exists severity text not null default 'medium';

update public.admin_flags
set severity = 'medium'
where severity is null;

alter table public.admin_flags
drop constraint if exists admin_flags_severity_check;

alter table public.admin_flags
add constraint admin_flags_severity_check
check (severity in ('low', 'medium', 'high', 'critical'));

comment on column public.admin_flags.severity is 'Internal moderation severity used to prioritize compliance review queues.';
