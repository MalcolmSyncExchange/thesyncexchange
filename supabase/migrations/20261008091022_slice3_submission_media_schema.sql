-- Slice 3 A: additive, private and dormant. No legacy rows or hosted buckets change.
begin;
create schema if not exists submission_media;
revoke all on schema submission_media from public, anon, authenticated, service_role;
-- The existing trusted Supabase postgres installer owns definers. No new auth grants.
-- Only the worker broker remains custom: RPC-only, never an application service key.
do $$ begin
  if current_user <> 'postgres' then
    raise exception 'Media foundation requires the verified postgres installer' using errcode='55000';
  end if;
  if exists(select 1 from pg_catalog.pg_roles where rolname='submission_media_executor') then
    raise exception 'Superseded executor role collision: review before installation' using errcode='55000';
  end if;
  if not exists(select 1 from pg_catalog.pg_roles where rolname='submission_media_broker') then
    create role submission_media_broker nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  -- PG17 records implicit creator ADMIN membership with a bootstrap-superuser
  -- grantor. The creator cannot revoke that grant. Permit ONLY this administrative
  -- postgres edge, with neither SET nor INHERIT. postgres already owns these RPCs;
  -- this is not an API/worker runtime privilege or an installer privilege expansion.
  if exists(select 1 from pg_catalog.pg_roles where rolname='submission_media_broker' and
    (rolsuper or rolcanlogin or rolbypassrls or rolcreaterole or rolcreatedb or rolinherit or rolreplication)) or exists
    (select 1 from pg_catalog.pg_auth_members m join pg_catalog.pg_roles g on g.oid=m.grantor where
      m.member='submission_media_broker'::regrole or
      (m.roleid='submission_media_broker'::regrole and not
        (m.member='postgres'::regrole and m.admin_option and not m.inherit_option and not m.set_option and g.rolsuper))) or
    pg_catalog.pg_has_role('anon','submission_media_broker','USAGE') or
    pg_catalog.pg_has_role('anon','submission_media_broker','SET') or
    pg_catalog.pg_has_role('authenticated','submission_media_broker','USAGE') or
    pg_catalog.pg_has_role('authenticated','submission_media_broker','SET') or
    pg_catalog.pg_has_role('service_role','submission_media_broker','USAGE') or
    pg_catalog.pg_has_role('service_role','submission_media_broker','SET') then
    raise exception 'Media broker role collision: separately review existing authority' using errcode='55000';
  end if;
end $$;
grant usage on schema submission_media to submission_media_broker;
alter default privileges in schema submission_media revoke all on tables from public, anon, authenticated, service_role;
alter default privileges in schema submission_media revoke execute on functions from public;

create table if not exists submission_media.capabilities (
  singleton boolean primary key default true check (singleton),
  reservations_enabled boolean not null default false,
  worker_enabled boolean not null default false,
  activation_enabled boolean not null default false,
  foundation_reads_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into submission_media.capabilities(singleton) values(true) on conflict do nothing;

create table if not exists submission_media.submissions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.user_profiles(id) on delete restrict,
  track_id uuid unique references public.tracks(id) on delete restrict,
  revision bigint not null default 0 check (revision >= 0),
  working_master_id uuid,
  accepted_preview_id uuid,
  accepted_artwork_id uuid,
  current_master_id uuid,
  current_preview_id uuid,
  current_artwork_id uuid,
  current_review_id uuid,
  selection_master_id uuid,
  selection_start_ms bigint,
  selection_end_ms bigint,
  selection_revision bigint not null default 0 check (selection_revision >= 0),
  master_kind text not null default 'source_master' check (master_kind = 'source_master'),
  preview_kind text not null default 'buyer_preview' check (preview_kind = 'buyer_preview'),
  artwork_kind text not null default 'artwork' check (artwork_kind = 'artwork'),
  managed_master boolean not null default false,
  managed_preview boolean not null default false,
  managed_artwork boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_saved_at timestamptz not null default now(),
  check ((selection_master_id is null and selection_start_ms is null and selection_end_ms is null) or
    (selection_master_id is not null and selection_start_ms is not null and selection_end_ms is not null and
     selection_start_ms >= 0 and selection_end_ms > selection_start_ms)),
  check (not managed_master or current_master_id is not null),
  check (not managed_preview or current_preview_id is not null),
  check (not managed_artwork or current_artwork_id is not null)
);
create index if not exists submissions_owner_saved on submission_media.submissions(owner_id, last_saved_at desc);

create table if not exists submission_media.operations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references submission_media.submissions(id) on delete restrict,
  actor_id uuid not null references public.user_profiles(id) on delete restrict,
  action text not null check (action in ('create','reserve','select_region','generate_preview','accept_preview','accept_artwork','request_review','decide_review','bind_track','adopt_legacy','retry_job')),
  idempotency_key uuid not null,
  request_hash bytea not null check (octet_length(request_hash) = 32),
  state text not null default 'accepted' check (state in ('accepted','complete','failed')),
  result jsonb not null default '{}' check (jsonb_typeof(result) = 'object' and octet_length(result::text) <= 4096),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(actor_id, action, idempotency_key),
  unique(submission_id, id)
);
create index if not exists operations_submission on submission_media.operations(submission_id, created_at);

create table if not exists submission_media.assets (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submission_media.submissions(id) on delete restrict,
  operation_id uuid not null,
  kind text not null check (kind in ('source_master','buyer_preview','artwork','waveform')),
  origin text not null check (origin in ('upload','generated','legacy_adoption')),
  technical_state text not null default 'reserved' check (technical_state in ('reserved','uploaded','verifying','ready','failed','expired')),
  display_filename text check (char_length(display_filename) between 1 and 255 and display_filename !~ '[[:cntrl:]/\\]'),
  declared_bytes bigint check (declared_bytes > 0),
  bucket text not null check (bucket in ('submission-source','submission-artwork','submission-derived','track-audio')),
  object_path text not null check (char_length(object_path) between 1 and 512 and object_path !~ '(^/|(^|/)\.\.(/|$)|://|[?%#\\])'),
  reservation_expires_at timestamptz not null,
  storage_object_id uuid unique references storage.objects(id) on delete restrict,
  storage_version text check (char_length(storage_version) between 1 and 200),
  storage_bytes bigint check (storage_bytes > 0),
  storage_mime text check (char_length(storage_mime) between 1 and 120),
  sha256 bytea check (octet_length(sha256) = 32),
  container text,
  codec text,
  measured_frames bigint check (measured_frames > 0),
  duration_us bigint check (duration_us between 1000000 and 900000000),
  sample_rate integer check (sample_rate between 8000 and 192000),
  channels integer check (channels between 1 and 2),
  bit_depth integer check (bit_depth in (4,8,12,16,20,24,32,64)),
  image_width integer check (image_width between 256 and 8192),
  image_height integer check (image_height between 256 and 8192),
  source_asset_id uuid,
  source_kind text generated always as (case when source_asset_id is not null then 'source_master' end) stored,
  region_start_ms bigint,
  region_end_ms bigint,
  start_sample bigint,
  end_sample bigint,
  waveform_points integer check (waveform_points between 1 and 90000),
  validator_version text check (char_length(validator_version) between 1 and 100),
  generation_profile text check (char_length(generation_profile) between 1 and 100),
  worker_build_digest text check (worker_build_digest ~ '^sha256:[a-f0-9]{64}$'),
  accepted_by uuid references public.user_profiles(id) on delete restrict,
  accepted_at timestamptz,
  upload_observed_at timestamptz,
  verified_at timestamptz,
  safe_error_code text check (safe_error_code in ('UNSUPPORTED_FORMAT','FILE_TOO_LARGE','AUDIO_UNREADABLE','NO_AUDIO_FRAMES','UNSUPPORTED_AUDIO_CONFIGURATION','UPLOAD_INTERRUPTED','VALIDATION_FAILED','WAVEFORM_GENERATION_FAILED','PREVIEW_GENERATION_FAILED','ARTWORK_INVALID','TEMPORARY_SYSTEM_ERROR')),
  superseded_at timestamptz,
  orphan_candidate_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(submission_id,id),
  unique(submission_id,id,kind),
  unique(bucket,object_path),
  foreign key(submission_id,operation_id) references submission_media.operations(submission_id,id) on delete restrict,
  foreign key(submission_id,source_asset_id,source_kind) references submission_media.assets(submission_id,id,kind) on delete restrict,
  check ((accepted_at is null and accepted_by is null) or (accepted_at is not null and accepted_by is not null and technical_state = 'ready')),
  check ((kind in ('buyer_preview','waveform') and origin = 'generated' and source_asset_id is not null and generation_profile is not null and bucket = 'submission-derived') or
    (kind = 'source_master' and source_asset_id is null and origin in ('upload','legacy_adoption') and
      ((origin = 'upload' and bucket = 'submission-source') or (origin = 'legacy_adoption' and bucket = 'track-audio'))) or
    (kind = 'artwork' and source_asset_id is null and origin = 'upload' and bucket = 'submission-artwork')),
  check (kind <> 'buyer_preview' or (region_start_ms is not null and region_end_ms is not null and start_sample is not null and end_sample is not null and
    region_start_ms >= 0 and region_end_ms > region_start_ms and start_sample >= 0 and end_sample > start_sample)),
  -- Explicit IS NOT NULL prevents CHECK's three-valued logic accepting missing evidence.
  check (technical_state <> 'ready' or (storage_object_id is not null and storage_version is not null and storage_bytes is not null and
    storage_mime is not null and sha256 is not null and validator_version is not null and worker_build_digest is not null and verified_at is not null)),
  check (technical_state <> 'ready' or coalesce(case kind
    when 'source_master' then container in ('wav','aiff','aifc','flac') and codec in ('pcm_s8','pcm_u8','pcm_s16le','pcm_s16be','pcm_s24le','pcm_s24be','pcm_s32le','pcm_s32be','pcm_f32le','pcm_f32be','pcm_f64le','pcm_f64be','flac') and
      ((container='flac' and codec='flac') or (container in ('wav','aiff','aifc') and codec like 'pcm_%')) and
      storage_bytes <= 250000000 and measured_frames is not null and duration_us is not null and sample_rate is not null and channels is not null and bit_depth is not null and
      abs(duration_us::numeric - measured_frames::numeric * 1000000 / sample_rate) <= 1000000::numeric / sample_rate
    when 'buyer_preview' then container = 'm4a' and codec = 'aac_lc' and storage_bytes <= 4000000 and measured_frames is not null and duration_us is not null and sample_rate = 44100 and channels is not null
    when 'artwork' then container in ('jpeg','png','webp') and storage_bytes <= 10000000 and image_width is not null and image_height is not null and
      image_width::bigint * image_height <= 32000000 and image_width <= image_height * 4 and image_height <= image_width * 4
    when 'waveform' then container = 'waveform_minmax_i16_v1' and storage_bytes <= 2000000 and waveform_points is not null
  end,false))
);
create unique index if not exists assets_waveform_profile on submission_media.assets(source_asset_id,generation_profile) where kind = 'waveform';
create unique index if not exists assets_preview_profile on submission_media.assets(source_asset_id,start_sample,end_sample,generation_profile) where kind = 'buyer_preview';
create index if not exists assets_submission_state on submission_media.assets(submission_id,kind,technical_state);
create index if not exists assets_operation on submission_media.assets(operation_id);

-- Composite FKs enforce same-submission AND slot kind without a mutable discriminator.
do $$ declare slot text; k text; begin
  foreach slot in array array['working_master_id','current_master_id','selection_master_id','accepted_preview_id','current_preview_id','accepted_artwork_id','current_artwork_id'] loop
    k := case when slot like '%master%' then 'master_kind' when slot like '%preview%' then 'preview_kind' else 'artwork_kind' end;
    if not exists(select 1 from pg_catalog.pg_constraint where conname = 'submissions_' || slot || '_fk' and conrelid = 'submission_media.submissions'::regclass) then
      execute format('alter table submission_media.submissions add constraint %I foreign key(id,%I,%I) references submission_media.assets(submission_id,id,kind)', 'submissions_'||slot||'_fk',slot,k);
    end if;
  end loop;
end $$;

create table if not exists submission_media.jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null,
  asset_id uuid not null,
  operation_id uuid not null,
  asset_kind text generated always as (case job_type when 'source_validation' then 'source_master' when 'legacy_source_verification' then 'source_master' when 'artwork_validation' then 'artwork' when 'waveform_generation' then 'waveform' when 'preview_generation' then 'buyer_preview' end) stored,
  job_type text not null check (job_type in ('source_validation','artwork_validation','waveform_generation','preview_generation','legacy_source_verification')),
  profile_version text not null check (char_length(profile_version) between 1 and 100),
  state text not null default 'queued' check (state in ('queued','running','retry_wait','succeeded','failed')),
  attempt integer not null default 0 check (attempt >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 5 and attempt <= max_attempts),
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_epoch bigint not null default 0 check (lease_epoch >= 0),
  lease_expires_at timestamptz,
  started_at timestamptz,
  heartbeat_at timestamptz,
  completed_at timestamptz,
  error_code text check (error_code in ('validator_timeout','storage_identity_mismatch','checksum_mismatch','worker_lease_expired','unsupported_format','file_too_large','audio_unreadable','no_audio_frames','unsupported_audio_configuration','waveform_generation_failed','preview_generation_failed','artwork_invalid','temporary_system_error')),
  retryable boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key(submission_id,asset_id) references submission_media.assets(submission_id,id) on delete restrict,
  foreign key(submission_id,operation_id) references submission_media.operations(submission_id,id) on delete restrict,
  foreign key(submission_id,asset_id,asset_kind) references submission_media.assets(submission_id,id,kind),
  check (profile_version = case job_type when 'source_validation' then 'source-validator-v1' when 'legacy_source_verification' then 'source-validator-v1' when 'artwork_validation' then 'artwork-validator-v1' when 'waveform_generation' then 'waveform-minmax-v1' when 'preview_generation' then 'preview-aac-lc-v1' end),
  unique(asset_id,job_type,profile_version),
  check ((state = 'running' and lease_token is not null and lease_expires_at is not null) or (state <> 'running' and lease_token is null and lease_expires_at is null))
);
create index if not exists jobs_claim on submission_media.jobs(available_at,id) where state in ('queued','retry_wait','running');
create index if not exists jobs_submission on submission_media.jobs(submission_id,created_at);
create index if not exists jobs_operation on submission_media.jobs(operation_id);

create table if not exists submission_media.master_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submission_media.submissions(id) on delete restrict,
  operation_id uuid not null,
  expected_current_master_id uuid,
  candidate_master_id uuid not null,
  candidate_preview_id uuid not null,
  master_kind text not null default 'source_master' check (master_kind = 'source_master'),
  preview_kind text not null default 'buyer_preview' check (preview_kind = 'buyer_preview'),
  package_hash bytea not null check (octet_length(package_hash) = 32),
  requested_revision bigint not null check (requested_revision >= 0),
  state text not null default 'pending' check (state in ('pending','approved','rejected')),
  requested_by uuid not null references public.user_profiles(id),
  decided_by uuid references public.user_profiles(id),
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique(submission_id,id),
  foreign key(submission_id,operation_id) references submission_media.operations(submission_id,id),
  foreign key(submission_id,expected_current_master_id,master_kind) references submission_media.assets(submission_id,id,kind),
  foreign key(submission_id,candidate_master_id,master_kind) references submission_media.assets(submission_id,id,kind),
  foreign key(submission_id,candidate_preview_id,preview_kind) references submission_media.assets(submission_id,id,kind),
  check (expected_current_master_id is null or expected_current_master_id <> candidate_master_id),
  check ((state = 'pending' and decided_by is null and decided_at is null) or (state <> 'pending' and decided_by is not null and decided_at is not null))
);
create unique index if not exists reviews_one_pending on submission_media.master_reviews(submission_id) where state = 'pending';
create index if not exists reviews_operation on submission_media.master_reviews(operation_id);
do $$ begin
  if not exists(select 1 from pg_catalog.pg_constraint where conname='submissions_current_review_fk' and conrelid='submission_media.submissions'::regclass) then
    alter table submission_media.submissions add constraint submissions_current_review_fk foreign key(id,current_review_id) references submission_media.master_reviews(submission_id,id);
  end if;
end $$;

create table if not exists submission_media.events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references submission_media.submissions(id),
  asset_id uuid,
  operation_id uuid,
  job_id uuid references submission_media.jobs(id),
  review_id uuid,
  event_type text not null check (event_type in ('checkpoint_created','asset_reserved','upload_observed','validation_started','validation_passed','validation_failed','waveform_generated','region_changed','preview_requested','preview_generated','preview_accepted','artwork_accepted','asset_activated','asset_superseded','master_review_requested','master_review_approved','master_review_rejected','track_bound','legacy_adoption_requested','job_retried')),
  actor_kind text not null check (actor_kind in ('artist','admin','worker')),
  actor_id uuid references public.user_profiles(id),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 2048),
  created_at timestamptz not null default now(),
  foreign key(submission_id,asset_id) references submission_media.assets(submission_id,id),
  foreign key(submission_id,operation_id) references submission_media.operations(submission_id,id),
  foreign key(submission_id,review_id) references submission_media.master_reviews(submission_id,id)
);
create index if not exists events_submission on submission_media.events(submission_id,id);
create index if not exists events_asset on submission_media.events(asset_id,id);
create index if not exists events_operation on submission_media.events(operation_id);

do $$ declare t text; begin
  foreach t in array array['submissions','assets','operations','jobs','master_reviews','events','capabilities'] loop
    execute format('alter table submission_media.%I enable row level security',t);
    execute format('alter table submission_media.%I force row level security',t);
    execute format('revoke all on submission_media.%I from public,anon,authenticated,service_role,submission_media_broker',t);
    execute format('drop policy if exists owner_only on submission_media.%I',t);
    execute format('create policy owner_only on submission_media.%I to postgres using (true) with check (true)',t);
  end loop;
end $$;
-- postgres already has the supported Auth/Storage authority. No existing table or
-- internal schema grants are changed. All API/broker authority is function-only.
commit;
