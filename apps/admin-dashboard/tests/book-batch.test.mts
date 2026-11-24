import test from "node:test";
import assert from "node:assert/strict";
import { bulkRowError, fillRepeatedBooks, parseBookBatch, validBookIsbn } from "../components/admin/book-batch.ts";

test("bulk CSV accepts quoted fields and repeated ISBN copies", () => {
  const rows = parseBookBatch('isbn,title,author,genre,tags,book_type,age_rating,shelf\n9781646516544,"Blue Lock, Vol. 1",Muneyuki Kaneshiro,Sports,Teamwork,Manga,13,Shelf A2\n9781646516544,,,,,,,Shelf A3');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].title, "Blue Lock, Vol. 1");
  assert.equal(bulkRowError(rows[0]), "");
  assert.equal(bulkRowError(fillRepeatedBooks(rows)[1]), "");
});

test("invalid ISBN and missing required fields stop a batch", () => {
  assert.equal(validBookIsbn("9781646516544"), true);
  assert.equal(validBookIsbn("9781646516543"), false);
  assert.equal(validBookIsbn("9781646516544abc"), false);
  const row = parseBookBatch("isbn,title,author,genre,age_rating,shelf\n9781646516544,,Muneyuki Kaneshiro,Sports,13,Shelf A2")[0];
  assert.equal(bulkRowError(row), "Title is required.");
  assert.throws(() => parseBookBatch("title,author\nBook,Writer"), /ISBN column/);
});
