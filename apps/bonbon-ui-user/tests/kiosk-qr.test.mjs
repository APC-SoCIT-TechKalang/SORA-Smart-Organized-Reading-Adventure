import assert from 'node:assert/strict';
import test from 'node:test';
import { createKioskQrPayload, parseKioskQrPayload } from '../src/lib/kioskQr.ts';
import { sanitizeScannerPayload } from '../src/lib/kioskRfid.ts';

test('creates and parses a Tankobonbon kiosk QR payload', () => {
  const cardUid = '0011223344';
  const payload = createKioskQrPayload(cardUid);
  assert.equal(payload, `tankobonbon:card-uid:${cardUid}`);
  assert.equal(parseKioskQrPayload(payload), cardUid);
});

test('rejects unrelated and malformed QR payloads', () => {
  assert.equal(parseKioskQrPayload('https://example.com'), null);
  assert.equal(parseKioskQrPayload('tankobonbon:card-uid:!'), null);
  assert.equal(parseKioskQrPayload('tankobonbon:kiosk-user:123e4567-e89b-42d3-a456-426614174000'), null);
  assert.throws(() => createKioskQrPayload('bad value'));
});

test('sanitizes USB HID scanner formatting and QR symbology prefixes', () => {
  const cardUid = '0011223344';
  const raw = `\u0000  ]Q1tankobonbon:card-uid:${cardUid}\r\n`;
  const sanitized = sanitizeScannerPayload(raw);
  assert.equal(sanitized, `tankobonbon:card-uid:${cardUid}`);
  assert.equal(parseKioskQrPayload(sanitized), cardUid);
});
