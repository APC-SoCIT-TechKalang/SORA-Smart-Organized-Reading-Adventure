import { createClient } from '@supabase/supabase-js';

type RequestLike = { method?: string; body?: unknown; headers: Record<string, string | string[] | undefined> };
type ResponseLike = { status: (code: number) => ResponseLike; json: (body: unknown) => void; setHeader: (name: string, value: string) => void };
type ReaderRecord = { user_id: string; card_id: number; email: string | null; first_name: string; last_name: string; membership_number: string; expires_at: string | null; total_points: number; current_streak_days: number; reading_sessions: number };
function bodyUid(body: unknown) { if (!body || typeof body !== 'object' || !('rfidUid' in body)) return ''; const value = (body as { rfidUid?: unknown }).rfidUid; return typeof value === 'string' ? value.trim() : ''; }
function header(request: RequestLike, name: string) { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  const rfidUid = bodyUid(request.body);
  if (!rfidUid || rfidUid.length > 160) return response.status(400).json({ error: 'Invalid card scan.' });
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return response.status(503).json({ error: 'Kiosk authentication is not configured.' });
  const bridgeKey = process.env.KIOSK_RFID_BRIDGE_KEY;
  if (bridgeKey && header(request, 'x-kiosk-reader-key') !== bridgeKey) return response.status(403).json({ error: 'This kiosk must use its connected card reader.' });
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: records, error: lookupError } = await admin.rpc('resolve_kiosk_rfid', { p_rfid_uid: rfidUid });
  if (lookupError) { console.error('RFID lookup failed', lookupError.message); return response.status(500).json({ error: 'Unable to verify this card right now.' }); }
  const reader = (records?.[0] ?? null) as ReaderRecord | null;
  if (!reader?.email) return response.status(401).json({ error: 'Card not recognized or inactive.' });
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: reader.email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) { console.error('Kiosk token creation failed', linkError?.message); return response.status(500).json({ error: 'Unable to start a secure kiosk session.' }); }
  return response.status(200).json({ tokenHash, account: { profile: { first_name: reader.first_name, last_name: reader.last_name }, membership: { number: reader.membership_number, expires_at: reader.expires_at }, progress: { points: reader.total_points, streak: reader.current_streak_days }, reading_sessions: reader.reading_sessions } });
}
