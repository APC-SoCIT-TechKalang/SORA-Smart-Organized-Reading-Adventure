import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as crypto from 'node:crypto';
import ts from 'typescript';

const readerId = '00000000-0000-4000-8000-000000000001';
function fixture({ configured = true, known = true, linked = true, databaseError = false } = {}) {
  let tokens = 0, lookups = 0;
  const account = { user_id: readerId, auth_user_id: readerId, email: 'reader@example.test', first_name: 'Test', last_name: 'Reader' };
  const module = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const source = ts.transpileModule(readFileSync(new URL('../app/api/kiosk/rfid-login/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    exports: module.exports, Buffer,
    require: (name: string) => name === 'node:crypto' ? crypto : name === 'next/server' ? { NextResponse: Response } : {
      createClient: () => ({
        schema: () => ({ rpc: async () => { lookups++; return { data: known ? [account] : [], error: databaseError ? {} : null }; } }),
        auth: { admin: {
          getUserById: async () => ({ data: { user: { app_metadata: { sora_user_id: linked ? readerId : 'other-reader' } } }, error: null }),
          generateLink: async () => { tokens++; return { data: { properties: { hashed_token: 'one-use-token' }, user: { id: readerId } }, error: null }; },
        } },
      }),
    },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEY: configured ? 'server-secret' : '', KIOSK_RFID_BRIDGE_KEY: 'trusted-reader-key' } },
  });
  return { POST: module.exports.POST, tokens: () => tokens, lookups: () => lookups };
}
const request = (key = 'trusted-reader-key', uid = '0001234567') => new Request('http://localhost/api/kiosk/rfid-login', {
  method: 'POST', headers: { 'x-kiosk-reader-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ rfidUid: uid }),
});

test('missing server configuration reports a setup error', async () => {
  const f = fixture({ configured: false }); assert.equal((await f.POST(request())).status, 503); assert.equal(f.lookups(), 0);
});
test('untrusted requests cannot resolve cards or mint sessions', async () => {
  const f = fixture();
  for (const key of ['', 'wrong', 'trusted-reader-keY']) assert.equal((await f.POST(request(key))).status, 401);
  assert.equal(f.lookups(), 0); assert.equal(f.tokens(), 0);
});
test('invalid scanner input never reaches the database', async () => {
  const f = fixture(); assert.equal((await f.POST(request(undefined, '123\n456'))).status, 400); assert.equal(f.lookups(), 0);
});
test('unknown, inactive and unlinked accounts cannot create sessions', async () => {
  for (const options of [{known:false}, {linked:false}]) {
    const f = fixture(options); assert.equal((await f.POST(request())).status, 403); assert.equal(f.tokens(), 0);
  }
});
test('database setup errors return an actionable message without leaking internal errors', async () => {
  const f = fixture({databaseError:true}); const response = await f.POST(request()); assert.equal(response.status, 503); assert.equal(f.tokens(), 0);
});
test('a trusted scan of a linked active reader yields a non-cached one-time token', async () => {
  const f = fixture(); const response = await f.POST(request());
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    tokenHash: 'one-use-token',
    account: { userId: readerId, firstName: 'Test', lastName: 'Reader', rfidUid: '0001234567' },
  });
  assert.equal(f.tokens(), 1);
});
