-- IR-ACC-07: actual processor/dispute fees are independent of original gross.
-- Append-only accounting and original principal bounds remain unchanged.
begin;
do $migration$
declare body text;old_text text;
begin
 if current_user<>'postgres' then raise exception 'Verified postgres installer required' using errcode='55000';end if;
 body:=pg_get_functiondef('public.finish_financial_provider_job(uuid,uuid,uuid,jsonb)'::regprocedure);
 if position('adverse_observed' in body)=0 then raise exception 'Authenticated adverse-evidence remediation required';end if;
 old_text:='amount-fee is distinct from (bt->>''net'')::bigint or abs(amount)>b.gross or abs(fee)>b.gross';
 if position(old_text in body)=0 then raise exception 'PK09-R fee contract drift';end if;
 -- Separate principal limits from exact provider cash/expense. Keep the same
 -- safe-integer bound enforced by the SDK adapter and immutable journal lines.
 execute replace(body,old_text,'amount-fee is distinct from (bt->>''net'')::bigint or abs(amount)>b.gross or abs(fee)>9007199254740991 or abs((bt->>''net'')::bigint)>9007199254740991');
end $migration$;
commit;
