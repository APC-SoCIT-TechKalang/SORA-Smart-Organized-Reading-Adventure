import { createClient } from '@supabase/supabase-js';

type RequestLike = {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
};
type ResponseLike = {
  status: (code: number) => ResponseLike;
  json: (body: unknown) => void;
  setHeader: (name: string, value: string) => void;
};
type ResolvedAccount = {
  auth_user_id: string;
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
};

const WINDOW_MS = 60_000;
const ATTEMPTS_PER_WINDOW = 10;
const buckets = new Map<string, { count: number; resetAt: number }>();

function header(request: RequestLike, name: string) {
  const value = request.headers[name] ?? request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function sameOrigin(request: RequestLike) {
  const origin = header(request, 'origin');
  const host = header(request, 'x-forwarded-host') ?? header(request, 'host');
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host.toLowerCase(); }
  catch { return false; }
}

function clientId(request: RequestLike) {
  return header(request, 'x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}

function allowed(id: string) {
  const now = Date.now();
  const current = buckets.get(id);
  if (!current || current.resetAt <= now) {
    buckets.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= ATTEMPTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

function cardUid(body: unknown) {
  let parsed = body;
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const uid = (parsed as Record<string, unknown>).rfidUid;
  return typeof uid === 'string' && /^[a-zA-Z0-9-]{4,128}$/.test(uid) ? uid : null;
}

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!sameOrigin(request)) return response.status(403).json({ error: 'Use the card reader on this kiosk.' });
  if (!allowed(clientId(request))) return response.status(429).json({ error: 'Too many card scans. Wait one minute and try again.' });

  const uid = cardUid(request.body);
  if (!uid) return response.status(400).json({ error: 'Invalid card scan.' });
  const url = process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return response.status(503).json({ error: 'Card detected, but kiosk login is not configured. Ask staff to configure the reader deployment.' });

  try {
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const resolved = await admin.schema('sora_v2').rpc('resolve_kiosk_rfid', { p_rfid_uid: uid });
    if (resolved.error) return response.status(503).json({ error: 'The RFID database service is unavailable. Ask staff to apply the RFID login migration.' });
    const account = resolved.data?.[0] as ResolvedAccount | undefined;
    if (!account?.email) return response.status(403).json({ error: 'Card not recognized, account inactive, or membership expired. Please ask library staff.' });

    const authUser = await admin.auth.admin.getUserById(account.auth_user_id);
    if (authUser.error || authUser.data.user?.app_metadata?.sora_user_id !== account.user_id) {
      return response.status(403).json({ error: 'This card is not linked to a reader login. Please ask staff.' });
    }
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: account.email });
    if (link.error || !link.data.properties?.hashed_token || link.data.user?.id !== account.auth_user_id) {
      return response.status(503).json({ error: 'Could not create a card session. Please ask staff.' });
    }
    return response.status(200).json({
      tokenHash: link.data.properties.hashed_token,
      account: { userId: account.user_id, firstName: account.first_name, lastName: account.last_name },
    });
  } catch {
    return response.status(503).json({ error: 'The card login service could not be reached. Please try again.' });
  }
}
