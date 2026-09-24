import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const setupMessage = 'Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in apps/BONBON UI USER/.env.local and restart.';
export function database() {
  if (!supabase) throw new Error(setupMessage);
  return supabase;
}
export function errorMessage(error: unknown) {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) return 'No account found with this email, or the password is incorrect. Please try again.';
  if (normalized.includes('email not confirmed')) return 'Please confirm your email address before signing in.';
  if (normalized.includes('too many requests') || normalized.includes('rate limit')) return 'Too many sign-in attempts. Please wait a moment and try again.';
  if (normalized.includes('refresh token') || normalized.includes('jwt expired')) return 'Your session has expired. Please sign in again.';
  if (status >= 500 || normalized.includes('network') || normalized.includes('fetch') || normalized.includes('load failed')) return 'Unable to sign in right now. Please try again.';
  return message || 'Request failed. Please try again.';
}
export async function readRows<T>(table: string, columns: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await database().from(table).select(columns).order(order).range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data as unknown as T[]));
    if (data.length < 500) return rows;
  }
}

