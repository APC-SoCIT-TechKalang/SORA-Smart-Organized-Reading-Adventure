export type BridgeAuthentication = { tokenHash: string; account: unknown };
type NdefRecord = { recordType: string; data?: ArrayBuffer | null };
type NdefReadingEvent = Event & { message: { records: NdefRecord[] } };
type NdefReader = { scan: () => Promise<void>; addEventListener: (name: 'reading', listener: (event: NdefReadingEvent) => void, options?: { once?: boolean }) => void };
declare global { interface WindowEventMap { 'sora:rfid-auth': CustomEvent<BridgeAuthentication>; } interface Window { NDEFReader?: new () => NdefReader; } }
function readText(record: NdefRecord) { return record.recordType === 'text' && record.data ? new TextDecoder().decode(record.data).trim() || null : null; }
export function supportsWebNfc() { return typeof window !== 'undefined' && Boolean(window.NDEFReader); }
export async function startWebNfcScan(onUid: (uid: string) => void) { if (!window.NDEFReader) throw new Error('This browser cannot read NFC cards directly. Use the connected library card reader.'); const reader = new window.NDEFReader(); reader.addEventListener('reading', event => { const uid = event.message.records.map(readText).find((value): value is string => Boolean(value)); if (uid) onUid(uid); }, { once: true }); await reader.scan(); }
export function subscribeToReaderBridge(onAuthentication: (authentication: BridgeAuthentication) => void) { const receive = (event: CustomEvent<BridgeAuthentication>) => { if (event.detail?.tokenHash && event.detail?.account) onAuthentication(event.detail); }; window.addEventListener('sora:rfid-auth', receive); return () => window.removeEventListener('sora:rfid-auth', receive); }

const SCANNER_MAX_KEY_INTERVAL_MS = 50;
const SCANNER_COOLDOWN_MS = 1_250;
const SCANNER_MAX_PAYLOAD_LENGTH = 512;

/** Removes AIM/symbology identifiers and invisible formatting added by scanners. */
export function sanitizeScannerPayload(payload: string) {
  return payload
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/g, '')
    .trim()
    .replace(/^][a-z]\d/i, '')
    .trim();
}

/** USB HID scanners in keyboard-wedge mode send a rapid burst followed by Enter.
 * This captures the burst globally; the server remains responsible for authentication.
 */
export function subscribeToHidScanner(onScan: (payload: string) => void) {
  let buffer = '';
  let lastKeyAt = 0;
  let lastSubmitted = '';
  let cooldownUntil = 0;
  const reset = () => { buffer = ''; lastKeyAt = 0; };
  const receive = (event: KeyboardEvent) => {
    if (!event.isTrusted || event.repeat || event.ctrlKey || event.altKey || event.metaKey) { reset(); return; }
    const now = performance.now();
    if (event.key === 'Enter' || event.key === '\n' || event.key === '\r') {
      const payload = sanitizeScannerPayload(buffer);
      const completedAtScannerSpeed = lastKeyAt > 0 && now - lastKeyAt <= SCANNER_MAX_KEY_INTERVAL_MS;
      reset();
      if (completedAtScannerSpeed && payload.length >= 4) {
        event.preventDefault();
        if (now < cooldownUntil && payload === lastSubmitted) return;
        lastSubmitted = payload;
        cooldownUntil = now + SCANNER_COOLDOWN_MS;
        onScan(payload);
      }
      return;
    }

    if (event.key === 'Shift' || event.key === 'AltGraph') return;
    if (event.key.length === 1) {
      if (lastKeyAt > 0 && now - lastKeyAt > SCANNER_MAX_KEY_INTERVAL_MS) buffer = '';
      buffer += event.key;
      lastKeyAt = now;
      if (buffer.length > SCANNER_MAX_PAYLOAD_LENGTH) reset();
    } else reset();
  };
  window.addEventListener('keydown', receive, true);
  window.addEventListener('blur', reset);
  return () => {
    window.removeEventListener('keydown', receive, true);
    window.removeEventListener('blur', reset);
    reset();
  };
}

/** Backwards-compatible alias for existing keyboard-wedge integrations. */
export const subscribeToKeyboardReader = subscribeToHidScanner;
