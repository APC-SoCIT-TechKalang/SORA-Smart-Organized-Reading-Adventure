// Isolated PostgreSQL regression test; never connects to Supabase.
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
const checkout = card => db.query('select sora_v2.kiosk_begin_checkout($1) as result', [card]);
const scenario = async (name, action) => {
  await db.exec('begin');
  try { await action(); console.log(`PASS: ${name}`); }
  finally { await db.exec('rollback; reset role'); }
};

try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('app_metadata',jsonb_build_object('sora_user_id',auth.uid()))$$;`);
  for (const file of ['001_schema.sql','002_access_draft.sql','003_reader_operations_draft.sql','004_staff_operations_draft.sql','011_kiosk_reading.sql','012_library_seat_layout.sql','015_reader_three_book_sessions.sql','018_per_book_returns_checkout.sql']) await sql(file);
  await sql('022_checkout_checked_in_reader.sql');
  await sql('022_checkout_checked_in_reader.sql');
  await db.query(`insert into sora_v2.users(id,first_name,last_name,username,birthdate,user_role,mobile_number,membership_type,membership_rank,membership_status,membership_expires_at,remaining_minutes)
    values($1,'Reader','One','reader1','2000-01-01','Reader','1','Guild Member','F','ACTIVE',now()+interval '1 day',120),
      ($2,'Reader','Two','reader2','2000-01-01','Reader','2','Guild Member','F','ACTIVE',now()+interval '1 day',120)`, [reader, other]);
  await db.query("insert into sora_v2.librarycard(user_id,librarycard_rfid) values ($1,'CARD1'),($2,'CARD2')", [reader, other]);
  await db.exec(`insert into sora_v2.authors(author_firstname,author_lastname) values('A','Writer');
    insert into sora_v2.books(author_id,title,isbn,book_type,age_rating) values(1,'Book','9781234567890','Manga',0);
    insert into sora_v2.book_copies(book_id,copy_number,barcode) values(1,1,'COPY1');`);

  await scenario('approved check-in with a seat hold closes without a reading session', async () => {
    await db.query('insert into sora_v2.session_activity_logs(user_id,action) values($1,\'CHECKIN_APPROVED\')', [reader]);
    await as(reader);
    await db.query('select sora_v2.kiosk_reserve_seat(5)');
    assert.equal(await scalar('select count(*)::int from sora_v2.sessions'), 0);
    assert.deepEqual((await checkout('CARD1')).rows[0].result, { checkin_only: true, seat_released: true });
    assert.equal(await scalar('select seat_status from sora_v2.seats where seat_number=5'), 'AVAILABLE');
    await db.exec('reset role');
    assert.equal(await scalar(`select sora_v2.kiosk_checkin_time('${reader}')`), null);
    assert.equal(await scalar(`select remaining_minutes from sora_v2.users where id='${reader}'`), 120);
    assert.equal(await scalar('select count(*)::int from sora_v2.sessions'), 0);
  });
  await scenario('approved check-in without a seat can end', async () => {
    await db.query('insert into sora_v2.session_activity_logs(user_id,action) values($1,\'CHECKIN_APPROVED\')', [reader]);
    await as(reader);
    assert.deepEqual((await checkout('CARD1')).rows[0].result, { checkin_only: true, seat_released: false });
    await db.exec('reset role');
    assert.equal(await scalar(`select sora_v2.kiosk_checkin_time('${reader}')`), null);
  });
  await scenario('a reader with no check-in or session cannot check out', async () => {
    await as(reader);
    await assert.rejects(checkout('CARD1'), /No active check-in or reading session/);
  });
  await scenario('card must belong to reader and an unrelated seat stays occupied', async () => {
    await db.query('insert into sora_v2.session_activity_logs(user_id,action) values($1,\'CHECKIN_APPROVED\'),($2,\'CHECKIN_APPROVED\')', [reader, other]);
    await as(other); await db.query('select sora_v2.kiosk_reserve_seat(6)');
    await as(reader);
    await db.exec('savepoint invalid_card');
    await assert.rejects(checkout('CARD2'), /does not match/);
    await db.exec('rollback to savepoint invalid_card; release savepoint invalid_card');
    assert.deepEqual((await checkout('CARD1')).rows[0].result, { checkin_only: true, seat_released: false });
    assert.equal(await scalar('select seat_status from sora_v2.seats where seat_number=6'), 'OCCUPIED');
  });
  await scenario('reading session still requires book return', async () => {
    await db.query('insert into sora_v2.session_activity_logs(user_id,action) values($1,\'CHECKIN_APPROVED\')', [reader]);
    await as(reader);
    await db.query('select sora_v2.kiosk_reserve_seat(5)');
    await db.query("select sora_v2.kiosk_scan_book('COPY1',5)");
    await db.exec('savepoint borrowed_book');
    await assert.rejects(checkout('CARD1'), /return each book/);
    await db.exec('rollback to savepoint borrowed_book; release savepoint borrowed_book');
    assert.equal(await scalar('select session_status from sora_v2.sessions'), 'READING');
    await db.query("select sora_v2.kiosk_return_book(1,1,'COPY1')");
    const result = (await checkout('CARD1')).rows[0].result;
    assert.equal(result.session_status, 'CHECKOUT PENDING');
    assert.equal(result.checkin_only, undefined);
    assert.equal((await db.query('select sora_v2.kiosk_complete_checkout(1) as result')).rows[0].result.session_id, 1);
    assert.equal(await scalar('select seat_status from sora_v2.seats where seat_number=5'), 'AVAILABLE');
  });
} finally { await db.close(); }
