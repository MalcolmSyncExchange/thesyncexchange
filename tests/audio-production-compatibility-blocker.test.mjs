import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blankSubmissionDraft, submissionDraftSchema } from '../lib/media/submission-draft.ts';

const evidence = JSON.parse(await readFile(new URL('../docs/audio-reconstruction/production-schema-evidence.json', import.meta.url), 'utf8'));

test('diagnostic: retained production rights contract cannot round-trip through candidate draft validation', () => {
  const save = evidence.functions.find(f => f.schema === 'public' && f.name === 'media_submission_save_draft');
  assert.ok(save);
  assert.match(save.definition, /Reload the updated rights workspace before saving/);
  assert.match(save.definition, /validate_workspace_rights/);
  const structuredFields = ['masterOwners', 'publishingOwners', 'authority', 'hasSamples', 'samples', 'hasClaims', 'claims', 'hasAgreements', 'agreements'];
  for (const field of structuredFields) {
    assert.ok(save.definition.includes(`'${field}'`), `production supports ${field}`);
    // Probe unknown-key rejection, not validity of the field's production value.
    const result = submissionDraftSchema.safeParse({ ...blankSubmissionDraft(), [field]: null });
    assert.equal(result.success, false);
    assert.ok(result.error.issues.some(i => i.code === 'unrecognized_keys' && i.keys.includes(field)), field);
  }
});
