# Automatic Public Preview — release candidate

Production baseline: `6affdd2a9bef907fc8f9f3e7` / PR #71 (`9d67ed6f`).

## Confirmed diagnosis

Read-only production evidence for the two known founder submissions on November 19, 2026 (Arizona): master validation, waveform and matching AAC jobs succeeded. Both matching AAC assets were ready (49.300–79.300 seconds and 98.900–128.900 seconds respectively). There was no active AAC failure for either inspected recording. The old presentation nevertheless treated AAC generation as a mandatory recording-completion stage, and the review workflow required an additional manual acceptance. These observations do not establish the state of unrelated recordings. No production files, selections, accounting, jobs or worker settings were modified during diagnosis.

## Resulting behavior

Four authoritative recording stages: Uploading → Verifying audio → Generating waveform → Ready. Ready requires the active uploaded master, verified source and matching ready waveform; it is not SEC eligibility. AAC failures and admission pauses remain explicit, with bounded retry or team-contact recovery. AAC processing does not keep the recording timeline animated.

Dragging saves only the exact source-bound region. Continue waits for the selection acknowledgement and a bounded enqueue/reuse request, not decoding or AAC completion, then opens Track Details. Simultaneous progression shares the in-flight request. Existing server locking, asset identity and job uniqueness deduplicate unchanged regions. If validation is unfinished, a source-bound device intent resumes the request when the waveform becomes available, including refresh in the same browser session. The existing default-preview trigger remains in place; this release does not change admission or background-worker authorization. Once queued, job state is server durable. Do not describe a device-only pre-validation intent as an already queued server job.

Final review shows a specific preparing, paused or failed message. Final SEC submission uses the latest selection and generated asset. The migration confirms that private candidate in the same transaction as preparation/submission, preserving ownership, revision, rights, private Storage binding, source/sample/profile matching and review gates. Confirmation never changes `current_preview_id`, activates an asset, marks SEC approval or publishes a track. Direct master-review requests also reject an outdated selected preview. Historical audit/accounting rows are retained.

## Deployment and rollback

Exact main-merge and production SQL approval are required by AGENTS.md. Apply `20261120055242_automatic_public_preview_submission.sql` only after approval, before publishing the candidate application. The SQL patches installed routines without replacing their retained rights checks, owners or ACLs; its new private helper has no client execution grants. Application rollback uses a source revert/build from the approved branch, retaining the stricter database gate and all generated assets. The prior application still supports manual acceptance of an exact matching ready preview. Do not drop history or reopen stale-preview submission to roll back the UI.

No worker installation, new infrastructure, production credentials, payment changes, financial limits, spend-cap changes or Google Cloud recovery activation are included. Production smoke verification should use an existing founder recording, without uploading duplicates or submitting it for review without the intended complete rights details.
