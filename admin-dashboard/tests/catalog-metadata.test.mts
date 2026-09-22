import test from "node:test";
import assert from "node:assert/strict";
import {
  googleAdapter,
  aniListAdapter,
  mergeMetadata,
  openLibraryAdapter,
  parseEditionTitle,
  titleMatches,
  toFormMetadata,
  validIsbn,
} from "../app/api/catalog/lookup/metadata.ts";

test("accepts ISBN-10, ISBN-13, and separators while rejecting bad checksums", () => {
  assert.equal(validIsbn("1-64651-378-9"), true);
  assert.equal(validIsbn("978 1 64651 378 9"), true);
  assert.equal(validIsbn("9781646513780"), false);
});

test("parses an omnibus edition separately from its collected volume range", () => {
  assert.deepEqual(parseEditionTitle("Attack on Titan Omnibus 5 (Vol. 13–15)"), {
    series: "Attack on Titan",
    volume: "5",
    collectedVolumeRange: "13-15",
  });
});

test("parses regular manga volume title patterns", () => {
  assert.deepEqual(parseEditionTitle("Jujutsu Kaisen, Vol. 11"), {
    series: "Jujutsu Kaisen",
    volume: "11",
    collectedVolumeRange: "",
  });
});

test("Open Library partial metadata remains useful and filters marketing subjects", () => {
  const metadata = openLibraryAdapter({
    title: "Attack on Titan Omnibus 5 (Vol. 13-15)",
    author_name: ["諫山創"],
    publisher: ["Kodansha America, Incorporated"],
    isbn: ["1646513789", "9781646513789"],
    subject: ["Fantasy", "New York Times bestseller"],
  }, "9781646513789");
  const form = toFormMetadata(metadata);
  assert.equal(form.series_name, "Attack on Titan");
  assert.equal(form.volume_number, "5");
  assert.equal(form.author, "諫山創");
  assert.equal(form.publisher, "Kodansha America, Incorporated");
  assert.equal(form.genres, "Fantasy");
  assert.equal(form.book_type, "Manga");
  assert.ok(metadata.coverUrls[0].includes("9781646513789"));
});

test("merges complementary sources without replacing primary edition facts", () => {
  const google = googleAdapter({
    title: "Example Manga, Vol. 2",
    authors: ["Primary Author"],
    publisher: "Edition Publisher",
    industryIdentifiers: [{type:"ISBN_13",identifier:"9781646513789"}],
    categories: ["Comics & Graphic Novels"],
    imageLinks: {large:"http://example.com/edition.jpg"},
  }, "9781646513789");
  const open = openLibraryAdapter({
    title: "Wrong fallback title",
    author_name: ["Fallback Author"],
    publisher: ["Fallback Publisher"],
    isbn: ["9781646513789"],
    subject: ["Action"],
  }, "9781646513789");
  const merged = mergeMetadata(google, open);
  assert.equal(merged.title, "Example Manga, Vol. 2");
  assert.equal(merged.publisher, "Edition Publisher");
  assert.deepEqual(merged.genres, ["Comics & Graphic Novels", "Action"]);
  assert.equal(merged.coverUrls[0], "https://example.com/edition.jpg");
});

test("manga enrichment requires an exact normalized series-title match", () => {
  assert.equal(titleMatches("Attack on Titan", ["Attack on Titan", "Shingeki no Kyojin"]), true);
  assert.equal(titleMatches("Attack on Titan", ["Attack on Titan: Before the Fall"]), false);
});

test("AniList separates demographic tags from themes", () => {
  const base = openLibraryAdapter({title:"Example Manga, Vol. 1",isbn:["9781646513789"]}, "9781646513789");
  const enriched = aniListAdapter({
    title:{english:"Example Manga",romaji:"Example Manga",native:"例"},
    format:"MANGA",
    genres:["Action"],
    tags:[{name:"Shounen",rank:80,isMediaSpoiler:false},{name:"Military",rank:75,isMediaSpoiler:false}],
  }, base);
  assert.equal(enriched.demographic, "Shonen");
  assert.deepEqual(enriched.themes, ["Military"]);
});

test("Attack on Titan Omnibus 5 merges edition and manga-series metadata", () => {
  const edition = openLibraryAdapter({
    title:"Attack on Titan Omnibus 5 (Vol. 13-15)",
    author_name:["諫山創"],
    publisher:["Kodansha America, Incorporated"],
    isbn:["1646513789","9781646513789"],
  }, "1646513789");
  const series = aniListAdapter({
    title:{english:"Attack on Titan",romaji:"Shingeki no Kyojin",native:"進撃の巨人"},
    format:"MANGA",
    genres:["Action","Drama","Fantasy","Mystery"],
    tags:[{name:"Shounen",rank:70,isMediaSpoiler:false},{name:"Military",rank:89,isMediaSpoiler:false},{name:"Survival",rank:89,isMediaSpoiler:false}],
    coverImage:{extraLarge:"https://example.com/attack-on-titan.jpg"},
  }, edition);
  const form = toFormMetadata(mergeMetadata(edition, series));
  assert.equal(form.title, "Attack on Titan Omnibus 5 (Vol. 13-15)");
  assert.equal(form.series_name, "Attack on Titan");
  assert.equal(form.volume_number, "5");
  assert.equal(form.original_title, "進撃の巨人");
  assert.equal(form.romanized_title, "Shingeki no Kyojin");
  assert.equal(form.demographic, "Shonen");
  assert.equal(form.themes, "Military, Survival");
  assert.equal(form.book_type, "Manga");
});
