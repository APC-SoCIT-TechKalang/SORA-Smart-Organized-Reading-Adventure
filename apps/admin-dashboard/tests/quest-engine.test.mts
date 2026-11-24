import test from 'node:test';
import assert from 'node:assert/strict';
import { templateQuestDraft, validateQuestDraft } from '../../../shared/quest-engine.ts';

test('AI quest output is constrained to real catalog inventory and difficulty bounds', () => {
  const inventory = new Map([['Fantasy', 2]]);
  const draft = validateQuestDraft({ targetGenre:'Fantasy', bookCount:99, points:9999, timeLimitDays:99, title:'  Chapter Trial  ' }, 'Easy', inventory);
  assert.equal(draft?.targetValue,2); assert.equal(draft?.points,100); assert.equal(draft?.timeLimitDays,7); assert.equal(draft?.title,'Chapter Trial');
});
test('invalid AI objectives are rejected and template fallback avoids recent genres', () => {
  const inventory = new Map([['Fantasy',4],['Mystery',3]]);
  assert.equal(validateQuestDraft({targetGenre:'Nonexistent',bookCount:1},'Easy',inventory),null);
  assert.equal(templateQuestDraft('Medium',inventory,['Fantasy'])?.targetGenre,'Mystery');
  assert.equal(templateQuestDraft('Hard',new Map([['Fantasy',2]]),[]) ,null);
});
