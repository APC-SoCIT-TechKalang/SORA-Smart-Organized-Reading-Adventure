// npm install --prefix work/session-history-validation --no-save @electric-sql/pglite
// Isolated PostgreSQL validation; never connects to the live database.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '../work/session-history-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema sora_v2;
    create table sora_v2.users (id integer primary key, remaining_minutes integer, membership_type text);
    create table sora_v2.sessions (session_id integer primary key, user_id integer references sora_v2.users,
      return_date timestamptz, session_status text default 'READING');
    insert into sora_v2.users values (1, 120, 'Day Pass'), (2, 0, 'Guild Adventurer');
    insert into sora_v2.sessions(session_id,user_id,return_date) values (1,1,now()),(2,1,null),(3,1,null),(4,2,null),(5,1,null);
  `);
  const migration = readFileSync(new URL('../supabase/replacement/036_session_history_balances.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  const row = async id => (await db.query(`select remaining_minutes_after, unlimited_time_after from sora_v2.sessions where session_id=$1`, [id])).rows[0];
  assert.deepEqual(await row(1), { remaining_minutes_after: null, unlimited_time_after: null });
  // Reader checkout writes the session before deducting time.
  await db.exec(`begin;
    update sora_v2.sessions set return_date=now(),session_status='CHECKOUT PENDING' where session_id=2;
    update sora_v2.users set remaining_minutes=100 where id=1;
    commit;`);
  assert.deepEqual(await row(2), { remaining_minutes_after: 100, unlimited_time_after: false });
  // Staff checkout deducts first, then transitions the session twice.
  await db.exec(`begin;
    update sora_v2.users set remaining_minutes=80 where id=1;
    update sora_v2.sessions set return_date=now(),session_status='CHECKOUT PENDING' where session_id=3;
    update sora_v2.sessions set session_status='CLOSED' where session_id=3;
    commit;`);
  assert.equal((await row(3)).remaining_minutes_after, 80);
  await db.exec(`update sora_v2.sessions set return_date=now() where session_id=4;`);
  assert.equal((await row(4)).unlimited_time_after, true);
  // Later top-ups and status changes must preserve earlier balances.
  await db.exec(`update sora_v2.users set remaining_minutes=500;
    update sora_v2.sessions set session_status='CLOSED' where session_id=2;`);
  assert.equal((await row(2)).remaining_minutes_after, 100);
  assert.equal((await row(3)).remaining_minutes_after, 80);
  await db.exec(`begin; update sora_v2.sessions set return_date=now() where session_id=5; rollback;`);
  assert.equal((await row(5)).remaining_minutes_after, null);
  await db.exec(migration);
  assert.equal((await row(2)).remaining_minutes_after, 100);
  console.log('Session balance migration passed: both checkout orders, unlimited time, historical gaps, immutable snapshots, rollback, and safe reapplication.');
} finally {
  await db.close();
}
