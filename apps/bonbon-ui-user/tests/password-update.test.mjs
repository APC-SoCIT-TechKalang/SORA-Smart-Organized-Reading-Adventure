import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Exercise the actual submit handler without calling a live account or storing
// credentials. Parse the component so this regression covers its real request.
const source = readFileSync(new URL('../src/components/ManageAccountDialog.tsx', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('ManageAccountDialog.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function findHandler(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'updatePassword') handler = node;
  ts.forEachChild(node, findHandler);
}
findHandler(parsed);
assert.ok(handler, 'Password submit handler exists');
const javascript = ts.transpileModule(handler.getText(parsed), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ currentPassword = 'Old-password123!', signInError = null, updateError = null } = {}) {
  const state = { message: '', error: '', busy: false, resets: 0, password: currentPassword };
  const calls = [];
  const form = { reset() { state.resets++; } };
  const event = { currentTarget: form, preventDefault() {} };
  const context = {
    currentPassword,
    session: { user: { email: 'reader@example.test' } },
    FormData: class {
      constructor(target) { assert.equal(target, form); }
      get(name) { return { newPassword: 'New-password456!', confirmPassword: 'New-password456!' }[name]; }
    },
    setPasswordMessage: value => { state.message = value; },
    setPasswordError: value => { state.error = value; },
    setPasswordBusy: value => { state.busy = value; },
    setCurrentPassword: value => { state.password = value; },
    errorMessage: error => error.message,
    database: () => ({ auth: {
      signInWithPassword: async attributes => {
        calls.push({ operation: 'signIn', ...attributes });
        // React clears currentTarget after dispatch; the form must be captured
        // before awaiting network requests.
        event.currentTarget = null;
        return { error: signInError };
      },
      updateUser: async attributes => {
        calls.push({ operation: 'update', ...attributes });
        assert.equal(attributes.current_password, currentPassword);
        return { error: updateError ?? (!attributes.current_password
          ? { message: 'Current password required when setting new password.' } : null) };
      },
    } }),
  };
  runInNewContext(javascript, context);
  return { run: () => context.updatePassword(event), state, calls };
}

test('sends the current password with the update and resets the captured form after success', async () => {
  const { run, state, calls } = fixture();
  await run();
  assert.equal(calls[1].operation, 'update');
  assert.equal(calls[1].current_password, 'Old-password123!');
  assert.equal(calls[1].password, 'New-password456!');
  assert.equal(state.error, '');
  assert.equal(state.message, 'Password updated successfully.');
  assert.equal(state.resets, 1);
  assert.equal(state.password, '');
  assert.equal(state.busy, false);
});

test('does not submit a password change if verification fails', async () => {
  const { run, state, calls } = fixture({ signInError: { message: 'Invalid login credentials' } });
  await run();
  assert.equal(calls.length, 1);
  assert.equal(state.error, 'Invalid login credentials');
  assert.equal(state.resets, 0);
  assert.equal(state.busy, false);
});

test('shows a rejected update without reporting success or clearing the form', async () => {
  const { run, state } = fixture({ updateError: { message: 'New password should be different from the old password.' } });
  await run();
  assert.match(state.error, /different/);
  assert.equal(state.message, '');
  assert.equal(state.resets, 0);
  assert.equal(state.busy, false);
});

test('rejects a missing current password before making any requests', async () => {
  const { run, state, calls } = fixture({ currentPassword: '' });
  await run();
  assert.equal(calls.length, 0);
  assert.match(state.error, /Enter your current password/);
});
