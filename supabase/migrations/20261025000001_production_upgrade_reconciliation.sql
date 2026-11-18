-- Forward-only reconciliation of the captured production baseline.
-- Does not arm Gate D, commerce, finance, media, email or analytics capabilities.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $reconcile$
declare definition text; fingerprint text;
begin
  definition:=pg_get_functiondef('public.gate_d_prepare_checkout(uuid,uuid,bigint,text)'::regprocedure);
  fingerprint:=encode(extensions.digest(definition,'sha256'),'hex');
  if fingerprint='9884bffbdb427f93655e3642ca9d071beb91e21ed64c757fda8054a12d264171' then
    -- The exact observed legacy body differs only at these two digest calls.
    definition:=replace(definition,'public.digest(canonical_parameters,','extensions.digest(canonical_parameters,');
    if encode(extensions.digest(definition,'sha256'),'hex')<>'0e43366969458b11143fe62cc71d592791fae8c504c816a9afe533d0359707a3' then
      raise exception 'production_upgrade_replacement_mismatch';
    end if;
    execute definition;
  elsif fingerprint<>'0e43366969458b11143fe62cc71d592791fae8c504c816a9afe533d0359707a3' then
    raise exception 'production_upgrade_function_drift';
  end if;
end $reconcile$;
-- Owner finance remains authenticated/RLS mediated. Trigger execution does not
-- require an API caller to hold direct EXECUTE on its trigger function.
revoke execute on function public.get_own_artist_finance() from service_role;
revoke execute on function public.protect_staging_analytics_validation() from service_role;
commit;
