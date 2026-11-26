import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Run with SORA_PGLITE_MODULE pointing to an installed PGlite dist/index.js.
const modulePath = process.env.SORA_PGLITE_MODULE;
if (!modulePath) throw new Error("Set SORA_PGLITE_MODULE to the local PGlite module path.");
const { PGlite } = await import(pathToFileURL(resolve(modulePath)).href);
const db = new PGlite();
const apply = async name => db.exec(await readFile(new URL(`../supabase/replacement/${name}.sql`, import.meta.url), "utf8"));

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    grant usage on schema auth to authenticated;
    create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as
    $$ select jsonb_build_object('app_metadata', jsonb_build_object('sora_user_id', auth.uid())) $$;
  `);
  for (const migration of [
    "001_schema", "002_access_draft", "013_book_shelf_locations", "014_catalog_edition_metadata",
    "028_admin_catalogue_workspace",
  ]) await apply(migration);

  await db.exec(`
    insert into sora_v2.users(id, first_name, last_name, username, birthdate, user_role, mobile_number) values
      ('10000000-0000-4000-8000-000000000001','Test','Librarian','staff','1990-01-01','Librarian','100'),
      ('10000000-0000-4000-8000-000000000002','Test','Reader','reader','1990-01-01','Reader','101');
    insert into sora_v2.authors(author_id, author_firstname, author_lastname)
      values (1, 'Test', 'Author'), (2, 'Other', 'Author');
    insert into sora_v2.books(book_id, author_id, title, volume_number, series_name, isbn, book_type, age_rating, book_genre)
    select n, case when n = 31 then 2 else 1 end,
      case when n <= 31 then 'Example, Vol. ' || n else 'Standalone ' || lpad(n::text,3,'0') || ' Edition' end,
      case when n <= 31 then n else null end, case when n <= 30 then 'Example' else null end,
      'ISBN-' || n, 'Manga', 0, case when n < 31 then 'Adventure, Action' else 'General' end
    from generate_series(1, 101) n;
    insert into sora_v2.book_copies(book_id, copy_number, barcode, copy_status, shelf_location, condition_notes)
    select b, c, 'COPY-' || b || '-' || c,
      case when b = 100 and c = 100 then 'Damaged' when b = 1 and c = 1 then 'In Return Cart' else 'In-Shelf' end,
      case when b = 100 then 'Shelf A2' else 'Shelf A1' end, case when b = 100 and c >= 99 then 'Scuffed cover' end
    from generate_series(1, 100) b cross join generate_series(1, 100) c;
    insert into sora_v2.seats(seat_id, seat_number, seat_area) values (1,1,'Test');
    insert into sora_v2.sessions(user_id, copy_id, seat_id, return_date, session_status)
      select '10000000-0000-4000-8000-000000000002',copy_id,1,now(),'CLOSED'
      from sora_v2.book_copies where barcode = 'COPY-1-1';
    set role authenticated;
    set test.user_id = '10000000-0000-4000-8000-000000000002';
  `);
  await assert.rejects(db.query("select sora_v2.admin_catalogue_summary()"), /Librarian access required/);
  await assert.rejects(db.query("select sora_v2.admin_catalogue_page('inventory')"), /Librarian access required/);
  await assert.rejects(db.query("select sora_v2.admin_catalogue_volumes('1')"), /Librarian access required/);
  assert.deepEqual((await db.query("select count(*)::integer as count from sora_v2.admin_catalogue_members")).rows, [{ count: 0 }]);
  await db.exec("set test.user_id = '10000000-0000-4000-8000-000000000001'");

  const read = async (sql, params = []) => (await db.query(sql, params)).rows[0].value;
  const page = async (view, named = "", params = []) => read(`select sora_v2.admin_catalogue_page('${view}'${named}) as value`, params);
  const started = performance.now();
  const summary = await read("select sora_v2.admin_catalogue_summary() as value");
  assert.equal(summary.titles, 72);
  assert.equal(summary.volumes, 101);
  assert.equal(summary.copies, 10_000);
  assert.equal(summary.unregistered, 1);
  assert.equal(summary.damaged, 1);
  assert.equal(summary.returns, 1);
  assert.ok(summary.genres.includes("Action"));

  const first = await page("catalog");
  const second = await page("catalog", ", p_page => 2");
  assert.equal(first.count, 72);
  assert.equal(first.rows.length, 25);
  assert.ok(second.rows.every(row => !first.rows.some(previous => previous.id === row.id)));
  const [group] = first.rows;
  assert.equal(group.title, "Example");
  assert.equal(group.volumes, 30);
  assert.equal(group.copies, 3000);
  assert.equal(group.statuses["In Return Cart"], 1);
  assert.deepEqual((await page("catalog", ", p_query => $1", ["ISBN-30"])).rows.map(row => row.id), [group.id]);
  const details = await read("select sora_v2.admin_catalogue_volumes($1) as value", [group.id]);
  assert.deepEqual(details.rows.map(row => row.display_volume), Array.from({ length: 25 }, (_, i) => i + 1));
  assert.equal(details.rows[0].reads, 1);
  assert.equal((await read("select sora_v2.admin_catalogue_volumes($1, 2) as value", [group.id])).rows[0].display_volume, 26);

  const inventory = await page("inventory");
  assert.equal(inventory.count, 10_000);
  const barcode = await page("inventory", ", p_query => $1", ["COPY-100-100"]);
  assert.equal(barcode.count, 1);
  assert.equal(barcode.rows[0].copy_status, "Damaged");
  assert.equal(barcode.rows[0].condition_notes, "Scuffed cover");
  const inShelf = await page("inventory", ", p_condition => 'noted', p_status => 'In-Shelf', p_shelf => 'Shelf A2'");
  assert.equal(inShelf.count, 1);
  assert.equal(inShelf.rows[0].condition_notes, "Scuffed cover");
  assert.equal((await page("attention")).count, 3);
  await db.query("select sora_v2.admin_shelve((select copy_id from sora_v2.book_copies where barcode = 'COPY-1-1'))");
  assert.equal((await page("attention")).count, 2);
  await db.query("select sora_v2.admin_add_located_copy(101, 'Shelf A1', 'NEW-101', 'Good condition')");
  assert.equal((await page("catalog", ", p_registered => 'no'")).count, 0);
  assert.equal((await page("inventory", ", p_query => 'NEW-101'")).count, 1);
  console.log(`Catalog migration passed on a 10,000-copy fixture in ${Math.round(performance.now() - started)} ms (combined assertions).`);
} finally {
  await db.close();
}
