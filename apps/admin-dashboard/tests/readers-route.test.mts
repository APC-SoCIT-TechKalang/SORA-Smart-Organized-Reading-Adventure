import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const authId = '00000000-0000-4000-8000-000000000001';

function routeFixture(insertError: string | null = null) {
  let inserted: Record<string, unknown> | undefined;
  let linked: unknown;
  let deleted: string | undefined;
  const admin = {
    auth: { admin: {
      createUser: async () => ({ data: { user: { id: authId, app_metadata: {} } }, error: null }),
      updateUserById: async (id: string, metadata: unknown) => { linked = { id, metadata }; return { error: null }; },
      deleteUser: async (id: string) => { deleted = id; return { error: null }; },
    } },
    schema: () => ({ from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserted = row;
        return { select: () => ({ single: async () => ({
          data: row.id ? { id: row.id } : null,
          error: insertError ? { message: insertError } : row.id ? null : { message: 'null value in column "id" violates not-null constraint' },
        }) }) };
      },
    }) }),
  };
  let clients = 0;
  const module = { exports: {} as { POST: (request: Request) => Promise<Response> } };
  const source = ts.transpileModule(readFileSync(new URL('../app/api/readers/route.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  runInNewContext(source, {
    exports: module.exports,
    require: (name: string) => name === 'next/server' ? { NextResponse: Response } : {
      createClient: () => ++clients === 1 ? { schema: () => ({ rpc: async () => ({ data: true, error: null }) }) } : admin,
    },
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'test-public', SUPABASE_SECRET_KEY: 'test-server' } },
  });
  return { POST: module.exports.POST, inserted: () => inserted, linked: () => linked, deleted: () => deleted };
}

const request = () => new Request('http://localhost/api/readers', {
  method: 'POST', headers: { authorization: 'Bearer staff-test', 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'reader@example.test', password: 'Test-Password123!', firstName: 'Test', lastName: 'Reader', username: 'testreader', birthdate: '2000-01-01', mobileNumber: '09000000000' }),
});

test('creates a reader on a users table with no UUID default and links the Auth account', async () => {
  const fixture = routeFixture();
  const response = await fixture.POST(request());
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { userId: authId });
  assert.equal(fixture.inserted()?.id, authId);
  assert.equal(fixture.inserted()?.user_role, 'Reader');
  assert.equal(JSON.stringify(fixture.linked()), JSON.stringify({ id: authId, metadata: { app_metadata: { sora_user_id: authId } } }));
  assert.equal(fixture.deleted(), undefined);
});

test('cleans up the new Auth login if creating the reader profile fails', async () => {
  const fixture = routeFixture('duplicate username');
  const response = await fixture.POST(request());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'duplicate username' });
  assert.equal(fixture.deleted(), authId);
  assert.equal(fixture.linked(), undefined);
});
