const MAX_KEY_INTERVAL_MS = 100;
const DUPLICATE_COOLDOWN_MS = 1_250;
const MAX_PAYLOAD_LENGTH = 512;
const DIGITAL_CARD_PREFIX = "tankobonbon:kiosk-user:";
const USER_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeCardPayload(payload: string) {
  return payload
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, "")
    .trim()
    .replace(/^][a-z]\d/i, "")
    .trim();
}

export function normalizePhysicalCardUid(payload: string) {
  return sanitizeCardPayload(payload).replace(/[^a-z0-9]/gi, "").toUpperCase();
}

export function parseDigitalCardPayload(payload: string) {
  const normalized = sanitizeCardPayload(payload);
  if (!normalized.startsWith(DIGITAL_CARD_PREFIX)) return null;
  const userId = normalized.slice(DIGITAL_CARD_PREFIX.length);
  return USER_ID_PATTERN.test(userId) ? userId : null;
}

export function isDigitalCardPayload(payload: string) {
  return sanitizeCardPayload(payload).startsWith("tankobonbon:");
}

export function createDuplicateScanGuard(cooldownMs = DUPLICATE_COOLDOWN_MS) {
  let lastSubmitted = "";
  let cooldownUntil = 0;
  return (payload: string, now = performance.now()) => {
    if (now < cooldownUntil && payload === lastSubmitted) {
      cooldownUntil = now + cooldownMs;
      return false;
    }
    lastSubmitted = payload;
    cooldownUntil = now + cooldownMs;
    return true;
  };
}

export function subscribeToCardScanner(onScan: (payload: string) => void) {
  let buffer = "";
  let lastKeyAt = 0;
  const acceptScan = createDuplicateScanGuard();
  const reset = () => { buffer = ""; lastKeyAt = 0; };

  const receive = (event: KeyboardEvent) => {
    if (!event.isTrusted || event.repeat || event.ctrlKey || event.altKey || event.metaKey) { reset(); return; }
    const now = performance.now();
    if (event.key === "Enter" || event.key === "\n" || event.key === "\r") {
      const payload = sanitizeCardPayload(buffer);
      const scannerSpeed = lastKeyAt > 0 && now - lastKeyAt <= MAX_KEY_INTERVAL_MS;
      reset();
      if (!scannerSpeed || payload.length < 4) return;
      event.preventDefault();
      // A keyboard-emulation RFID reader may repeat its UID while a card stays
      // on the reader. Extend the quiet period for every repeated burst so one
      // physical tap can never become a check-in followed by a check-out.
      if (!acceptScan(payload, now)) return;
      onScan(payload);
      return;
    }
    if (event.key === "Shift" || event.key === "AltGraph") return;
    if (event.key.length !== 1) { reset(); return; }
    if (lastKeyAt > 0 && now - lastKeyAt > MAX_KEY_INTERVAL_MS) buffer = "";
    buffer += event.key;
    lastKeyAt = now;
    if (buffer.length > MAX_PAYLOAD_LENGTH) reset();
  };

  window.addEventListener("keydown", receive, true);
  window.addEventListener("blur", reset);
  return () => {
    window.removeEventListener("keydown", receive, true);
    window.removeEventListener("blur", reset);
    reset();
  };
}
