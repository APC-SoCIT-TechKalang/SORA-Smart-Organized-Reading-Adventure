import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhysicalCardUid, sanitizeCardPayload } from "../lib/card-scanner.ts";

test("physical card normalization preserves leading zeroes", () => {
  assert.equal(normalizePhysicalCardUid("0011223344\r\n"), "0011223344");
});

test("scanner formatting and separators cannot cause a false mismatch", () => {
  assert.equal(sanitizeCardPayload("]Q100:11:22:33:44\u200b"), "00:11:22:33:44");
  assert.equal(normalizePhysicalCardUid("]Q100:11:22:33:44\u200b"), "0011223344");
});
