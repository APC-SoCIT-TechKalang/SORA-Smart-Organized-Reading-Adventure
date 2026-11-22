import assert from 'node:assert/strict';
import { isReaderActivated } from '../src/lib/reader-activation.ts';

const now = Date.parse('2026-11-22T12:00:00+08:00');
const active = { accountActive: true, readerRole: true, membershipStatus: 'ACTIVE', expiresAt: '2026-11-23T12:00:00+08:00' };
assert.equal(isReaderActivated(active, now), true);
assert.equal(isReaderActivated({ ...active, membershipStatus: 'INACTIVE' }, now), false, 'Registration alone does not grant access');
assert.equal(isReaderActivated({ ...active, accountActive: false }, now), false);
assert.equal(isReaderActivated({ ...active, readerRole: false }, now), false);
for (const membershipStatus of ['EXPIRED', 'SUSPENDED', 'CANCELLED', null]) {
  assert.equal(isReaderActivated({ ...active, membershipStatus }, now), false);
}
for (const expiresAt of ['2026-11-21T12:00:00+08:00', '2026-11-22T12:00:00+08:00', 'invalid', null]) {
  assert.equal(isReaderActivated({ ...active, expiresAt }, now), false);
}
assert.equal(isReaderActivated({ ...active, expiresAt: null, allowNoExpiry: true }, now), true, 'Legacy unlimited memberships are supported');
console.log('PASS: activated reader, pending activation, disabled account, staff role, suspended and expired memberships, invalid expiry, legacy unlimited membership');
