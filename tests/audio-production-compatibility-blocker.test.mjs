import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { blankSubmissionDraft, submissionDraftSchema } from '../lib/media/submission-draft.ts';

const evidence = JSON.parse(await readFile(new URL('../docs/audio-reconstruction/production-schema-evidence.json', import.meta.url), 'utf8'));

test('restored candidate accepts and preserves every structured production rights field', () => {
  const save = evidence.functions.find(f => f.schema === 'public' && f.name === 'media_submission_save_draft');
  assert.ok(save);
  assert.match(save.definition, /Reload the updated rights workspace before saving/);
  assert.match(save.definition, /validate_workspace_rights/);
  const structuredFields = ['masterOwners', 'publishingOwners', 'authority', 'hasSamples', 'samples', 'hasClaims', 'claims', 'hasAgreements', 'agreements'];
  const draft=blankSubmissionDraft();
  draft.masterOwners=[{name:'Synthetic Owner',percentage:'100'}];
  draft.publishingOwners=[{name:'Synthetic Writer',percentage:'100'}];
  draft.authority.mode='owners';
  const result=submissionDraftSchema.parse(draft);
  for(const field of structuredFields){assert.ok(save.definition.includes(`'${field}'`));assert.deepEqual(result[field],draft[field]);}
  assert.deepEqual(submissionDraftSchema.parse(JSON.parse(JSON.stringify(result))),draft);
});
