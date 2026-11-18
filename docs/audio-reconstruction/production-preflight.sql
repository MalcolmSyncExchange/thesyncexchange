-- Read-only drift gate; all rows must report matches=true immediately before installation.
WITH expected(signature,digest) AS (VALUES
('submission_media.require_actor(text)','ab00abb3f80ae9b9c5e10949d643cb17'),
('submission_media.require_capability(text)','ac95b8d4c29a8d69337a7b0e8c4d2ea7'),
('submission_media.lock_owned(uuid, bigint)','b7e84dd7f17588e30a9d8c9be437cb5b'),
('submission_media.begin_operation(uuid, text, uuid, jsonb)','fed7a381a8f39ed104c7cf2b497f3c97'),
('submission_media.finish_operation(uuid, jsonb)','d6c2e0cf124f6bc672525155f31b71f7'),
('submission_media.append_event(uuid, text, uuid, uuid, uuid, uuid, text, jsonb)','e30dd187f01d68845e0f6f0668250fdd'),
('submission_media.bump(uuid)','b84091b8ac93071b432861d22076c5f7'),
('submission_media.check_region(uuid, bigint, bigint)','fe1585c25254a11d3115bda622ce08a6'),
('public.media_request_preview(uuid, bigint, uuid)','679421b78033a0f03300f7e9f8594002'),
('submission_media.claim_job()','f8321fcb09bac1b05a1b67b85d4e07cd'),
('submission_media.complete_job(uuid, bigint, uuid, jsonb, text)','392fea4c6d551beb3ea3677f33b015b1')
) SELECT signature, digest, md5(pg_get_functiondef(to_regprocedure(signature))) AS actual, coalesce(md5(pg_get_functiondef(to_regprocedure(signature)))=digest,false) AS matches FROM expected ORDER BY signature;
