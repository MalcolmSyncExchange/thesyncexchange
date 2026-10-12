-- REVIEW ONLY. NOT EXECUTED. Separate founder approval required.
-- Connect directly/session-mode to oppijylbkcbiqfuvckgj as the approved migration role.
-- For psql use -v ON_ERROR_STOP=1; abort and ROLLBACK on any error.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
lock table public.analytics_outbox in access exclusive mode;
do $preflight$
begin
  if (select count(*) from supabase_migrations.schema_migrations) <> 35 then
    raise exception 'Unexpected hosted migration history; stop and review';
  end if;
  if exists (
    select 1 from (values
('20261010055251','0001_initial_schema','49f6193a9f853e4b9f8a50dbd2dc8b38dcfce95854ec2acc0a04324d2829571e'),
('20261010055323','0002_submission_policies','19dc09093a2a24412559c79946eebacd70e16fc472f5067762c649c5ed7ec26e'),
('20261010055327','0003_storage_bucket','acfb6edb0e79263c4553433c022b3d9385d4123a30f38785ec71a491b4c78917'),
('20261010055331','0004_admin_moderation','7bfb71a0079e5d0df2693a92bfc145ac2f6351ff61bd4da62fa74b846f2b266f'),
('20261010055336','0005_admin_flag_severity','41c577e0276719b6610fde1d4e1f0831bd276650196decc5313233548962fa1f'),
('20261010055341','0006_agreements_bucket','3598724c2428f31e0ad422cbfff9c543c1345bc23c582479acc3752e2f92b531'),
('20261010055345','0006_onboarding_status','c2b2394987a866107ad1aa08d5f83ca1855f0f9a7860d8ea6cbd19dc37f1dc8e'),
('20261010055350','0007_users_role_nullable','e3420b4fc2d3eda2ee65af4ea1ff7f9a5b8bf826af62cf356d8a5f35c34c142b'),
('20261010055419','0008_database_foundation','628c0f4781b2fe48e85ba46305edc09b06f5c94958614ac758a6f5e8a95de8ae'),
('20261010055424','0009_order_lifecycle','920822b8cbab00fe32f9f89bc0adb5dbabbacf24b9780341eca24f59c89220f3'),
('20261010055428','0010_order_fulfillment_hardening','8265e4394d0902b12e76f524bf198e6a8c80759f893cc687e3d7d4aefc716a7c'),
('20261010062908','0011_storage_object_policies','88d3e3c6f17d2105f6f27a44ee339e490502048631094e62903805dc089a9c85'),
('20261010063000','0012_avatar_storage_path','01d79714a1b99a6fb79dd0a95fc746d0c3a63c6ef3374bd5ecb5e9602a885c0f'),
('20261010063006','0013_generated_licenses','8041582dfe8fcaef8c8cb67538f375177322708e6fa257ed5ee4e3bc7c2ff7c0'),
('20261010063012','0014_buyer_workspace_settings','41ff2ead2a0ad9dbaad611c47f3a0ff99a18c764c445843e3378c1321a253fe0'),
('20261010063019','0016_rls_recursion_fix','80372268976a58e4887ee6a1bcbd7889eb6b70a053f743a40e37184db82635c1'),
('20261010063024','0017_lock_down_order_writes','17742ec643e3894a37b5f704fcdcc09723f1c288d9d570eb6e2325614d3f4e3b'),
('20261010063041','0018_lock_down_track_moderation_fields','7beb9add69d12e1499317dcfc4855d63cefad813e8ecc81f72d6336b5e7fd31f'),
('20261010063045','0019_lock_down_user_profile_roles','3b689d63492166cf73017019ca29897191e55709578679b9df3ae3ce9dea2e83'),
('20261010063050','0020_remove_auth_profile_role_triggers','1775ed51134eeae13d2564a53e3731b17d3c2ac9d605689826626d76071e5766'),
('20261010063056','0021_rate_limit_foundation','756f51f0a06308b0acff1a6ee2cc0a615e21e981df536630e94c183af6391ec9'),
('20261010063101','20260915224738_reconcile_reviewed_rights_and_storage','f946132c756190c6d3b033db6c2c62ddf3080456e1596996eb918145f769056c'),
('20261010063119','20260915224822_separate_profile_finance_and_buyer_access','4897972b1c27d70e7cdff58a8eabb560ce400177558f8db6d6f95a6f14c99d21'),
('20261010063124','20260915225349_atomic_artist_track_writes','066f8f0bf524c5cba9ae6666400c00c427aadfa0fcc68f99c449b3e30d7c59b2'),
('20261010063128','20260924052925_nonretryable_artist_track_stale_conflict','12c3bdda46969bdca3743ca4e1449b308c330d7b6c37e172a5a16471f2aedb87'),
('20261010063134','20260924171123_preserve_atomic_rights_holder_identity','373b3fb8461101e171fb43fd6a7dd278a880f0d50072782410db52feb22baa28'),
('20261010063139','20261001042359_secure_buyer_catalog_views','c1bd8a145198d44d4e3c6f4afab652c87e1afe974cc81722854d9c4152e844ea'),
('20261010063157','20261002045900_purchase_completion_foundation','dab672f34592462acc119ed3e85ecaf9f595a621e44d6ee41c1a98bd95b347f1'),
('20261010063202','20261002201230_purchase_completion_fulfillment_adapters','94a7551f9dd61dc0c4344399f17a779ac2de8b70f2daec95cbac93a2ef637d1c'),
('20261010063209','20261004023232_gate_d_acceptance_schema','4f4517421e83b1a02f6227753b7e4f7c70118042b696a1b6adbe157310a2ac81'),
('20261010063215','20261004023241_gate_d_acceptance_functions','b3dfbde1e6f2fd90ab9a084fd7e3e37713ccb28a00e36ec6009c75c47875c4cd'),
('20261010152959','20260915072720_analytics_purchase_outbox','3ead2fac00430b5bfa79603fc5b721fdb0dd8f23e9ab7d1ab172ebb0de584e12'),
('20261010153057','20261010060000_analytics_verified_purchase_evidence','3b86b6e7cae163e92857e052fef685b3b84985a3665d7763008db6992760efc3'),
('20261011023627','20261011004710_sec_payment_readiness','6fc3d2714e585f4566068dd371120aeb1323145b23da0b00ca6acb4ab15bcc50'),
('20261011191427','20261011191427_analytics_delivery_reliability','717cf8b444288c3bcaa8a581cf5bf5ccd15effeb1fff57aea01081dc5a81131e')
) expected(version,name,sha256)
    left join supabase_migrations.schema_migrations m on m.version=expected.version
    where m.version is null or m.name is distinct from expected.name
      or encode(extensions.digest(array_to_string(m.statements,E'\n'),'sha256'),'hex') is distinct from expected.sha256
  ) then raise exception 'Hosted migration version/name/checksum divergence'; end if;
end; $preflight$;
do $queue$
begin
  if (select count(*) from public.analytics_outbox) <> 5
     or exists (select 1 from public.analytics_outbox where delivered_at is null or lease_until > now()) then
    raise exception 'Outbox baseline changed; stop without deleting or replaying rows';
  end if;
  if exists (
    select 1 from (values
('035e3594-c5de-4906-853a-774a19f223e9'::uuid,'53b59af9fffa30d3713eacaf8abb0a1d982816a1885691fbae92b8286d478671'),
('2d11b65d-4a4e-45f4-b841-62f5ba034ebf'::uuid,'e409ee93523239a53b2eecddc09bd96c303563a92977b4723caac3e4df996027'),
('56409790-bc42-447d-887b-6e274ea2ecbf'::uuid,'6847da70f8b04af7bcd5a5f2238b6b65e796d30836840fea1bbcdffe9cfeaa15'),
('9f0d215b-c415-4fe5-becf-246fe66102e5'::uuid,'00557ed114be6b2456516877497e95c22d5f5a14de14150ec509848bbf2dafbc'),
('c8c68b8d-454d-4400-8b62-0e718a9a52f5'::uuid,'468e9a77e3c1df2d30fa30eb9639943949393d4546c686643dfb328494609a96')
) expected(id,sha256)
    left join public.analytics_outbox o on o.id=expected.id
    where o.id is null or encode(extensions.digest(((to_jsonb(o) - ARRAY['delivery_status','attempt_count','delivery_cycle','last_attempt_at','next_retry_at','failure_category','occurred_at','delivered_at','lease_until']) || jsonb_build_object('occurred_at',to_char(o.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'delivered_at',to_char(o.delivered_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'lease_until',to_char(o.lease_until at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))::text,'sha256'),'hex') is distinct from expected.sha256
  ) then
    raise exception 'Outbox identity/payload/timestamp fingerprint divergence; renewed verification required';
  end if;
end; $queue$;
do $delivery_state$
begin
  if exists (select 1 from public.analytics_outbox where delivery_status is distinct from 'delivered'
    or attempt_count is distinct from 0 or delivery_cycle is distinct from 0
    or last_attempt_at is not null or next_retry_at is not null or failure_category is not null) then
    raise exception 'Unexpected reliability state; renewed verification required';
  end if;
end; $delivery_state$;
-- SEC source reader: equality environment, non-test/non-internal artist/buyer
-- cohort, half-open occurred_at range, ORDER BY occurred_at,id, LIMIT 500.
-- The pending-only index omits delivered evidence. This partial index covers
-- every delivery state in the reporting cohort and supports stable pagination.
-- No payload INCLUDE: properties are comparatively large and not search keys.
-- Delivery/retry queries retain analytics_outbox_delivery_due from reliability.
create index if not exists analytics_outbox_reporting_time_id
  on public.analytics_outbox (environment, occurred_at, id)
  where is_test = false and is_internal = false and actor_role in ('artist','buyer');

-- Record the exact original file bytes, preserving the reviewed source checksum.
-- Existing timestamp mappings remain unchanged. New canonical version is unused.
insert into supabase_migrations.schema_migrations(version,name,statements)
values ('20261011210517','20261011210517_analytics_reporting_index',array[$original_sql$-- SEC source reader: equality environment, non-test/non-internal artist/buyer
-- cohort, half-open occurred_at range, ORDER BY occurred_at,id, LIMIT 500.
-- The pending-only index omits delivered evidence. This partial index covers
-- every delivery state in the reporting cohort and supports stable pagination.
-- No payload INCLUDE: properties are comparatively large and not search keys.
-- Delivery/retry queries retain analytics_outbox_delivery_due from reliability.
create index if not exists analytics_outbox_reporting_time_id
  on public.analytics_outbox (environment, occurred_at, id)
  where is_test = false and is_internal = false and actor_role in ('artist','buyer');
$original_sql$]);
commit;
