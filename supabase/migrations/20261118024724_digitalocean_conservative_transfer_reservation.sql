-- Increase future reservations only; preserve earlier ledgers and the15USD ceiling.
begin;
alter table submission_media.do_runs drop constraint do_runs_reserved_usd_check;
alter table submission_media.do_runs add constraint do_runs_reserved_usd_check check(reserved_usd in (.03,.10));
alter table submission_media.do_runs alter column reserved_usd set default .10;
create or replace function submission_media.do_admit(p_operation uuid,p_boot uuid,p_digest text) returns jsonb language plpgsql security definer set search_path='' as $$declare c submission_media.do_control;r submission_media.do_runs;j submission_media.jobs;input submission_media.assets;permit jsonb;projection numeric;begin
 perform pg_advisory_xact_lock(731003,4);c:=submission_media.do_require(p_boot);
 if p_operation is null or p_digest is distinct from c.worker_digest then raise exception 'DO_IDENTITY_DENIED' using errcode='42501';end if;
 select * into r from submission_media.do_runs where state='issued' or id=p_operation order by created_at limit 1;
 if found then return jsonb_build_object('state',r.state,'run_id',r.id,'recovery',true);end if;
 projection:=c.fixed_reserve_usd+c.carry_forward_usd+coalesce((select sum(reserved_usd) from submission_media.do_runs where month=c.month),0)+c.traffic_bytes::numeric/1000000000*.09+c.log_bytes::numeric/1073741824*.5+.10;
 if projection>c.monthly_ceiling_usd then return jsonb_build_object('state','budget_limit');end if;
 -- Historical jobs are not eligible. Canonical owner and new-job cutoff
 -- are installer controlled, never taken from worker request bodies.
 select x.* into j from submission_media.jobs x join submission_media.submissions s on s.id=x.submission_id
 where s.owner_id=c.allowed_owner and x.created_at>=c.jobs_after and x.state in ('queued','retry_wait') and x.available_at<=clock_timestamp() and x.attempt<least(x.max_attempts,3)
 and x.job_type in ('source_validation','waveform_generation','preview_generation','artwork_validation')
 order by x.available_at,x.id for update of x skip locked limit 1;
 if not found then return jsonb_build_object('state','idle');end if;
 select * into input from submission_media.assets where id=coalesce((select source_asset_id from submission_media.assets where id=j.asset_id),j.asset_id);
 if input.storage_bytes is null or input.storage_bytes<1 or input.storage_bytes>50000000 then return jsonb_build_object('state','input_limit');end if;
 permit:=submission_media.create_execution_permit(j.id,j.asset_id,j.job_type,j.profile_version,j.state,j.attempt,p_operation,c.host_id);
 perform submission_media.request_execution((permit->>'permit_id')::uuid,c.host_id);
 perform submission_media.bind_execution((permit->>'permit_id')::uuid,c.host_id,'digitalocean/nyc3/droplets/'||c.host_id||'/boots/'||p_boot||'/executions/'||p_operation);
 insert into submission_media.do_runs(id,permit_id,job_id,boot_id,worker_digest,month) values(p_operation,(permit->>'permit_id')::uuid,j.id,p_boot,p_digest,c.month);
 insert into submission_media.do_audit(run_id,kind,cost_usd) values(p_operation,'reserved',.10);
 return jsonb_build_object('state','issued','run_id',p_operation,'job_id',j.id,'recovery',false);end$$;

commit;
