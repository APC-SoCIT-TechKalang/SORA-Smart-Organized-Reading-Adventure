import test from "node:test";
import assert from "node:assert/strict";
import { bookImportTemplate, bulkRowError, catalogGenreSummary, cleanBookGenres, expandBookQuantities, fillRepeatedBooks, normalizeBookIsbn, parseBookBatch, validBookIsbn } from "../components/admin/book-batch.ts";

test("bulk CSV accepts quoted fields and repeated ISBN copies", () => {
  const rows = parseBookBatch('isbn,title,author,genre,tags,book_type,age_rating,shelf\n9781646516544,"Blue Lock, Vol. 1",Muneyuki Kaneshiro,Sports,Teamwork,Manga,13,Shelf A2\n9781646516544,,,,,,,Shelf A3');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Blue Lock, Vol. 1");
  assert.equal(bulkRowError(rows[0]), "");
  assert.equal(bulkRowError(fillRepeatedBooks(rows)[1]), "");
});

test("quantity expands into separately registered physical copies", () => {
  const row = parseBookBatch("isbn,title,author,genre,age_rating,quantity,shelf\n9781646516544,Blue Lock,Muneyuki Kaneshiro,Sports,13,3,Shelf A2")[0];
  assert.equal(row.quantity, 3);
  assert.equal(expandBookQuantities([row]).length, 3);
  assert.equal(normalizeBookIsbn("978-1-64651-654-4"), "9781646516544");
  const invalid = parseBookBatch("isbn,title,author,genre,age_rating,quantity,shelf\n9781646516544,Blue Lock,Muneyuki Kaneshiro,Sports,13,many,Shelf A2")[0];
  assert.match(bulkRowError(invalid), /Quantity/);
});

test("downloadable import template remains parseable", () => {
  const rows = parseBookBatch(bookImportTemplate);
  assert.equal(rows.length, 1);
  assert.equal(bulkRowError(rows[0]), "");
});

test("bulk genres fit the catalog column and remove provider artifacts", () => {
  const input = "Wizards, Magic, Graphic novels, collectionid:nyt2020s, Comics, Fantasy, Adventure, Young adult fiction, Friendship, Coming of age, School life";
  assert.deepEqual(cleanBookGenres(input).includes("collectionid:nyt2020s"), false);
  assert.ok(catalogGenreSummary(input).length <= 100);
  assert.match(catalogGenreSummary(input), /^Wizards, Magic/);
});

test("invalid ISBN and missing required fields stop a batch", () => {
  assert.equal(validBookIsbn("9781646516544"), true);
  assert.equal(validBookIsbn("9781646516543"), false);
  assert.equal(validBookIsbn("9781646516544abc"), false);
  const row = parseBookBatch("isbn,title,author,genre,age_rating,shelf\n9781646516544,,Muneyuki Kaneshiro,Sports,13,Shelf A2")[0];
  assert.equal(bulkRowError(row), "Title is required.");
  assert.throws(() => parseBookBatch("title,author\nBook,Writer"), /ISBN column/);
});
