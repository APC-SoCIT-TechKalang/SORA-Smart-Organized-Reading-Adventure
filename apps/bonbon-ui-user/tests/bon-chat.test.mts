import assert from 'node:assert/strict';
import test from 'node:test';
import { detectIntent, parseBody, recommendationScore, wantsRecommendation } from '../api/bon-chat.ts';

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

test('a relevant unavailable horror title can outrank an unrelated available title', () => {
  const horror = { id: 'jjk-0', title: 'Jujutsu Kaisen 0', author: 'Gege Akutami', genre: 'Horror, Supernatural', synopsis: 'A dark curse story with dangerous spirits.', availableCopies: 0 };
  const adventure = { id: 'one-piece', title: 'One Piece 1', author: 'Eiichiro Oda', genre: 'Adventure', synopsis: 'A bright pirate adventure.', availableCopies: 1 };
  assert.ok(recommendationScore(horror, 'Something darker', [], []) > recommendationScore(adventure, 'Something darker', [], []));
});
