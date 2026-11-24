import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const readerKey = process.env.KIOSK_RFID_BRIDGE_KEY;
  if (!url || !secret || !readerKey) return reply('Card detected. Kiosk sign-in is not configured; ask staff to configure the server key and reader bridge.', 503);
  const supplied = request.headers.get('x-kiosk-reader-key') ?? '';
  const expectedBytes = Buffer.from(readerKey);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return reply('Trusted kiosk reader required.', 401);
  if (Number(request.headers.get('content-length')) > 1024) return reply('Invalid card scan.', 400);
  let uid: unknown;
  try { uid = (await request.json()).rfidUid; } catch { return reply('Invalid card scan.', 400); }
  if (typeof uid !== 'string' || !/^[a-zA-Z0-9-]{4,128}$/.test(uid)) return reply('Invalid card scan.', 400);
  try {
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const resolved = await admin.schema('sora_v2').rpc('resolve_kiosk_rfid', { p_rfid_uid: uid });
    if (resolved.error) return reply('Card detected, but the RFID database service is unavailable. Ask staff to apply the RFID login migration.', 503);
    const account = resolved.data?.[0] as { auth_user_id: string; user_id: string; email: string; first_name: string; last_name: string } | undefined;
    if (!account?.email) return reply('Card not recognized, account inactive, or membership expired. Please ask library staff.', 403);
    // Check the mapped Auth account before issuing any one-time login token.
    const authUser = await admin.auth.admin.getUserById(account.auth_user_id);
    if (authUser.error || authUser.data.user?.app_metadata?.sora_user_id !== account.user_id) return reply('This card is not linked to a reader login. Please ask staff.', 403);
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: account.email });
    if (link.error || !link.data.properties?.hashed_token || link.data.user?.id !== account.auth_user_id) return reply('Could not create a card session. Please ask staff.', 503);
    return NextResponse.json({ tokenHash: link.data.properties.hashed_token, account: { userId: account.user_id, firstName: account.first_name, lastName: account.last_name, rfidUid: uid } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return reply('The card login service could not be reached. Please try again.', 503); }
}
