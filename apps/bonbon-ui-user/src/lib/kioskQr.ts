export const KIOSK_QR_PREFIX = 'tankobonbon:card-uid:';

const CARD_UID_PATTERN = /^[A-Z0-9]{4,50}$/;

export function createKioskQrPayload(cardUid: string) {
  const normalized = cardUid.trim().toUpperCase();
  if (!CARD_UID_PATTERN.test(normalized)) throw new Error('No valid assigned card UID is available for QR login.');
  return `${KIOSK_QR_PREFIX}${normalized}`;
}

export function parseKioskQrPayload(payload: string) {
  const normalized = payload.trim();
  if (!normalized.startsWith(KIOSK_QR_PREFIX)) return null;
  const cardUid = normalized.slice(KIOSK_QR_PREFIX.length).toUpperCase();
  return CARD_UID_PATTERN.test(cardUid) ? cardUid : null;
}
