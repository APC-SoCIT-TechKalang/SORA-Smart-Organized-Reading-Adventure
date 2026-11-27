import assert from 'node:assert/strict';
import test from 'node:test';
import { groupCatalog, matchesCatalogGroup } from '../src/lib/catalog-series.ts';

const book = (id: string, title: string, volume: number, seriesName: string | null = null) => ({
  id, title, volume, seriesName, bookType: 'Manga', author: 'Hiro Mashima', genre: 'Fantasy',
  copies: 1, rating: 0, rarity: 3 as const, chapters: 0, synopsis: '', plate: [title],
  plateColor: '#59351e', plateInk: '#fff9ef',
});

test('groups distinct volumes numerically and keeps standalone books separate', () => {
  const groups = groupCatalog([
    book('10', 'Fairy Tail, Volume 10', 10, 'Fairy Tail'),
    book('1', 'Fairy Tail, Volume 1', 1, 'Fairy Tail'),
    book('2', 'Fairy Tail, Volume 2', 2, 'Fairy Tail'),
    book('20', 'The Solo Story', 0),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].title, 'Fairy Tail');
  assert.deepEqual(groups[0].volumes.map(item => item.id), ['1', '2', '10']);
  assert.equal(groups[1].title, 'The Solo Story');
  assert.equal(groups[0].copies, 3);
  assert.equal(matchesCatalogGroup(groups[0], 'Fairy Tail volume 2'), true);
});

test('does not combine different authors or duplicate volume editions', () => {
  const differentAuthor = { ...book('3', 'Fairy Tail, Volume 3', 3, 'Fairy Tail'), author: 'Another Author' };
  const groups = groupCatalog([book('1', 'Fairy Tail, Volume 1', 1), book('2', 'Fairy Tail, Volume 1', 1), differentAuthor]);
  assert.equal(groups.length, 3);
});

test('uses numbered titles when a volume number is absent from the record', () => {
  const groups = groupCatalog([
    book('12', 'Spy x Family, Vol. 12', 0),
    book('2', 'Spy x Family, Vol. 2', 0),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].volumes.map(item => item.id), ['2', '12']);
  assert.equal(matchesCatalogGroup(groups[0], 'Vol. 12'), true);
});
