export interface ReaderActivation {
  accountActive: boolean;
  readerRole: boolean;
  membershipStatus: string | null;
  expiresAt: string | null;
  allowNoExpiry?: boolean;
}

export function isReaderActivated(value: ReaderActivation, now = Date.now()) {
  if (!value.accountActive || !value.readerRole || value.membershipStatus !== 'ACTIVE') return false;
  if (value.expiresAt === null) return value.allowNoExpiry === true;
  const expiry = Date.parse(value.expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}
