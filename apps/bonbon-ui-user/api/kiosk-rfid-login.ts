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
type ReaderRow = {
  id: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  user_role: string;
  membership_status: string;
  membership_expires_at: string | null;
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

function credential(body: unknown) {
  let parsed = body;
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const values = parsed as Record<string, unknown>;
  const uid = values.rfidUid;
  if (typeof uid === 'string' && /^[a-zA-Z0-9-]{4,128}$/.test(uid)) return { rfidUid: uid } as const;
  const userId = values.userId;
  if (typeof userId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) return { userId } as const;
  return null;
}

export default async function handler(request: RequestLike, response: ResponseLike) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  if (request.method !== 'POST') return response.status(405).json({ error: 'Method not allowed.' });
  if (!sameOrigin(request)) return response.status(403).json({ error: 'Use the card reader on this kiosk.' });
  if (!allowed(clientId(request))) return response.status(429).json({ error: 'Too many card scans. Wait one minute and try again.' });

  const loginCredential = credential(request.body);
  if (!loginCredential) return response.status(400).json({ error: 'Invalid card scan.' });
  const url = process.env.VITE_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return response.status(503).json({ error: 'Card detected, but kiosk login is not configured. Ask staff to configure the reader deployment.' });

  try {
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    let account: ResolvedAccount | undefined;
    if ('rfidUid' in loginCredential) {
      const resolved = await admin.schema('sora_v2').rpc('resolve_kiosk_rfid', { p_rfid_uid: loginCredential.rfidUid });
      if (resolved.error) return response.status(503).json({ error: 'The RFID database service is unavailable. Ask staff to apply the RFID login migration.' });
      account = resolved.data?.[0] as ResolvedAccount | undefined;
    } else {
      const authUser = await admin.auth.admin.getUserById(loginCredential.userId);
      const appUserId = authUser.data.user?.app_metadata?.sora_user_id;
      if (!authUser.error && authUser.data.user?.email && typeof appUserId === 'string') {
        const reader = await admin.schema('sora_v2').from('users')
          .select('id,first_name,last_name,is_active,user_role,membership_status,membership_expires_at')
          .eq('id', appUserId)
          .maybeSingle();
        const row = reader.data as ReaderRow | null;
        const membershipExpiresAt = row?.membership_expires_at
          ? Date.parse(row.membership_expires_at)
          : Number.NaN;
        const activeMembership = row?.membership_status === 'ACTIVE'
          && Number.isFinite(membershipExpiresAt)
          && membershipExpiresAt > Date.now();
        if (!reader.error && row?.is_active && row.user_role === 'Reader' && activeMembership) {
          account = { auth_user_id: authUser.data.user.id, user_id: row.id, email: authUser.data.user.email, first_name: row.first_name, last_name: row.last_name };
        }
      }
    }
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
      account: {
        userId: account.user_id,
        firstName: account.first_name,
        lastName: account.last_name,
        ...('rfidUid' in loginCredential ? { rfidUid: loginCredential.rfidUid } : {}),
      },
    });
  } catch {
    return response.status(503).json({ error: 'The card login service could not be reached. Please try again.' });
  }
}
