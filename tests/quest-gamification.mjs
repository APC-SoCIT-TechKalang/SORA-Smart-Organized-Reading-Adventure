// npm.cmd install --prefix work/quest-validation --no-save --package-lock=false @electric-sql/pglite
// Isolated PostgreSQL validation; never connects to Supabase.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '../work/quest-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const reader = '00000000-0000-4000-8000-000000000001';
const staff = '00000000-0000-4000-8000-000000000002';
const sql = async file => db.exec(await readFile(new URL(`../supabase/replacement/${file}`, import.meta.url), 'utf8'));
const scalar = async query => Object.values((await db.query(query)).rows[0])[0];
const as = async id => { await db.exec('reset role'); await db.query("select set_config('test.user',$1,false)",[id]); await db.exec('set role authenticated'); };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create function auth.uid() returns uuid language sql as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select jsonb_build_object('app_metadata',jsonb_build_object('sora_user_id',auth.uid()))$$;`);
  for (const file of ['001_schema.sql','002_access_draft.sql','003_reader_operations_draft.sql','004_staff_operations_draft.sql','011_kiosk_reading.sql','012_library_seat_layout.sql','013_book_shelf_locations.sql','015_reader_three_book_sessions.sql','018_per_book_returns_checkout.sql']) await sql(file);
  const tablesBefore=(await db.query("select table_name from information_schema.tables where table_schema='sora_v2' order by table_name")).rows;
  const columnsBefore=(await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='sora_v2' order by table_name,ordinal_position")).rows;
  await sql('019_quest_gamification_existing_schema.sql');
  assert.deepEqual((await db.query("select table_name from information_schema.tables where table_schema='sora_v2' order by table_name")).rows,tablesBefore,'migration must add no tables');
  assert.deepEqual((await db.query("select table_name,column_name,data_type from information_schema.columns where table_schema='sora_v2' order by table_name,ordinal_position")).rows,columnsBefore,'migration must add no columns');
  await db.exec('reset role');
  await db.query(`insert into sora_v2.users(id,first_name,last_name,username,birthdate,user_role,mobile_number,membership_type,membership_rank,membership_status,membership_expires_at,remaining_minutes)
    values($1,'Reader','One','reader','2000-01-01','Reader','1','Guild Member','F','ACTIVE',now()+interval '1 day',120),($2,'Staff','One','staff','1990-01-01','Librarian','2',null,null,'INACTIVE',null,0)`,[reader,staff]);
  await db.exec(`insert into sora_v2.authors(author_firstname,author_lastname) values('A','Writer');
    insert into sora_v2.books(author_id,title,isbn,book_type,age_rating,book_genre) values(1,'Quest Book','9781234567890','Manga',0,'Fantasy');
    insert into sora_v2.book_copies(book_id,copy_number,barcode,shelf_location) values(1,1,'COPY1','Shelf A1'); insert into sora_v2.seats(seat_number,seat_area) values(100,'Quest Test');`);
  await as(reader);
  const dashboard = await scalar('select sora_v2.reader_quest_dashboard()');
  assert.equal(dashboard.quests.filter(q=>q.status==='IN PROGRESS').length,1);
  await assert.rejects(db.query('update sora_v2.user_quests set progress_value=999'),/permission denied/);
  await db.exec('reset role');
  await db.query(`insert into sora_v2.sessions(user_id,copy_id,seat_id,borrow_date) values($1,1,21,now()-interval '20 minutes')`,[reader]);
  await db.query(`insert into sora_v2.session_activity_logs(session_id,user_id,book_id,copy_id,action,created_at) values(1,$1,1,1,'KIOSK_BOOK_SCANNED',now()-interval '20 minutes')`,[reader]);
  await db.query(`insert into sora_v2.session_activity_logs(session_id,user_id,book_id,copy_id,action) values(1,$1,1,1,'KIOSK_BOOK_RETURNED')`,[reader]);
  assert.equal(Number(await scalar("select count(*) from sora_v2.session_activity_logs where action='QUEST_PROGRESS_RECORDED'")),1);
  assert.equal(Number(await scalar('select points_awarded from sora_v2.user_quests')),50);
  await db.query(`insert into sora_v2.session_activity_logs(session_id,user_id,book_id,copy_id,action) values(1,$1,1,1,'KIOSK_BOOK_RETURNED')`,[reader]);
  assert.equal(Number(await scalar('select points_awarded from sora_v2.user_quests')),50,'duplicate return cannot duplicate reward');
  await as(staff);
  const questId=Number(await scalar('select quest_id from sora_v2.quests order by quest_id limit 1'));
  await assert.rejects(db.query(`select sora_v2.admin_refine_quest(${questId},999,50,7,'Unrealistic target')`),/configured difficulty rules/);
  console.log('PASS: no new tables/columns, fallback assignment, RLS, verified progress, atomic reward, duplicate prevention and refinement bounds.');
} finally { await db.close(); }
