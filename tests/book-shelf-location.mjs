// npm install --prefix work/shelf-validation --no-save @electric-sql/pglite
// Runs against an isolated PostgreSQL engine; never connects to Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../work/shelf-validation/node_modules/@electric-sql/pglite/dist/index.js';
import { shelfMessage } from '../apps/bonbon-ui-user/src/lib/shelf-location.ts';

for (const [status, location, expected] of [
  ['In-Shelf','Shelf A2','Main Reading Hall — Shelf A2'],
  ['With Reader','Shelf A2','Currently With Reader (Not on shelf)'],
  ['On Hold','Shelf A2','Reserved — Located at the Hold Shelf (Ask Staff)'],
  ['Reserved','Shelf A2','Reserved — Located at the Hold Shelf (Ask Staff)'],
  ['In-Shelf',null,'Shelf location data missing — Please ask library staff for assistance.'],
  ['In-Shelf',' ','Shelf location data missing — Please ask library staff for assistance.'],
  ['In Return Cart','Shelf A2','Return Cart — Awaiting staff inspection (Not on shelf)'],
  ['Damaged','Shelf A2','Damaged — Removed from circulation (Ask Staff)'],
]) assert.equal(shelfMessage({copyId:1,status,shelfLocation:location}),expected);

const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated;`);
  await db.exec(readFileSync(new URL('../supabase/replacement/001_schema.sql',import.meta.url),'utf8'));
  await db.exec(`
    create function sora_v2.is_librarian() returns boolean language sql as $$ select current_setting('test.staff',true) = 'yes' $$;
    create function sora_v2.current_user_id() returns uuid language sql as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;
    set test.staff = 'yes';
    insert into sora_v2.users(id,first_name,last_name,username,birthdate,user_role,mobile_number)
      values ('00000000-0000-4000-8000-000000000001','Test','Staff','staff','2000-01-01','Librarian','1');
  `);
  await db.exec(readFileSync(new URL('../supabase/replacement/004_staff_operations_draft.sql',import.meta.url),'utf8'));
  await db.exec(`select sora_v2.admin_create_book('Legacy','Old','Writer','Manga',13); select sora_v2.admin_add_copy(1,'legacy');`);
  await db.exec(readFileSync(new URL('../supabase/replacement/013_book_shelf_locations.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/replacement/014_catalog_edition_metadata.sql',import.meta.url),'utf8'));
  const scalar = async sql => Object.values((await db.query(sql)).rows[0])[0];
  assert.equal(await scalar('select shelf_location from sora_v2.book_copies where copy_id=1'), null);
  await assert.rejects(db.query(`select sora_v2.admin_add_copy(1,'missing')`), /Assign a Main Reading Hall shelf/);
  await assert.rejects(db.query(`select sora_v2.admin_create_located_book('Bad','A','Writer','Manga',13,'General','9781646516544','Shelf A6','BAD-1')`), /five Main Reading Hall shelves/);
  assert.equal(await scalar(`select count(*)::integer from sora_v2.books`),1,'Invalid shelf rolls back title creation');
  await db.query(`select sora_v2.admin_create_located_book('Blue Lock 1','Muneyuki','Kaneshiro','Manga',13,'Sports','9781646516544','Shelf A2','SORA-BL-001',null,null,'{"series_name":"Blue Lock","metadata_sources":["Open Library"]}'::jsonb,false,'2026-11-24')`);
  await db.query(`select sora_v2.admin_create_located_book('Blue Lock 1','Muneyuki','Kaneshiro','Manga',13,'Sports','9781646516544','Shelf A3','SORA-BL-002')`);
  assert.equal(await scalar(`select count(*)::integer from sora_v2.books`),2);
  const copies = (await db.query(`select * from sora_v2.book_copies where book_id<>1 order by copy_number`)).rows;
  assert.equal(copies.length,2);
  assert.deepEqual(copies.map(c=>[c.barcode,c.copy_status,c.shelf_location]),[
    ['SORA-BL-001','In-Shelf','Shelf A2'],['SORA-BL-002','In-Shelf','Shelf A3'],
  ]);
  assert.equal(await scalar(`select series_name from sora_v2.books where isbn='9781646516544'`),'Blue Lock');
  assert.equal(await scalar(`select count(*)::integer from sora_v2.books where isbn='9781646516544'`),1,'Duplicate ISBN reuses one edition');
  await assert.rejects(db.query(`select sora_v2.admin_create_located_book('Duplicate','A','Writer','Manga',13,'Sports','9781646516544','Shelf A4','SORA-BL-002')`), /duplicate key/);
  await assert.rejects(db.query(`select sora_v2.admin_create_located_book('Bad checksum','A','Writer','Manga',13,'General','9781646516543','Shelf A4','BAD-ISBN')`), /checksum/);
  const id = copies[0].copy_id;
  for (const status of ['On Hold','In Return Cart','Damaged','In-Shelf']) {
    await db.query(`select sora_v2.admin_update_copy_location(${id},'Shelf A4','${status}','Inspected',0)`);
    assert.equal(await scalar(`select shelf_location from sora_v2.book_copies where copy_id=${id}`),'Shelf A4');
  }
  await assert.rejects(db.query(`select sora_v2.admin_update_copy_location(${id},'Shelf A4','With Reader')`), /kiosk scanning/);
  await db.exec(`insert into sora_v2.seats(seat_number,seat_area) values (1,'Center Seating');
    insert into sora_v2.sessions(user_id,copy_id,seat_id) values ('00000000-0000-4000-8000-000000000001',${id},1);
    update sora_v2.book_copies set copy_status='With Reader' where copy_id=${id};`);
  await assert.rejects(db.query(`select sora_v2.admin_update_copy_location(${id},'Shelf A4','Damaged','Torn',50)`), /reading session/);
  await db.exec(`update sora_v2.sessions set return_date=now(),session_status='CHECKOUT PENDING'; update sora_v2.book_copies set copy_status='In Return Cart' where copy_id=${id};`);
  await db.query(`select sora_v2.admin_update_copy_location(${id},'Shelf A4','Damaged','Torn',50)`);
  assert.equal(Number(await scalar(`select other_charge from sora_v2.sessions`)),50);
  await assert.rejects(db.query(`select sora_v2.admin_update_copy_location(${id},'Shelf A4','Damaged','Torn',50)`), /first flagging/);
  await db.exec(`set test.staff='no'`);
  await assert.rejects(db.query(`select sora_v2.admin_update_copy_location(${id},'Shelf A1','In-Shelf')`), /Librarian access/);
  console.log('PASS: UC-08 messages, migration, required shelves, atomic catalog creation, duplicate ISBN copies, status updates, session guards, damage charges and staff authorization.');
} finally { await db.close(); }
