import assert from 'node:assert/strict';
import test from 'node:test';
import { readBonPayload } from '../src/lib/bon-response.ts';

test('a plain-text server failure produces a useful message, not a JSON syntax error', async () => {
  await assert.rejects(readBonPayload({ ok: false, text: async () => 'A server error has occurred' }), /online service is unavailable/i);
});

test('a valid chat response keeps the existing non-book flow', async () => {
  assert.equal((await readBonPayload({ ok: true, text: async () => JSON.stringify({ message: 'Here are your quests.' }) })).message, 'Here are your quests.');
});
