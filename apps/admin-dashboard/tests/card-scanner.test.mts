import assert from "node:assert/strict";
import test from "node:test";
import { createDuplicateScanGuard, normalizePhysicalCardUid, parseDigitalCardPayload, sanitizeCardPayload } from "../lib/card-scanner.ts";

test("physical card normalization preserves leading zeroes", () => {
  assert.equal(normalizePhysicalCardUid("0011223344\r\n"), "0011223344");
});

test("scanner formatting and separators cannot cause a false mismatch", () => {
  assert.equal(sanitizeCardPayload("]Q100:11:22:33:44\u200b"), "00:11:22:33:44");
  assert.equal(normalizePhysicalCardUid("]Q100:11:22:33:44\u200b"), "0011223344");
});

test("Digital ID parsing accepts the reader QR format and rejects unrelated values", () => {
  const cardUid = "0011223344";
  assert.equal(parseDigitalCardPayload(`tankobonbon:card-uid:${cardUid}`), cardUid);
  assert.equal(parseDigitalCardPayload("tankobonbon:card-uid:!"), null);
  assert.equal(parseDigitalCardPayload("0011223344"), null);
});

test("a held RFID card extends its duplicate quiet period without blocking another card", () => {
  const acceptScan = createDuplicateScanGuard(1_250);
  assert.equal(acceptScan("0011223344", 0), true);
  assert.equal(acceptScan("0011223344", 500), false);
  assert.equal(acceptScan("0011223344", 1_500), false);
  assert.equal(acceptScan("AABBCCDD", 1_501), true);
  assert.equal(acceptScan("0011223344", 2_751), true);
});
