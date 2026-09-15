-- Fixed-window admission shared by all application instances. No application
-- tables or existing authorization policies are changed by this migration.
begin;

create schema if not exists rate_limit_private;
revoke all on schema rate_limit_private from public, anon, authenticated;

create table if not exists rate_limit_private.counters (
  namespace text not null check (namespace in ('tse:production', 'tse:preview', 'tse:local')),
  policy text not null check (policy in (
    'checkout-minute', 'checkout-hour', 'upload-minute', 'upload-day', 'server-upload-minute'
  )),
  subject_key uuid not null,
  window_start timestamptz not null,
  window_end timestamptz not null check (window_end > window_start),
  request_count integer not null default 0 check (request_count >= 0),
  primary key (namespace, subject_key, policy, window_start)
);

create index if not exists rate_limit_counters_expiry_idx
  on rate_limit_private.counters (window_end);
alter table rate_limit_private.counters enable row level security;
revoke all on table rate_limit_private.counters from public, anon, authenticated;

create or replace function public.consume_rate_limit(
  p_namespace text,
  p_operation text,
  p_subject uuid
)
returns table (allowed boolean, remaining integer, retry_after_seconds integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = pg_catalog
set lock_timeout = '2s'
set statement_timeout = '3s'
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_policies text[];
  v_limits integer[];
  v_seconds integer[];
  v_starts timestamptz[] := '{}';
  v_ends timestamptz[] := '{}';
  v_counts integer[] := '{}';
  v_count integer;
  v_i integer;
begin
  -- SECURITY DEFINER must not make this a public quota-admission API.
  if auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_namespace is null or p_namespace not in ('tse:production', 'tse:preview', 'tse:local')
     or p_subject is null then
    raise exception 'Invalid rate limit subject or namespace' using errcode = '22023';
  end if;

  -- Keep shared budgets in the same lock order for every operation. Callers
  -- cannot select limits, window sizes, SQL identifiers, or individual budgets.
  case p_operation
    when 'checkout' then
      v_policies := array['checkout-minute', 'checkout-hour'];
      v_limits := array[5, 30];
      v_seconds := array[60, 3600];
    when 'upload' then
      v_policies := array['upload-minute', 'upload-day'];
      v_limits := array[20, 200];
      v_seconds := array[60, 86400];
    when 'server-upload' then
      v_policies := array['upload-minute', 'upload-day', 'server-upload-minute'];
      v_limits := array[20, 200, 10];
      v_seconds := array[60, 86400, 60];
    else
      raise exception 'Invalid rate limit operation' using errcode = '22023';
  end case;

  allowed := true;
  remaining := 2147483647;
  retry_after_seconds := 0;
  reset_at := null;

  for v_i in 1..array_length(v_policies, 1) loop
    v_starts[v_i] := to_timestamp(floor(extract(epoch from v_now) / v_seconds[v_i]) * v_seconds[v_i]);
    v_ends[v_i] := v_starts[v_i] + make_interval(secs => v_seconds[v_i]);

    insert into rate_limit_private.counters (namespace, policy, subject_key, window_start, window_end)
    values (p_namespace, v_policies[v_i], p_subject, v_starts[v_i], v_ends[v_i])
    on conflict (namespace, subject_key, policy, window_start) do nothing;

    -- The unique key serializes first creation; row locks serialize admission.
    -- All locks are held through the later increments until the RPC commits.
    select c.request_count into strict v_count
    from rate_limit_private.counters c
    where c.namespace = p_namespace and c.subject_key = p_subject
      and c.policy = v_policies[v_i] and c.window_start = v_starts[v_i]
    for update;
    v_counts[v_i] := v_count;

    if v_count >= v_limits[v_i] then
      allowed := false;
      retry_after_seconds := greatest(retry_after_seconds,
        ceil(extract(epoch from (v_ends[v_i] - v_now)))::integer);
      reset_at := greatest(reset_at, v_ends[v_i]);
    end if;
  end loop;

  -- All-or-nothing across budgets: a denied request consumes none of them.
  for v_i in 1..array_length(v_policies, 1) loop
    if allowed then
      update rate_limit_private.counters c set request_count = c.request_count + 1
      where c.namespace = p_namespace and c.subject_key = p_subject
        and c.policy = v_policies[v_i] and c.window_start = v_starts[v_i];
      v_counts[v_i] := v_counts[v_i] + 1;
      reset_at := least(reset_at, v_ends[v_i]);
    end if;
    remaining := least(remaining, greatest(0, v_limits[v_i] - v_counts[v_i]));
  end loop;
  return next;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, uuid) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, uuid) to service_role;

-- Expired rows do not affect admission. Schedule bounded cleanup as a trusted
-- database operator (see docs/rate-limiting.md). Keep at least one day of grace
-- beyond window_end; never remove active windows or run cleanup per request.
commit;
