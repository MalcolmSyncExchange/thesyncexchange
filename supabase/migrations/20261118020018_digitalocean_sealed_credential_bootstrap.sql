-- One-use installer-only credential creation. No plaintext value is returned,
-- stored in an application table, or embedded in a migration.
begin;
create function submission_media.do_bootstrap_credentials(p_recipient text) returns text language plpgsql security definer set search_path='' as $$
declare password text;sealed bytea;begin
 if p_recipient is null or length(p_recipient)>8192 or encode(extensions.digest(p_recipient,'sha256'),'hex')<>'6355708f23942684df11924f2bae4c3618a3af2e82f2fe67ba5f8defd0ca748f' then raise exception 'SEALED_RECIPIENT_DENIED' using errcode='42501';end if;
 if not exists(select 1 from submission_media.do_control where singleton and not enabled) or not exists(select 1 from pg_roles where rolname='media_broker_do_login' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolinherit and not rolcreaterole) then raise exception 'CREDENTIAL_BOOTSTRAP_CLOSED' using errcode='42501';end if;
 password:=encode(extensions.gen_random_bytes(32),'hex');
 sealed:=extensions.pgp_pub_encrypt(jsonb_build_object('password',password)::text,extensions.dearmor(p_recipient),'cipher-algo=aes256,compress-algo=0');
 perform set_config('password_encryption','scram-sha-256',true);
 execute format('alter role media_broker_do_login login password %L valid until %L',password,clock_timestamp()+interval '30 days');
 return encode(sealed,'base64');
end$$;
revoke all on function submission_media.do_bootstrap_credentials(text) from public,anon,authenticated,service_role,submission_media_broker,media_broker_do_login;
commit;
