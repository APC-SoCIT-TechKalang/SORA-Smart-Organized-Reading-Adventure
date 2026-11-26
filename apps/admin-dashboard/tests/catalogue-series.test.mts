import assert from "node:assert/strict";
import test from "node:test";
import { groupCatalogue, searchCatalogue } from "../components/admin/catalogue-series.ts";
import type { Book } from "../components/admin/dashboard-data.ts";

function book(book_id: number, title: string, overrides: Partial<Book> = {}): Book {
  return {
    book_id, title, author: "Yuto Suzuki", author_firstname: "Yuto", author_lastname: "Suzuki",
    original_title: null, romanized_title: null, isbn: null, volume_number: null,
    publisher: null, publication_date: null, imprint: null, book_type: "Manga",
    description: null, age_rating: 0, demographic: null, themes: null, cover_image_url: null,
    acquisition_status: "IN_LIBRARY", book_genres: [], book_copies: [], ...overrides,
  };
}

test("groups registered series metadata and sorts volumes numerically", () => {
  const groups = groupCatalogue([
    book(1, "Sakamoto Days, Vol. 10", { series_name: "Sakamoto Days" }),
    book(2, "The Store Heist", { series_name: "sakamoto days", volume_number: 2 }),
    book(3, "Sakamoto Days 1", { book_genres: [{ genre: "series:Sakamoto Days, Action" }] }),
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].title.toLowerCase(), "sakamoto days");
  assert.deepEqual(groups[0].volumes.map(volume => volume.book_id), [3, 2, 1]);
});

test("keeps unrelated authors and standalone numbered titles separate", () => {
  const groups = groupCatalogue([
    book(1, "Example 1"), book(2, "Example, Vol. 2"),
    book(3, "Example 3", { author: "Another author" }), book(4, "1984"),
  ]);
  assert.deepEqual(groups.map(group => group.volumes.map(volume => volume.book_id)), [[1, 2], [3], [4]]);
});

test("returns a series when its volume matches and preserves whole-series data", () => {
  const groups = groupCatalogue([
    book(1, "Example, Vol. 1"),
    book(2, "Example, Vol. 2", { isbn: "9780000000000" }),
  ]);
  for (const query of ["Example 2", "vol 2", "9780000000000"]) {
    const [match] = searchCatalogue(groups, query);
    assert.equal(match.volumes.length, 2);
    assert.deepEqual(match.matchingVolumes.map(volume => volume.book_id), [2]);
  }
  assert.equal(searchCatalogue(groups, "Example")[0].matchingVolumes.length, 2);
});
