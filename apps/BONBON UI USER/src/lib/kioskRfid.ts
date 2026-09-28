export type BridgeAuthentication = { tokenHash: string; account: unknown };
type NdefRecord = { recordType: string; data?: ArrayBuffer | null };
type NdefReadingEvent = Event & { message: { records: NdefRecord[] } };
type NdefReader = { scan: () => Promise<void>; addEventListener: (name: 'reading', listener: (event: NdefReadingEvent) => void, options?: { once?: boolean }) => void };
declare global { interface WindowEventMap { 'sora:rfid-auth': CustomEvent<BridgeAuthentication>; } interface Window { NDEFReader?: new () => NdefReader; } }
function readText(record: NdefRecord) { return record.recordType === 'text' && record.data ? new TextDecoder().decode(record.data).trim() || null : null; }
export function supportsWebNfc() { return typeof window !== 'undefined' && Boolean(window.NDEFReader); }
export async function startWebNfcScan(onUid: (uid: string) => void) { if (!window.NDEFReader) throw new Error('This browser cannot read NFC cards directly. Use the connected library card reader.'); const reader = new window.NDEFReader(); reader.addEventListener('reading', event => { const uid = event.message.records.map(readText).find((value): value is string => Boolean(value)); if (uid) onUid(uid); }, { once: true }); await reader.scan(); }
export function subscribeToReaderBridge(onAuthentication: (authentication: BridgeAuthentication) => void) { const receive = (event: CustomEvent<BridgeAuthentication>) => { if (event.detail?.tokenHash && event.detail?.account) onAuthentication(event.detail); }; window.addEventListener('sora:rfid-auth', receive); return () => window.removeEventListener('sora:rfid-auth', receive); }
