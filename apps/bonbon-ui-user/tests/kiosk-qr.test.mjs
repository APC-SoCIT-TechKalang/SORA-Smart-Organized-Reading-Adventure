import assert from 'node:assert/strict';
import test from 'node:test';
import { createKioskQrPayload, parseKioskQrPayload } from '../src/lib/kioskQr.ts';

test('creates and parses a Tankobonbon kiosk QR payload', () => {
  const userId = '123e4567-e89b-42d3-a456-426614174000';
  const payload = createKioskQrPayload(userId);
  assert.equal(payload, `tankobonbon:kiosk-user:${userId}`);
  assert.equal(parseKioskQrPayload(payload), userId);
});

test('rejects unrelated and malformed QR payloads', () => {
  assert.equal(parseKioskQrPayload('https://example.com'), null);
  assert.equal(parseKioskQrPayload('tankobonbon:kiosk-user:!'), null);
  assert.throws(() => createKioskQrPayload('bad value'));
});
