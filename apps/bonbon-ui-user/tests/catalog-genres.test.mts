import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogGenreOptions, matchesCatalogGenre } from '../src/lib/catalog-genres.ts';

test('quick genre choices exclude shelf codes, fragments, and metadata', () => {
  const volumes = [
    { genre: 'Action, Comedy, 741.5/952, Acti, form:graphic novel' },
    { genre: 'action & adventure, Fantasy, Comics & Graphic Novels' },
    { genre: 'F, horror, Romance' },
  ];
  assert.deepEqual(catalogGenreOptions(volumes), ['Action', 'Comedy', 'Fantasy', 'Horror', 'Adventure', 'Romance']);
  assert.equal(matchesCatalogGenre(volumes[1].genre, 'Adventure'), true);
  assert.equal(matchesCatalogGenre(volumes[0].genre, 'Fantasy'), false);
});
