import test from 'node:test';
import assert from 'node:assert/strict';
import { inferQuestDifficulty, templateQuestDraft, validateQuestDraft } from '../../../shared/quest-engine.ts';

test('AI quest output is constrained to real catalog inventory and difficulty bounds', () => {
  const inventory = new Map([['Fantasy', 2]]);
  const draft = validateQuestDraft({ targetGenre:'Fantasy', bookCount:99, points:9999, timeLimitDays:99, title:'  Chapter Trial  ' }, 'Easy', inventory);
  assert.equal(draft?.targetValue,2); assert.equal(draft?.points,100); assert.equal(draft?.timeLimitDays,7); assert.equal(draft?.title,'Chapter Trial');
});
test('invalid AI objectives are rejected and template fallback avoids recent genres', () => {
  const inventory = new Map([['Fantasy',4],['Mystery',3],['*',7]]);
  assert.equal(validateQuestDraft({targetGenre:'Nonexistent',bookCount:1},'Easy',inventory),null);
  assert.equal(templateQuestDraft('Medium',inventory,['Fantasy'])?.targetGenre,'Mystery');
  assert.equal(templateQuestDraft('Hard',new Map([['Fantasy',2]]),[]) ,null);
});
test('natural book-count requests infer difficulty and never expose the total inventory marker', () => {
  assert.equal(inferQuestDifficulty('Create a quest about reading 5 magic books'),'Hard');
  assert.equal(inferQuestDifficulty('Make a challenge to read 3 mystery books'),'Medium');
  assert.notEqual(templateQuestDraft('Easy',new Map([['*',10],['Fantasy',2]]),[])?.targetGenre,'*');
});
test('template fallback creates a general quest when available books lack genre metadata', () => {
  const draft=templateQuestDraft('Hard',new Map([['*',4]]),[]);
  assert.equal(draft?.targetGenre,''); assert.equal(draft?.targetValue,4); assert.equal(draft?.title,'Hard Manga Quest');
});
test('quest copy keeps reading inside Tankobonbon and removes take-home language',()=>{
  const draft=validateQuestDraft({targetGenre:'Sports',bookCount:1,title:'Rivalry Rush',description:'Borrow one manga and return it within a week.'},'Easy',new Map([['Sports',2],['*',2]]));
  assert.match(draft?.description??'',/during your library visits/i); assert.doesNotMatch(draft?.description??'',/borrow|within a week/i); assert.match(draft?.requirement??'',/inside Tankobonbon/i);
});
