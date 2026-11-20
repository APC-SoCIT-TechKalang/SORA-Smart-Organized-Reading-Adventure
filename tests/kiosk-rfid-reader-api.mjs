import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from '../apps/admin-dashboard/node_modules/typescript/lib/typescript.js';

const readerId = '00000000-0000-4000-8000-000000000001';
const source = ts.transpileModule(readFileSync(new URL('../apps/BONBON UI USER/api/kiosk-rfid-login.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function fixture({ configured = true, known = true, linked = true, databaseError = false } = {}) {
  let tokens = 0, lookups = 0;
  const account = { user_id: readerId, auth_user_id: readerId, email: 'reader@example.test', first_name: 'Test', last_name: 'Reader' };
  const module = { exports: {} };
  runInNewContext(source, {
    exports: module.exports,
    URL,
    Date,
    JSON,
    process: { env: { VITE_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: configured ? 'server-secret' : '' } },
    require: () => ({ createClient: () => ({
      schema: () => ({ rpc: async () => { lookups++; return { data: known ? [account] : [], error: databaseError ? {} : null }; } }),
      auth: { admin: {
        getUserById: async () => ({ data: { user: { app_metadata: { sora_user_id: linked ? readerId : 'other' } } }, error: null }),
        generateLink: async () => { tokens++; return { data: { properties: { hashed_token: 'one-time-token' }, user: { id: readerId } }, error: null }; },
      } },
    }) }),
  });
  const call = async ({ method = 'POST', origin = 'https://reader.example', host = 'reader.example', uid = '0001234567', ip = randomUUID() } = {}) => {
    let status = 200, body;
    const response = { setHeader() {}, status(code) { status = code; return this; }, json(value) { body = value; } };
    await module.exports.default({ method, body: { rfidUid: uid }, headers: { origin, host, 'x-forwarded-for': ip } }, response);
    return { status, body };
  };
  return { call, tokens: () => tokens, lookups: () => lookups };
}

assert.equal((await fixture().call({ method: 'GET' })).status, 405);
for (const origin of ['', 'https://evil.example']) {
  const f = fixture();
  assert.equal((await f.call({ origin })).status, 403);
  assert.equal(f.lookups(), 0);
}
{
  const f = fixture({ configured: false });
  assert.equal((await f.call()).status, 503);
  assert.equal(f.lookups(), 0);
}
{
  const f = fixture();
  assert.equal((await f.call({ uid: 'bad uid' })).status, 400);
  assert.equal(f.lookups(), 0);
}
for (const options of [{ known: false }, { linked: false }, { databaseError: true }]) {
  const f = fixture(options);
  const response = await f.call();
  assert.equal(response.status, options.databaseError ? 503 : 403);
  assert.equal(f.tokens(), 0);
}
{
  const f = fixture();
  const response = await f.call();
  assert.equal(response.status, 200);
  assert.equal(JSON.stringify(response.body), JSON.stringify({ tokenHash: 'one-time-token', account: { userId: readerId, firstName: 'Test', lastName: 'Reader' } }));
  assert.equal(f.tokens(), 1);
}
{
  const f = fixture();
  const ip = 'rate-limit-test';
  for (let index = 0; index < 10; index++) assert.notEqual((await f.call({ ip, uid: 'unknown' })).status, 429);
  assert.equal((await f.call({ ip, uid: 'unknown' })).status, 429);
}
console.log('PASS: deployed RFID API method, origin, input, configuration, account-link, database, token and rate-limit controls.');
