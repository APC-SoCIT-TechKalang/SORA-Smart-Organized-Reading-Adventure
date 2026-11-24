// Isolated PostgreSQL validation; never connects to the live Supabase project.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../work/quest-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const reader = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const sql = async file => db.exec(await readFile(new URL(`../supabase/replacement/${file}`, import.meta.url), 'utf8'));
const scalar = async query => Object.values((await db.query(query)).rows[0])[0];
const as = async id => {
  await db.exec('reset role');
  await db.query("select set_config('test.user',$1,false)", [id]);
  await db.exec('set role authenticated');
};
const scan = (value, copy = 1, session = 1) => db.query('select sora_v2.kiosk_return_book($1,$2,$3)', [session, copy, value]);
const reject = async (action, message) => {
  await db.exec('savepoint rejected_return');
  try { await assert.rejects(action, message); }
  finally { await db.exec('rollback to savepoint rejected_return; release savepoint rejected_return'); }
};
const scenario = async (name, run) => {
  await db.exec('begin');
  try { await run(); console.log(`PASS: ${name}`); }
  finally { await db.exec('rollback; reset role'); }
};

try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('app_metadata',jsonb_build_object('sora_user_id',auth.uid()))$$;`);
  for (const file of ['001_schema.sql','002_access_draft.sql','003_reader_operations_draft.sql','004_staff_operations_draft.sql','011_kiosk_reading.sql','012_library_seat_layout.sql','013_book_shelf_locations.sql','015_reader_three_book_sessions.sql','018_per_book_returns_checkout.sql','019_quest_gamification_existing_schema.sql']) await sql(file);
  const snapshot = () => db.query("select table_name,column_name,data_type,column_default from information_schema.columns where table_schema='sora_v2' order by table_name,ordinal_position");
  const before = (await snapshot()).rows;
  await sql('020_return_books_by_isbn.sql');
  await sql('020_return_books_by_isbn.sql');
  assert.deepEqual((await snapshot()).rows, before, 'No table/column changes; migration can be reapplied');

  await db.query(`insert into sora_v2.users(id,first_name,last_name,username,birthdate,user_role,mobile_number,membership_type,membership_rank,membership_status,membership_expires_at,remaining_minutes)
    values($1,'Reader','One','reader1','2000-01-01','Reader','1','Guild Member','F','ACTIVE',now()+interval '1 day',120),
      ($2,'Reader','Two','reader2','2000-01-01','Reader','2','Guild Member','F','ACTIVE',now()+interval '1 day',120)`, [reader, other]);
  await db.exec(`insert into sora_v2.authors(author_firstname,author_lastname) values('A','Writer');
    insert into sora_v2.books(author_id,title,isbn,book_type,age_rating,book_genre) values
      (1,'Naruto 01','9781569319000','Manga',0,'Fantasy'),
      (1,'ISBN Ten','0-8044-2957-x','Manga',0,'Adventure'),
      (1,'No ISBN',null,'Manga',0,'Fantasy'),
      (1,'Other Book','9781234567890','Manga',0,'Fantasy');
    insert into sora_v2.book_copies(book_id,copy_number,barcode,shelf_location,copy_status) values
      (1,1,'NARUTO-1','Shelf A1','With Reader'),(1,2,'NARUTO-2','Shelf A1','With Reader'),
      (2,1,'MANGA10','Shelf A1','With Reader'),(3,1,'NOISBN','Shelf A1','With Reader'),
      (4,1,'OTHER1','Shelf A1','With Reader'),(1,3,'UNSCANNED','Shelf A1','In-Shelf');`);
  await db.query(`insert into sora_v2.sessions(user_id,copy_id,seat_id,borrow_date)
    values($1,1,1,now()-interval '20 minutes'),($2,5,2,now()-interval '20 minutes')`, [reader, other]);
  await db.query(`insert into sora_v2.session_activity_logs(session_id,user_id,book_id,copy_id,action)
    select 1,$1,book_id,copy_id,'KIOSK_BOOK_SCANNED' from sora_v2.book_copies where copy_id between 1 and 4`, [reader]);

  for (const value of ['9781569319000',' 978-1-56931-900-0 ',' NARUTO-1 ']) {
    await scenario(`return selected copy by ${value.trim()}`, async () => {
      await as(reader); await scan(value);
      assert.equal(await scalar('select copy_status from sora_v2.book_copies where copy_id=1'), 'In Return Cart');
      assert.equal(await scalar('select copy_status from sora_v2.book_copies where copy_id=2'), 'With Reader', 'Sibling copy with the same ISBN stays borrowed');
      assert.equal(await scalar('select session_status from sora_v2.sessions where session_id=1'), 'READING');
      await db.exec('reset role');
      assert.equal(Number(await scalar("select count(*) from sora_v2.session_activity_logs where action='KIOSK_BOOK_RETURNED' and copy_id=1")), 1);
      await as(reader);
      await reject(() => scan(value), /already been returned/);
    });
  }
  await scenario('ISBN-10 with lowercase X and formatting', async () => {
    await as(reader); await scan('080442957X', 3);
    assert.equal(await scalar('select copy_status from sora_v2.book_copies where copy_id=3'), 'In Return Cart');
  });
  await scenario('original book without ISBN still returns by its inventory barcode', async () => {
    await as(reader); await scan('NOISBN', 4);
    assert.equal(await scalar('select copy_status from sora_v2.book_copies where copy_id=4'), 'In Return Cart');
  });
  for (const value of ['9781234567890','NARUTO-2','not-an-isbn','',null]) {
    await scenario(`reject mismatch or empty input: ${value}`, async () => {
      await as(reader);
      await reject(() => scan(value), /does not match|different copy|Scan the book/);
      assert.equal(await scalar('select copy_status from sora_v2.book_copies where copy_id=1'), 'With Reader');
      await db.exec('reset role');
      assert.equal(Number(await scalar("select count(*) from sora_v2.session_activity_logs where action='KIOSK_BOOK_RETURNED'")), 0);
    });
  }
  await scenario('cannot return another reader’s session or an unscanned copy', async () => {
    await as(other); await reject(() => scan('9781569319000'), /Active reading session required/);
    await as(reader); await reject(() => scan('9781569319000',6), /not in your reading session/);
  });
  await scenario('ISBN cannot override an exact barcode assigned to a different copy', async () => {
    await db.exec("update sora_v2.book_copies set barcode='9781569319000' where copy_id=6");
    await as(reader); await reject(() => scan('9781569319000'), /different copy/);
  });
  await scenario('legacy session without scan events returns only its primary copy', async () => {
    await as(other); await scan('9781234567890',5,2);
    assert.equal(await scalar('select copy_status from sora_v2.book_copies where copy_id=5'), 'In Return Cart');
  });
  await scenario('pending checkout and anonymous callers cannot return books', async () => {
    await db.exec("update sora_v2.sessions set session_status='CHECKOUT PENDING' where session_id=1");
    await as(reader); await reject(() => scan('9781569319000'), /Active reading session required/);
    await db.exec('reset role; set role anon');
    await reject(() => scan('9781569319000'), /permission denied/);
  });
  console.log('PASS: migration safety, ISBN/copy matching, selected-copy isolation, ownership, duplicate prevention, and return events with gamification installed');
} finally { await db.close(); }
