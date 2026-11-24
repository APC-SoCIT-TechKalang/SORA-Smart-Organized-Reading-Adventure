import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogFailure, emptyBookMetadata, isbn13, mergeMangaEnrichment, normalizeIsbn, openLibraryAdapter, validIsbn, validateCoverUrl } from '../app/api/catalog/lookup/metadata.ts';

test('validates ISBN-13, ISBN-10, checksum failures, and scanner formatting', () => {
  assert.equal(normalizeIsbn('978-1-64651-654-4\r\n'), '9781646516544');
  assert.equal(validIsbn('9781646516544'), true);
  assert.equal(validIsbn('0-306-40615-2'), true);
  assert.equal(isbn13('0306406152'), '9780306406157');
  assert.equal(validIsbn('9781646516543'), false);
});

test('adapts the supplied Blue Lock ISBN into trusted catalog fields', () => {
  const metadata = openLibraryAdapter({
    title: 'Blue Lock 1', author_name: ['Muneyuki Kaneshiro', 'Yusuke Nomura'],
    publisher: ['Kodansha Comics'], publish_date: ['2022'], cover_i: 12552345,
    isbn: ['9781646516544', '1646516540'],
  }, '9781646516544');
  assert.equal(metadata.title, 'Blue Lock 1');
  assert.deepEqual(metadata.authors, ['Muneyuki Kaneshiro', 'Yusuke Nomura']);
  assert.equal(metadata.publisher, 'Kodansha Comics');
  assert.equal(metadata.publicationDate, '2022');
  assert.match(metadata.coverUrls[0], /12552345-L\.jpg/);
});

test('distinguishes no results, provider failures, and rate limits', () => {
  assert.equal(catalogFailure([{ status: 200, failed: false }], 0)?.status, 404);
  assert.equal(catalogFailure([{ status: 0, failed: true }, { status: 500, failed: true }], 0)?.status, 503);
  assert.equal(catalogFailure([{ status: 429, failed: true }, { status: 200, failed: false }], 0)?.status, 429);
  assert.equal(catalogFailure([{ status: 429, failed: true }], 1), null);
});

test('rejects broken/non-image cover responses and accepts images', async () => {
  const broken = await validateCoverUrl('https://example.test/broken.jpg', async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } }));
  const image = await validateCoverUrl('https://example.test/cover.jpg', async () => new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'image/jpeg' } }));
  assert.equal(broken, '');
  assert.equal(image, 'https://example.test/cover.jpg');
});

test('manga enrichment cannot overwrite trusted edition facts or cover', () => {
  const trusted = emptyBookMetadata('9781646516544');
  trusted.title = 'Blue Lock 1'; trusted.authors = ['Muneyuki Kaneshiro'];
  trusted.publisher = 'Kodansha Comics'; trusted.coverUrls = ['https://trusted.example/cover.jpg'];
  const manga = emptyBookMetadata('9781646516544');
  manga.title = 'Wrong title'; manga.authors = ['Wrong author']; manga.publisher = 'Wrong publisher';
  manga.coverUrls = ['https://untrusted.example/cover.jpg']; manga.genres = ['Sports']; manga.themes = ['Soccer'];
  const merged = mergeMangaEnrichment(trusted, manga);
  assert.equal(merged.title, 'Blue Lock 1');
  assert.deepEqual(merged.authors, ['Muneyuki Kaneshiro']);
  assert.equal(merged.publisher, 'Kodansha Comics');
  assert.deepEqual(merged.coverUrls, ['https://trusted.example/cover.jpg']);
  assert.deepEqual(merged.genres, ['Sports']);
  assert.deepEqual(merged.themes, ['Soccer']);
});
