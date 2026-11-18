-- Correct only the immutable parser identity after the retained Unix input
-- transport ceiling was raised from 50 MB to the approved 150 MB.
-- No admission activation, existing record reset, grant, policy or billing change.
alter table submission_media.do_control drop constraint if exists do_control_worker_digest_check;
alter table submission_media.do_control add constraint do_control_worker_digest_check check(worker_digest in (
 'sha256:c678ad81c316b0e8f56dd9a822e7da80ed7dbee09f8d667e2f5a64e6e64239b0',
 'sha256:d9b0e5d8cc4cebef685cef3cc8d235ebdd2d9c313169addcc33794b23f1d62e1',
 'sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876'
));
alter table submission_media.do_control alter column worker_digest set default 'sha256:37eaf7342bfbcb1917862d0003be87ef96cc22e935765bd2abb11d6fa44f3876';
-- Rollback: stop the broker, select a retained approved image and matching
-- application/launcher/broker release. Keep all reservations, holds and jobs.
