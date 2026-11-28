import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const authId = '00000000-0000-4000-8000-000000000001';
const readerId = '00000000-0000-4000-8000-000000000002';
const source = ts.transpileModule(readFileSync(new URL('../api/kiosk-rfid-login.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture(options = {}) {
  const calls = { tokens: 0, rfid: [] };
  const account = { auth_user_id: authId, user_id: readerId, email: 'reader@example.test', first_name: 'Test', last_name: 'Reader' };
  const api = {
    rpc: async (name, args) => {
      assert.equal(name, 'resolve_kiosk_rfid');
      calls.rfid.push(args.p_rfid_uid);
      return { data: options.unknown ? [] : [account], error: null };
    },
  };
  const module = { exports: {} };
  runInNewContext(source, {
    exports: module.exports,
    URL,
    process: { env: { VITE_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: 'mock-server-key' } },
    require: name => {
      assert.equal(name, '@supabase/supabase-js');
      return { createClient: () => ({
        schema: schema => { assert.equal(schema, 'sora_v2'); return api; },
        auth: { admin: {
          getUserById: async id => {
            assert.equal(id, authId);
            return { data: { user: { id: authId, email: account.email, app_metadata: { sora_user_id: readerId } } }, error: null };
          },
          generateLink: async () => {
            calls.tokens++;
            return { data: { properties: { hashed_token: 'mock-one-time-token' }, user: { id: options.wrongAuthUser ? 'other-user' : authId } }, error: options.tokenError ? { message: 'unavailable' } : null };
          },
        } },
      }) };
    },
  });
  return {
    calls,
    async scan(body, origin = 'https://kiosk.example.test') {
      const response = { code: 0, body: null, headers: {},
        status(code) { this.code = code; return this; },
        json(body) { this.body = JSON.parse(JSON.stringify(body)); },
        setHeader(name, value) { this.headers[name] = value; },
      };
      await module.exports.default({ method: 'POST', body, headers: { origin, host: 'kiosk.example.test' } }, response);
      return response;
    },
  };
}

test('assigned card UID returns a usable token and account', async () => {
  const f = fixture();
  const response = await f.scan({ rfidUid: '0011223344' });
  assert.equal(response.code, 200);
  assert.equal(response.body.tokenHash, 'mock-one-time-token');
  assert.deepEqual(response.body.account, { userId: readerId, firstName: 'Test', lastName: 'Reader', rfidUid: '0011223344' });
  assert.deepEqual(f.calls.rfid, ['0011223344']);
  assert.equal(f.calls.tokens, 1);
  assert.equal(response.headers['Cache-Control'], 'no-store, max-age=0');
});

test('physical-card login returns the scanned RFID and a usable token', async () => {
  const f = fixture();
  const response = await f.scan({ rfidUid: 'CARD-12345' });
  assert.equal(response.code, 200);
  assert.equal(response.body.tokenHash, 'mock-one-time-token');
  assert.equal(response.body.account.rfidUid, 'CARD12345');
  assert.deepEqual(f.calls.rfid, ['CARD12345']);
  assert.equal(f.calls.tokens, 1);
});

test('account UUID alone cannot mint a login token', async () => {
  const f = fixture();
  assert.equal((await f.scan({ userId: authId })).code, 400);
  assert.equal(f.calls.tokens, 0);
});

test('unknown physical cards cannot mint login tokens', async () => {
  const f = fixture({ unknown: true });
  assert.equal((await f.scan({ rfidUid: 'UNKNOWN' })).code, 403);
  assert.equal(f.calls.tokens, 0);
});

test('failed token issuance never returns a successful login', async () => {
  for (const options of [{ tokenError: true }, { wrongAuthUser: true }]) {
    const response = await fixture(options).scan({ rfidUid: '0011223344' });
    assert.equal(response.code, 503);
    assert.equal(response.body.tokenHash, undefined);
  }
});

test('invalid and cross-origin scans are rejected before token issuance', async () => {
  const f = fixture();
  assert.equal((await f.scan({ rfidUid: '!' })).code, 400);
  assert.equal((await f.scan({ userId: authId }, 'https://other.example.test')).code, 403);
  assert.equal(f.calls.tokens, 0);
});
