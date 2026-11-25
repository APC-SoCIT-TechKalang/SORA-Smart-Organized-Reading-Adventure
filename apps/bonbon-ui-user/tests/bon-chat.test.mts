import assert from 'node:assert/strict';
import test from 'node:test';
import { detectIntent, parseBody, wantsRecommendation } from '../api/bon-chat.ts';

const catalog = [
  { id: 'blue-lock', title: 'Blue Lock 1', author: 'Muneyuki Kaneshiro', genre: 'Action, Drama, Sports', synopsis: 'A fierce football competition.', availableCopies: 1 },
];

for (const phrase of [
  'how about some action type of book?',
  'can you recommen me an action genre book',
  'I mean action',
]) {
  test(`routes natural recommendation wording: ${phrase}`, () => {
    assert.equal(detectIntent(phrase), 'BOOK');
    const parsed = parseBody({ message: phrase, history: [], context: { section: 'catalog', catalog } });
    assert.ok(parsed);
    assert.equal(wantsRecommendation(parsed), true);
  });
}

test('uses recent book conversation to understand a short follow-up', () => {
  const parsed = parseBody({
    message: 'more intense please',
    history: [{ role: 'assistant', content: 'Which manga genre would you like?' }],
    context: { section: 'catalog', catalog },
  });
  assert.ok(parsed);
  assert.equal(parsed.intent, 'BOOK');
});
