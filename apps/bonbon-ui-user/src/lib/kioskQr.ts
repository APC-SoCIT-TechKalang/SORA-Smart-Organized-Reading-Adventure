export const KIOSK_QR_PREFIX = 'tankobonbon:kiosk-user:';

const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createKioskQrPayload(userId: string) {
  const normalized = userId.trim();
  if (!USER_ID_PATTERN.test(normalized)) throw new Error('This reader account cannot be used for QR login.');
  return `${KIOSK_QR_PREFIX}${normalized}`;
}

export function parseKioskQrPayload(payload: string) {
  const normalized = payload.trim();
  if (!normalized.startsWith(KIOSK_QR_PREFIX)) return null;
  const userId = normalized.slice(KIOSK_QR_PREFIX.length);
  return USER_ID_PATTERN.test(userId) ? userId : null;
}
