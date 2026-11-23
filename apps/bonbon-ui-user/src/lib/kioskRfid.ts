export type BridgeAuthentication = { tokenHash: string; account: unknown };
type NdefRecord = { recordType: string; data?: ArrayBuffer | null };
type NdefReadingEvent = Event & { message: { records: NdefRecord[] } };
type NdefReader = { scan: () => Promise<void>; addEventListener: (name: 'reading', listener: (event: NdefReadingEvent) => void, options?: { once?: boolean }) => void };
declare global { interface WindowEventMap { 'sora:rfid-auth': CustomEvent<BridgeAuthentication>; } interface Window { NDEFReader?: new () => NdefReader; } }
function readText(record: NdefRecord) { return record.recordType === 'text' && record.data ? new TextDecoder().decode(record.data).trim() || null : null; }
export function supportsWebNfc() { return typeof window !== 'undefined' && Boolean(window.NDEFReader); }
export async function startWebNfcScan(onUid: (uid: string) => void) { if (!window.NDEFReader) throw new Error('This browser cannot read NFC cards directly. Use the connected library card reader.'); const reader = new window.NDEFReader(); reader.addEventListener('reading', event => { const uid = event.message.records.map(readText).find((value): value is string => Boolean(value)); if (uid) onUid(uid); }, { once: true }); await reader.scan(); }
export function subscribeToReaderBridge(onAuthentication: (authentication: BridgeAuthentication) => void) { const receive = (event: CustomEvent<BridgeAuthentication>) => { if (event.detail?.tokenHash && event.detail?.account) onAuthentication(event.detail); }; window.addEventListener('sora:rfid-auth', receive); return () => window.removeEventListener('sora:rfid-auth', receive); }

/** USB keyboard-wedge readers send a rapid burst followed by Enter/Tab.
 * This is input capture, not proof of card authenticity; the server validates it.
 */
export function subscribeToKeyboardReader(onUid: (uid: string) => void) {
  let buffer = '';
  let lastKeyAt = 0;
  const reset = () => { buffer = ''; lastKeyAt = 0; };
  const receive = (event: KeyboardEvent) => {
    if (!event.isTrusted || event.repeat || event.ctrlKey || event.altKey || event.metaKey) { reset(); return; }
    const now = performance.now();
    if (now - lastKeyAt > 150) buffer = '';
    lastKeyAt = now;
    if (event.key === 'Enter' || event.key === 'Tab') {
      if (buffer.length >= 4) {
        event.preventDefault();
        const uid = buffer;
        reset();
        onUid(uid);
      } else reset();
      return;
    }
    if (/^[a-zA-Z0-9-]$/.test(event.key)) {
      buffer += event.key;
      if (buffer.length > 128) reset();
    } else if (event.key !== 'Shift') reset();
  };
  window.addEventListener('keydown', receive, true);
  window.addEventListener('blur', reset);
  return () => {
    window.removeEventListener('keydown', receive, true);
    window.removeEventListener('blur', reset);
    reset();
  };
}
