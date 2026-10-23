-- Read-only SEC capability projection. No capability changes or data writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Invoker uses existing service-role SELECT privileges on the private table.
-- No private schema exposure, ordinary-client access or SECURITY DEFINER bypass.
create function public.get_admin_purchase_capabilities()
returns table (
  foundation_enabled boolean,
  asset_preparation_enabled boolean,
  receipt_generation_enabled boolean,
  entitlement_activation_enabled boolean,
  transaction_projection_enabled boolean,
  payment_adapter_enabled boolean
)
language plpgsql stable security invoker set search_path = '' as $$
begin
  if current_user <> 'service_role' or auth.role() is distinct from 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return query select c.foundation_enabled, c.asset_preparation_enabled,
    c.receipt_generation_enabled, c.entitlement_activation_enabled,
    c.transaction_projection_enabled, c.payment_adapter_enabled
    from commerce_private.capabilities c where c.singleton;
end
$$;
revoke all on function public.get_admin_purchase_capabilities() from public, anon, authenticated;
grant execute on function public.get_admin_purchase_capabilities() to service_role;
commit;
