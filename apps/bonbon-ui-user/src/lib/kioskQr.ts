export const KIOSK_QR_PREFIX = 'tankobonbon:kiosk-login:';

const CARD_ID_PATTERN = /^[a-zA-Z0-9-]{4,128}$/;

export function createKioskQrPayload(cardId: string) {
  const normalized = cardId.trim();
  if (!CARD_ID_PATTERN.test(normalized)) throw new Error('This library card cannot be used for QR login.');
  return `${KIOSK_QR_PREFIX}${normalized}`;
}

export function parseKioskQrPayload(payload: string) {
  const normalized = payload.trim();
  if (!normalized.startsWith(KIOSK_QR_PREFIX)) return null;
  const cardId = normalized.slice(KIOSK_QR_PREFIX.length);
  return CARD_ID_PATTERN.test(cardId) ? cardId : null;
}

/** NFC tags may contain either the same payload as the digital-card QR or the
 * raw card identifier. QR scans remain prefix-only so arbitrary QR codes can
 * never be mistaken for library cards. */
export function parseKioskNfcPayload(payload: string) {
  const normalized = payload.trim();
  return parseKioskQrPayload(normalized)
    ?? (CARD_ID_PATTERN.test(normalized) ? normalized : null);
}
