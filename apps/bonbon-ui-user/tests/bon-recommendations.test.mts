import assert from 'node:assert/strict';
import test from 'node:test';
import { chooseRecommendations, recommendationReason, updateRecommendationState, type BonBook } from '../src/lib/bon-recommendations.ts';

const books: BonBook[] = [
  { id: 'cook-1', title: 'Kitchen Quest, Vol. 1', seriesName: 'Kitchen Quest', author: 'A. Author', genre: 'Comedy', themes: 'Cooking, female protagonist, family, friendship', synopsis: 'A female protagonist cooks with her family in a gentle, funny story.', bookType: 'Manga', volume: 1, availableCopies: 1 },
  { id: 'cook-2', title: 'Kitchen Quest, Vol. 2', seriesName: 'Kitchen Quest', author: 'A. Author', genre: 'Comedy', themes: 'Cooking, female protagonist, family', synopsis: 'The family keeps cooking.', bookType: 'Manga', volume: 2, availableCopies: 0 },
  { id: 'romance', title: 'Summer Letters', author: 'B. Author', genre: 'Romance', themes: 'Sapphic, adult characters, no love triangle', synopsis: 'Two women fall in love as adults.', bookType: 'Light Novel', volume: 1, availableCopies: 1 },
  { id: 'sports', title: 'Team Days', author: 'C. Author', genre: 'Sports', themes: 'Friendship over competition', synopsis: 'A team focuses on friendship.', bookType: 'Manga', volume: 1, availableCopies: 1 },
  { id: 'mystery', title: 'Quiet Case', author: 'D. Author', genre: 'Mystery', themes: 'Short read, little violence', synopsis: 'A gentle detective mystery.', bookType: 'Light Novel', volume: 1, availableCopies: 0 },
  { id: 'fantasy', title: 'Last Spell', author: 'E. Author', genre: 'Fantasy', themes: 'Completed series, clever protagonist', synopsis: 'A clever protagonist solves magical puzzles.', bookType: 'Light Novel', volume: 1, availableCopies: 1 },
];

function ask(query: string, previous?: ReturnType<typeof updateRecommendationState>) {
  const state = updateRecommendationState(query, previous, books.map(book => book.title));
  return { state, result: chooseRecommendations(books, state) };
}

test('combines manga, cooking and verified female protagonist; groups volumes', () => {
  const { result } = ask('I want a manga about cooking with a female main character.');
  assert.equal(result.exact, true);
  assert.deepEqual(result.selected.map(item => item.book.id), ['cook-1']);
});

test('keeps light novels separate and requires evidence for women in love', () => {
  const { result } = ask('I want a light novel about two women falling in love.');
  assert.equal(result.exact, true);
  assert.equal(result.selected[0].book.id, 'romance');
});

test('supports family tone, completed fantasy, mystery content and friendship focus', () => {
  assert.equal(ask('Recommend a funny, low-stakes story about a family.').result.selected[0].book.id, 'cook-1');
  assert.equal(ask('I want a completed fantasy series with a clever main character.').result.selected[0].book.id, 'fantasy');
  assert.equal(ask('Find a short mystery with little violence.').result.selected[0].book.id, 'mystery');
  assert.equal(ask('I want a sports manga that focuses on friendship more than competition.').result.selected[0].book.id, 'sports');
});

test('does not infer protagonist or relationship from a cooking or romance tag', () => {
  const sparse = [{ ...books[0], themes: 'Cooking', synopsis: 'A cooking manga.' }];
  const state = updateRecommendationState('manga about cooking with a female protagonist');
  const result = chooseRecommendations(sparse, state);
  assert.equal(result.exact, false);
  assert.match(recommendationReason(result.selected[0]), /cannot verify female main character/i);
  const romanceState = updateRecommendationState('light novel about two women falling in love');
  assert.equal(chooseRecommendations([{ ...books[2], themes: 'Romance', synopsis: 'A love story.' }], romanceState).exact, false);
});

test('contradiction, misspelling and no matches do not fabricate an answer', () => {
  assert.equal(chooseRecommendations(books, ask('only manga and only light novels').state).selected.length, 0);
  assert.equal(ask('a manga about cookng').result.selected[0].book.id, 'cook-1');
  assert.equal(ask('a manga about submarines').result.exact, false);
});

test('follow-ups retain and change preferences, including reset', () => {
  const first = ask('Find cooking manga');
  const second = ask('Only light novels', first.state);
  assert.equal(second.state.constraints.find(item => item.key === 'format')?.label, 'light novel');
  const third = ask('Make it less dark', second.state);
  assert.ok(third.state.constraints.some(item => item.label === 'lighter tone'));
  const fourth = ask('Remove light novel', third.state);
  assert.equal(fourth.state.constraints.some(item => item.key === 'format'), false);
  assert.equal(ask('reset', third.state).state.constraints.length, 0);
});

test('a liked title and ordinal follow-up keep a catalog reference', () => {
  const liked = updateRecommendationState('I liked Kitchen Quest. What else might I enjoy?', undefined, ['Kitchen Quest']);
  assert.equal(liked.referenceTitle, 'Kitchen Quest');
  const next = updateRecommendationState('Show more like the second one', liked, ['Summer Letters', 'Team Days']);
  assert.equal(next.referenceTitle, 'Team Days');
  assert.equal(next.constraints.some(item => item.key === 'topic:second'), false);
});

test('availability constraints never present an unavailable exact match', () => {
  const { result } = ask('I have only an hour. What available book can I start today?');
  assert.ok(result.selected.every(item => item.book.availableCopies > 0 || !result.exact));
});
