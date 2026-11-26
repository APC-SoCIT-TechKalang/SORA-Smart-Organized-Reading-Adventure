import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogFailure, completeIsbn13, emptyBookMetadata, googleAdapter, isbn13, mergeMangaEnrichment, normalizeIsbn, numericAgeRating, openLibraryAdapter, parseEditionTitle, professionalSynopsis, resolveEditionIdentity, suggestedAgeRating, titleMatches, validIsbn, validateCoverUrl } from '../app/api/catalog/lookup/metadata.ts';

test('validates ISBN-13, ISBN-10, checksum failures, and scanner formatting', () => {
  assert.equal(normalizeIsbn('978-1-64651-654-4\r\n'), '9781646516544');
  assert.equal(validIsbn('9781646516544'), true);
  assert.equal(validIsbn('0-306-40615-2'), true);
  assert.equal(isbn13('0306406152'), '9780306406157');
  assert.equal(validIsbn('9781646516543'), false);
  assert.equal(completeIsbn13('978193565432'), '9781935654322');
  assert.equal(completeIsbn13('9781646516544'), '9781646516544');
  assert.equal(completeIsbn13('0306406152'), '0306406152');
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

test('extracts explicit manga volumes from title, subtitle and structured edition fields', () => {
  const isbn = '9781646516544';
  for (const [title, expected] of [
    ['Fairy Tail, Vol. 1', '1'], ['Black Clover: Volume 3', '3'],
    ['Naruto, Vol. 72', '72'], ['One Piece 104', '104'],
  ]) assert.equal(parseEditionTitle(title).volume, expected, title);
  assert.equal(googleAdapter({ title: 'Fairy Tail', subtitle: 'Volume 1' }, isbn).volume, '1');
  assert.equal(googleAdapter({ title: 'Black Clover', volumeNumber: '3' }, isbn).volume, '3');
  assert.equal(openLibraryAdapter({ title: 'Naruto', series: ['Naruto, Vol. 72'] }, isbn).volume, '72');
  assert.equal(openLibraryAdapter({ title: 'One Piece', subtitle: 'Romance Dawn' }, isbn).volume, '');
  assert.equal(googleAdapter({ title: 'Fairy Tail, Vol. 1', volumeNumber: '2' }, isbn).volume, '');
});

test('uses exact-ISBN English edition title and never guesses a conflicting volume', () => {
  const isbn = '9781646516544';
  const japanese = googleAdapter({ title: 'ブラッククローバー 3' }, isbn);
  const english = openLibraryAdapter({ title: 'Black Clover, Vol. 3' }, isbn);
  const resolved = resolveEditionIdentity(japanese, [english]);
  assert.equal(resolved.metadata.title, 'Black Clover, Vol. 3');
  assert.equal(resolved.metadata.volume, '3');
  assert.equal(resolved.usedEnglishFallback, true);
  const conflict = resolveEditionIdentity(googleAdapter({ title: 'Naruto, Vol. 1' }, isbn), [openLibraryAdapter({ title: 'Naruto, Vol. 2' }, isbn)]);
  assert.equal(conflict.metadata.volume, '');
  assert.equal(conflict.volumeConflict, true);
});

test('matched manga aliases can provide official English series but no unverified volume', () => {
  const isbn = '9781646516544';
  assert.equal(titleMatches('ワンピース', ['ワンピース', 'One Piece']), true);
  const japanese = openLibraryAdapter({ title: 'ワンピース 1' }, isbn);
  const english = resolveEditionIdentity(japanese, [], 'One Piece', 'Wan Piisu');
  assert.equal(english.metadata.title, 'One Piece 1');
  assert.equal(english.metadata.volume, '1');
  const missing = resolveEditionIdentity(openLibraryAdapter({ title: 'ワンピース' }, isbn), [], 'One Piece', 'Wan Piisu');
  assert.equal(missing.metadata.title, 'One Piece');
  assert.equal(missing.metadata.volume, '');
  const romanized = resolveEditionIdentity(openLibraryAdapter({ title: 'Burakku Kuroba 3' }, isbn), [], 'Black Clover', 'Burakku Kuroba');
  assert.equal(romanized.metadata.title, 'Black Clover 3');
  const exactEnglish = resolveEditionIdentity(
    googleAdapter({ title: 'Burakku Kuroba 3' }, isbn),
    [openLibraryAdapter({ title: 'Black Clover, Vol. 3' }, isbn)],
    'Black Clover', 'Burakku Kuroba',
  );
  assert.equal(exactEnglish.metadata.title, 'Black Clover, Vol. 3');
});

test('distinguishes no results, provider failures, and rate limits', () => {
  assert.equal(catalogFailure([{ status: 200, failed: false }], 0)?.status, 404);
  assert.equal(catalogFailure([{ status: 0, failed: true }, { status: 500, failed: true }], 0)?.status, 503);
  assert.equal(catalogFailure([{ status: 429, failed: true }, { status: 200, failed: false }], 0)?.status, 429);
  assert.equal(catalogFailure([{ status: 429, failed: true }], 1), null);
});

test('rejects informal or slang-filled AI synopsis output', () => {
  assert.equal(professionalSynopsis('mr mad guy gets put into a project lmao'), '');
  assert.equal(professionalSynopsis('A young striker enters an intensive program designed to develop Japan’s leading football forward.'), 'A young striker enters an intensive program designed to develop Japan’s leading football forward.');
});

test('removes source credits and award notes from a synopsis', () => {
  assert.equal(professionalSynopsis("A striker joins a training program. (Source: Kodansha USA) Note: Winner of the 45th Kodansha Manga Award in 2021."), "A striker joins a training program.");
});

test('normalizes and conservatively suggests numeric age ratings', () => {
  assert.equal(numericAgeRating('Teen / 13+'), '13');
  assert.equal(numericAgeRating('16 and up'), '16');
  assert.equal(numericAgeRating('Teen'), '');
  const manga = emptyBookMetadata('9781646516544');
  manga.bookType = 'Manga';
  manga.demographic = 'Shonen';
  assert.equal(suggestedAgeRating(manga), '13');
  manga.bookType = 'Adult Manga';
  assert.equal(suggestedAgeRating(manga), '18');
});

test('rejects broken/non-image cover responses and accepts images', async () => {
  const broken = await validateCoverUrl('https://example.test/broken.jpg', async () => new Response('missing', { status: 404, headers: { 'content-type': 'text/html' } }));
  const png = new Uint8Array(512);
  png.set([0x89, 0x50, 0x4e, 0x47], 0);
  new DataView(png.buffer).setUint32(16, 600);
  new DataView(png.buffer).setUint32(20, 900);
  const image = await validateCoverUrl('https://example.test/cover.png', async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
  const placeholder = await validateCoverUrl('https://example.test/no-image-available.png', async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
  const tiny = new Uint8Array(png);
  new DataView(tiny.buffer).setUint32(16, 100);
  new DataView(tiny.buffer).setUint32(20, 100);
  const tinyImage = await validateCoverUrl('https://example.test/tiny.png', async () => new Response(tiny, { status: 200, headers: { 'content-type': 'image/png' } }));
  assert.equal(broken, '');
  assert.equal(image, 'https://example.test/cover.png');
  assert.equal(placeholder, '');
  assert.equal(tinyImage, '');
});

test('manga enrichment cannot overwrite trusted edition facts or cover', () => {
  const trusted = emptyBookMetadata('9781646516544');
  trusted.title = 'Blue Lock 1'; trusted.authors = ['Muneyuki Kaneshiro'];
  trusted.publisher = 'Kodansha Comics'; trusted.coverUrls = ['https://trusted.example/cover.jpg'];
  const manga = emptyBookMetadata('9781646516544');
  manga.title = 'Wrong title'; manga.authors = ['Wrong author']; manga.publisher = 'Wrong publisher';
  manga.coverUrls = ['https://untrusted.example/cover.jpg']; manga.genres = ['Sports']; manga.themes = ['Soccer'];
  manga.description = 'High school strikers enter an intensive program to compete for a place on Japanâ€™s national team.';
  const merged = mergeMangaEnrichment(trusted, manga);
  assert.equal(merged.title, 'Blue Lock 1');
  assert.deepEqual(merged.authors, ['Muneyuki Kaneshiro']);
  assert.equal(merged.publisher, 'Kodansha Comics');
  assert.deepEqual(merged.coverUrls, ['https://trusted.example/cover.jpg']);
  assert.deepEqual(merged.genres, ['Sports']);
  assert.deepEqual(merged.themes, ['Soccer']);
  assert.equal(merged.description, manga.description);
});
