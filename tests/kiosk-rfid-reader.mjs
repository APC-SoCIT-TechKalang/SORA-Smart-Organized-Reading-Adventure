import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from '../apps/admin-dashboard/node_modules/typescript/lib/typescript.js';
import { PGlite } from '../work/shelf-validation/node_modules/@electric-sql/pglite/dist/index.js';

// Exercise the scanner burst filter with a fake clock and window events.
const listeners = new Map();
let clock = 0;
const module = { exports: {} };
const source = ts.transpileModule(readFileSync(new URL('../apps/bonbon-ui-user/src/lib/kioskRfid.ts',import.meta.url),'utf8'), {
  compilerOptions: { module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2022 },
}).outputText;
runInNewContext(source,{exports:module.exports,window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)},performance:{now:()=>clock}});
const scans=[];
const stop=module.exports.subscribeToKeyboardReader(uid=>scans.push(uid));
const key=(value,delay=10,options={})=>{clock+=delay;listeners.get('keydown')({key:value,isTrusted:true,preventDefault(){},...options});};
for(const char of '0001234567')key(char);key('Enter');
assert.deepEqual(scans,['0001234567'],'Leading zeroes must survive a USB scan');
for(const char of '999999')key(char,300);key('Enter');
assert.equal(scans.length,1,'Slow manual input must not form a scan');
for(const char of 'abcdef')key(char,10,{isTrusted:false});key('Enter');
assert.equal(scans.length,1,'Synthetic DOM input is ignored');
for(const char of '1234')key(char);listeners.get('blur')();key('Enter');
assert.equal(scans.length,1,'Losing focus clears partial scans');
for(const char of 'ABCD1234')key(char);key('Tab');
assert.equal(scans[1],'ABCD1234');stop();assert.equal(listeners.size,0);

const db = new PGlite();
try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(readFileSync(new URL('../supabase/replacement/001_schema.sql',import.meta.url),'utf8'));
  await db.exec(`create schema auth; create table auth.users(id uuid, email text, raw_app_meta_data jsonb, deleted_at timestamptz, banned_until timestamptz, created_at timestamptz default now());
    insert into sora_v2.users(id,first_name,last_name,username,birthdate,user_role,mobile_number,membership_status,membership_type,membership_rank,membership_expires_at)
    values ('00000000-0000-4000-8000-000000000001','Test','Reader','reader','2000-01-01','Reader','1','ACTIVE','Guild Member','F',now()+interval '1 day');
    insert into sora_v2.librarycard(user_id,librarycard_rfid) values ('00000000-0000-4000-8000-000000000001','0001234567');
    insert into auth.users(id,email,raw_app_meta_data) values ('00000000-0000-4000-8000-000000000002','reader@example.test','{"sora_user_id":"00000000-0000-4000-8000-000000000001"}');`);
  await db.exec(readFileSync(new URL('../supabase/replacement/014_kiosk_rfid_login.sql',import.meta.url),'utf8'));
  const resolve=async uid=>(await db.query('select * from sora_v2.resolve_kiosk_rfid($1)',[uid])).rows;
  assert.equal((await resolve('0001234567'))[0].email,'reader@example.test');
  assert.equal((await resolve('1234567')).length,0,'Card identifiers use exact matching');
  for(const [disable,enable] of [
    ["update sora_v2.librarycard set is_active=false","update sora_v2.librarycard set is_active=true"],
    ["update sora_v2.librarycard set deactivated_at=now()","update sora_v2.librarycard set deactivated_at=null"],
    ["update sora_v2.users set is_active=false,deactivated_at=now()","update sora_v2.users set is_active=true,deactivated_at=null"],
    ["update sora_v2.users set membership_expires_at=now()-interval '1 day'","update sora_v2.users set membership_expires_at=now()+interval '1 day'"],
    ["update sora_v2.users set user_role='Librarian'","update sora_v2.users set user_role='Reader'"],
    ["update auth.users set banned_until=now()+interval '1 day'","update auth.users set banned_until=null"],
  ]) {await db.exec(disable);assert.equal((await resolve('0001234567')).length,0);await db.exec(enable);}
  await db.exec('grant usage on schema sora_v2 to anon; set role anon;');
  await assert.rejects(resolve('0001234567'),/permission denied/);
  console.log('PASS: USB scan bursts, Enter/Tab suffixes, leading zeroes, input filtering, cleanup, RFID SQL resolver, inactive/expired accounts and role protection.');
} finally {await db.close();}
