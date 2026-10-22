-- SOURCE ONLY. No Storage DDL, capabilities, data backfill or worker activation.
begin;
alter table submission_media.jobs add column if not exists output_object_id uuid references storage.objects(id);
alter table submission_media.jobs add column if not exists output_version text;
alter table submission_media.jobs add column if not exists output_sha256 bytea;
alter table submission_media.jobs add column if not exists output_bytes bigint;
alter table submission_media.jobs add column if not exists output_lease_epoch bigint;
do $$ begin if not exists(select 1 from pg_catalog.pg_constraint where conrelid='submission_media.jobs'::regclass and conname='jobs_output_evidence') then
  alter table submission_media.jobs add constraint jobs_output_evidence check (
    (output_object_id is null and output_version is null and output_sha256 is null and output_bytes is null and output_lease_epoch is null) or
    (job_type in ('waveform_generation','preview_generation') and output_object_id is not null and output_version is not null and output_sha256 is not null and output_bytes is not null and output_lease_epoch is not null and length(output_version) between 1 and 128 and
     octet_length(output_sha256)=32 and output_bytes between 1 and 4000000 and output_lease_epoch between 1 and lease_epoch));
end if; end $$;
create or replace function submission_media.resolve_worker_io(p_job uuid,p_epoch bigint,p_token uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare j submission_media.jobs; a submission_media.assets; m submission_media.assets; o storage.objects; src storage.objects; begin
  perform submission_media.require_capability('worker');
  select * into j from submission_media.jobs where id=p_job for update;
  if not found or j.state<>'running' or p_epoch is null or p_token is null or j.lease_epoch<>p_epoch
    or j.lease_token<>p_token or j.lease_expires_at<=clock_timestamp() then
    raise exception 'Stale worker lease' using errcode='40001';
  end if;
  select * into a from submission_media.assets where id=j.asset_id;
  if a.submission_id<>j.submission_id or a.technical_state<>'verifying' or a.kind<>(case j.job_type
    when 'source_validation' then 'source_master' when 'legacy_source_verification' then 'source_master'
    when 'artwork_validation' then 'artwork' when 'waveform_generation' then 'waveform' when 'preview_generation' then 'buyer_preview' else '' end) or
    j.profile_version<>(case j.job_type when 'source_validation' then 'source-validator-v1'
    when 'legacy_source_verification' then 'source-validator-v1' when 'artwork_validation' then 'artwork-validator-v1'
    when 'waveform_generation' then 'waveform-minmax-v1' when 'preview_generation' then 'preview-aac-lc-v1' else '' end) then
    raise exception 'Invalid trusted job' using errcode='42501';
  end if;
  if j.job_type in ('source_validation','legacy_source_verification','artwork_validation') then
    select * into o from storage.objects where id=a.storage_object_id and version=a.storage_version
      and bucket_id=a.bucket and name=a.object_path;
    if not found or (o.metadata->>'size')::bigint is distinct from a.storage_bytes then
      raise exception 'Storage identity mismatch' using errcode='22023';
    end if;
  else
    select * into m from submission_media.assets where id=a.source_asset_id and submission_id=a.submission_id
      and kind='source_master' and technical_state='ready';
    if not found or a.generation_profile<>j.profile_version or a.bucket<>'submission-derived' then
      raise exception 'Invalid source provenance' using errcode='42501';
    end if;
    select * into src from storage.objects where id=m.storage_object_id and version=m.storage_version
      and bucket_id=m.bucket and name=m.object_path;
    if not found or (src.metadata->>'size')::bigint is distinct from m.storage_bytes then
      raise exception 'Storage identity mismatch' using errcode='22023';
    end if;
  end if;
  return jsonb_build_object('job_id',j.id,'asset_id',a.id,'operation_id',j.operation_id,'submission_id',a.submission_id,
    'lease_epoch',j.lease_epoch,'lease_token',j.lease_token,'job_type',j.job_type,'profile',j.profile_version,
    'bucket',a.bucket,'path',a.object_path,'object_id',a.storage_object_id,'version',a.storage_version,
    'bytes',a.storage_bytes,'sha256',encode(a.sha256,'hex'),
    'max_bytes',case a.kind when 'waveform' then 2000000 when 'buyer_preview' then 4000000 when 'artwork' then 10000000 else 250000000 end,
    'region_start_ms',a.region_start_ms,'region_end_ms',a.region_end_ms,'start_sample',a.start_sample,'end_sample',a.end_sample,
    'output',case when j.output_object_id is null then null else jsonb_build_object('object_id',j.output_object_id,'version',j.output_version,
      'sha256',encode(j.output_sha256,'hex'),'bytes',j.output_bytes,'lease_epoch',j.output_lease_epoch) end,
    'source',case when m.id is null then null else jsonb_build_object('asset_id',m.id,'object_id',m.storage_object_id,
      'version',m.storage_version,'bucket',m.bucket,'path',m.object_path,'bytes',m.storage_bytes,'sha256',encode(m.sha256,'hex'),
      'container',m.container,'codec',m.codec,'frames',m.measured_frames,'duration_us',m.duration_us,'sample_rate',m.sample_rate,'channels',m.channels,'bit_depth',m.bit_depth) end);
end $$;
create or replace function submission_media.record_worker_output(p_job uuid,p_epoch bigint,p_token uuid,p_object uuid,p_version text,p_sha256 text,p_bytes bigint)
returns void language plpgsql security definer set search_path='' as $$
declare facts jsonb; j submission_media.jobs; obj storage.objects; begin
  facts:=submission_media.resolve_worker_io(p_job,p_epoch,p_token);
  if facts->>'job_type' not in ('waveform_generation','preview_generation') or p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_bytes is null or p_bytes<1 or p_bytes>(facts->>'max_bytes')::bigint then
    raise exception 'Invalid bounded output evidence' using errcode='22023';
  end if;
  select * into obj from storage.objects where id=p_object and version=p_version
    and bucket_id=facts->>'bucket' and name=facts->>'path';
  if not found or (obj.metadata->>'size')::bigint is distinct from p_bytes then
    raise exception 'Storage identity mismatch' using errcode='22023';
  end if;
  select * into j from submission_media.jobs where id=p_job;
  if j.output_object_id is not null and (j.output_object_id,j.output_version,j.output_sha256,j.output_bytes)
    is distinct from (p_object,p_version,decode(p_sha256,'hex'),p_bytes) then
    raise exception 'Immutable derivative evidence' using errcode='42501';
  end if;
  update submission_media.jobs set output_object_id=p_object,output_version=p_version,output_sha256=decode(p_sha256,'hex'),
    output_bytes=p_bytes,output_lease_epoch=p_epoch where id=p_job;
end $$;
create or replace function submission_media.guard_worker_output_completion() returns trigger
language plpgsql security definer set search_path='' as $$
declare a submission_media.assets; begin
  if new.state='succeeded' and old.state<>'succeeded' and new.job_type in ('waveform_generation','preview_generation') then
    select * into a from submission_media.assets where id=new.asset_id;
    if new.output_object_id is null or new.output_lease_epoch<>old.lease_epoch or
      (a.storage_object_id,a.storage_version,a.sha256,a.storage_bytes) is distinct from
      (new.output_object_id,new.output_version,new.output_sha256,new.output_bytes) then
      raise exception 'Fenced derivative evidence required' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_worker_output_completion on submission_media.jobs;
create trigger guard_worker_output_completion before update on submission_media.jobs for each row execute function submission_media.guard_worker_output_completion();
alter function submission_media.resolve_worker_io(uuid,bigint,uuid) owner to postgres;
alter function submission_media.record_worker_output(uuid,bigint,uuid,uuid,text,text,bigint) owner to postgres;
alter function submission_media.guard_worker_output_completion() owner to postgres;
revoke all on function submission_media.resolve_worker_io(uuid,bigint,uuid) from public,anon,authenticated,service_role;
revoke all on function submission_media.record_worker_output(uuid,bigint,uuid,uuid,text,text,bigint),submission_media.guard_worker_output_completion() from public,anon,authenticated,service_role;
grant execute on function submission_media.resolve_worker_io(uuid,bigint,uuid) to submission_media_broker;
grant execute on function submission_media.record_worker_output(uuid,bigint,uuid,uuid,text,text,bigint) to submission_media_broker;
comment on function submission_media.resolve_worker_io(uuid,bigint,uuid) is
  'Broker only: hold transaction/job row lock through bounded output commit; recheck after write. No bytes/credentials or publication authority.';
commit;
