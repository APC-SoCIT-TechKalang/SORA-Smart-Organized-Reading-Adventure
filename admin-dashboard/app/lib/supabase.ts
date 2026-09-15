import { createClient } from '@supabase/supabase-js';
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export const setupMessage = 'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in admin-dashboard/.env.local and restart.';
export function database() {
  if (!supabase) throw new Error(setupMessage);
  return supabase;
}
export function errorMessage(error: unknown) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Request failed. Please try again.';
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

