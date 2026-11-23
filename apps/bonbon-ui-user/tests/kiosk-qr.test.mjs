import assert from 'node:assert/strict';
import test from 'node:test';
import { createKioskQrPayload, parseKioskNfcPayload, parseKioskQrPayload } from '../src/lib/kioskQr.ts';

test('creates and parses a Tankobonbon kiosk QR payload', () => {
  const payload = createKioskQrPayload('0001234567');
  assert.equal(payload, 'tankobonbon:kiosk-login:0001234567');
  assert.equal(parseKioskQrPayload(payload), '0001234567');
});

test('rejects unrelated and malformed QR payloads', () => {
  assert.equal(parseKioskQrPayload('https://example.com'), null);
  assert.equal(parseKioskQrPayload('tankobonbon:kiosk-login:!'), null);
  assert.throws(() => createKioskQrPayload('bad value'));
});

test('accepts raw and QR-formatted identifiers from NFC tags', () => {
  assert.equal(parseKioskNfcPayload('0475393028'), '0475393028');
  assert.equal(parseKioskNfcPayload('tankobonbon:kiosk-login:0475393028'), '0475393028');
  assert.equal(parseKioskNfcPayload('https://example.com'), null);
});
