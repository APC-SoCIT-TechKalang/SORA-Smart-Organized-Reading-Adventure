// npm install --prefix work/session-history-validation --no-save @electric-sql/pglite
// Runs actual checkout routines in isolated PostgreSQL, never on Supabase.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../work/session-history-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const reader = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const sql = file => db.exec(readFileSync(new URL(`../supabase/replacement/${file}`, import.meta.url), 'utf8'));
const scalar = async query => Object.values((await db.query(query)).rows[0])[0];
const as = async id => {
  await db.exec('reset role');
  await db.query("select set_config('test.user',$1,false)", [id]);
  await db.exec('set role authenticated');
};
const scan = () => scalar("select sora_v2.admin_reader_station_scan('CARD1')");
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('app_metadata',jsonb_build_object('sora_user_id',auth.uid()))$$;`);
  for (const file of ['001_schema.sql', '002_access_draft.sql', '003_reader_operations_draft.sql',
    '004_staff_operations_draft.sql', '011_kiosk_reading.sql', '012_library_seat_layout.sql',
    '015_reader_three_book_sessions.sql', '018_per_book_returns_checkout.sql']) await sql(file);
  // Load the real UID normalization function without unrelated realtime setup.
  const sync = readFileSync(new URL('../supabase/replacement/023_realtime_library_card_sync.sql', import.meta.url), 'utf8');
  await db.exec(sync.match(/create or replace function sora_v2.normalize_rfid_uid[\s\S]*?\$\$;/)[0]);
  for (const file of ['033_admin_reader_station.sql', '034_reader_station_scan_guard.sql',
    '035_automatic_reader_station_scan.sql', '036_session_history_balances.sql']) await sql(file);
  await db.exec(`insert into sora_v2.users(id,first_name,last_name,username,birthdate,user_role,mobile_number,
      membership_type,membership_rank,membership_status,membership_expires_at,remaining_minutes)
    values('${reader}','Reader','One','reader1','2000-01-01','Reader','1','Guild Member','F','ACTIVE',now()+interval '1 day',120),
      ('${staff}','Staff','One','staff1','2000-01-01','Librarian','2',null,null,'INACTIVE',null,0);
    insert into sora_v2.librarycard(user_id,librarycard_rfid) values('${reader}','CARD1');
    insert into sora_v2.authors(author_firstname,author_lastname) values('A','Writer');
    insert into sora_v2.books(author_id,title,book_type,age_rating) values(1,'Book','Manga',0);
    insert into sora_v2.book_copies(book_id,copy_number,barcode) values(1,1,'COPY1');
    insert into sora_v2.session_activity_logs(user_id,action,created_at)
      values('${reader}','CHECKIN_APPROVED',now()-interval '10 minutes');`);
  await as(reader);
  await db.query('select sora_v2.kiosk_reserve_seat(5)');
  await db.query("select sora_v2.kiosk_scan_book('COPY1',5)");
  await db.exec('reset role');
  await db.exec("update sora_v2.sessions set borrow_date=now()-interval '10 minutes'");
  await as(staff);
  await assert.rejects(scan(), /Return every physical book/);
  await as(reader);
  await db.query("select sora_v2.kiosk_return_book(1,1,'COPY1')");
  await as(staff);
  // Reproduce the reported permanent failure with the previous guard.
  await assert.rejects(scan(), /Duplicate scan ignored/);
  await assert.rejects(scan(), /Duplicate scan ignored/);
  assert.equal(await scalar('select session_status from sora_v2.sessions where session_id=1'), 'READING');
  assert.equal(await scalar(`select remaining_minutes from sora_v2.users where id='${reader}'`), 120);
  console.log('Reproduced: checkout repeatedly rolls back after book return.');

  await db.exec('reset role');
  await sql('037_reader_station_checkout_guard_fix.sql');
  await sql('037_reader_station_checkout_guard_fix.sql');
  await db.exec("update sora_v2.sessions set other_charge=50,food_other_charges_payment='UNPAID' where session_id=1");
  await as(staff);
  await assert.rejects(scan(), /Settle the charges/);
  await db.exec('reset role');
  await db.exec("update sora_v2.sessions set food_other_charges_payment='PAID' where session_id=1");
  await db.exec(`insert into sora_v2.session_activity_logs(session_id,user_id,action) values(1,'${reader}','CHECKOUT_DISPUTED')`);
  await as(staff);
  await assert.rejects(scan(), /Resolve the checkout dispute/);
  await db.exec('reset role');
  await db.exec(`insert into sora_v2.session_activity_logs(session_id,user_id,action) values(1,'${reader}','CHECKOUT_DISPUTE_RESOLVED')`);
  await as(staff);
  const result = await scan();
  assert.equal(result.action, 'CHECKOUT');
  await db.exec('reset role');
  assert.equal(await scalar('select session_status from sora_v2.sessions where session_id=1'), 'CLOSED');
  assert.equal(await scalar('select seat_status from sora_v2.seats where seat_number=5'), 'AVAILABLE');
  assert.equal(await scalar('select sora_v2.kiosk_checkin_time(\'' + reader + '\')'), null);
  const balance = await scalar(`select remaining_minutes from sora_v2.users where id='${reader}'`);
  assert.ok(balance >= 109 && balance <= 110);
  assert.equal(await scalar('select remaining_minutes_after from sora_v2.sessions where session_id=1'), balance);
  assert.equal(await scalar("select count(*)::int from sora_v2.session_activity_logs where session_id=1 and action='CHECKOUT_COMPLETED'"), 1);
  await as(staff);
  await assert.rejects(scan(), /Duplicate scan ignored/);
  assert.equal(await scalar(`select remaining_minutes from sora_v2.users where id='${reader}'`), balance);
  console.log('Fixed: checkout closes once, releases seat, ends check-in, debits once, snapshots balance, and blocks repeat tap.');

  // A separate transaction must not reuse the internal paired-event exception.
  await db.exec('reset role');
  await assert.rejects(db.query(`insert into sora_v2.session_activity_logs(session_id,user_id,action)
    values(1,'${reader}','CHECKOUT_COMPLETED')`), /Duplicate scan ignored/);
  await db.exec('reset role');
  await db.exec(`update sora_v2.session_activity_logs set created_at=now()-interval '10 seconds'
    where user_id='${reader}' and action in ('CHECKIN_ENDED','CHECKOUT_COMPLETED');`);
  await as(staff);
  assert.equal((await scan()).action, 'CHECKIN');
  await assert.rejects(scan(), /Duplicate scan ignored/);
  await db.exec('reset role');
  await db.exec(`update sora_v2.session_activity_logs set created_at=now()-interval '10 seconds'
    where user_id='${reader}' and action='CHECKIN_APPROVED';`);
  await as(staff);
  assert.equal((await scan()).action, 'CHECKOUT');
  console.log('Passed: new visit check-in, duplicate protection, and checkout without a book session.');

  // Checkout started by the reader already deducted time. Admin completion
  // must not debit it a second time.
  await db.exec('reset role');
  await db.exec(`update sora_v2.session_activity_logs set created_at=now()-interval '10 seconds' where user_id='${reader}';
    insert into sora_v2.sessions(user_id,copy_id,seat_id,borrow_date,return_date,session_status)
      values('${reader}',1,5,now()-interval '5 minutes',now(),'CHECKOUT PENDING');`);
  const beforePending = await scalar(`select remaining_minutes from sora_v2.users where id='${reader}'`);
  await as(staff);
  assert.equal((await scan()).action, 'CHECKOUT');
  assert.equal(await scalar(`select remaining_minutes from sora_v2.users where id='${reader}'`), beforePending);
  await as(reader);
  await assert.rejects(scan(), /Librarian access required/);
  console.log('Passed: unpaid charges and disputes still block checkout; pending checkout does not debit twice; reader access denied.');
} finally { await db.close(); }
