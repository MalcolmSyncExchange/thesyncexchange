# Supabase Storage Plan

The canonical bucket/CRUD contract is [Storage security](../docs/security-pr2/storage.md). Follow [deployment preflight](../docs/security-pr2/deployment.md) before live changes.

`storage-policies.sql` and the manual-apply directory are historical evidence. Do not execute them: they restore broad writes that bypass the intended server authorization boundary.

Buckets are created through the approved Storage API setup procedure, with private full audio and agreements. Canonical object policies and immutable-media guards live in forward migrations.
