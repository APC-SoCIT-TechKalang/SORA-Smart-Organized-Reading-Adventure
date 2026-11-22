import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { database } from './supabase';
import { replacementApi, usesReplacementSchema } from './replacement-library';
import { isReaderActivated } from './reader-activation';

type Status = 'checking' | 'active' | 'inactive' | 'error';
interface Access { userId: string; status: Status; expiresAt: number | null; }

/** Feature access is separate from catalog loading, and fails closed on errors. */
export function useReaderAccess(session: Session | null) {
  const userId = session?.user.id;
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    if (!userId) return;
    const checkedUserId = userId;
    let disposed = false;
    let generation = 0;
    async function check() {
      const current = ++generation;
      try {
        let expiresAt: string | null = null;
        let activated = false;
        if (usesReplacementSchema) {
          // Library IDs can differ from the Supabase Auth ID.
          const mapped = await replacementApi().rpc('current_user_id');
          if (mapped.error) throw mapped.error;
          if (mapped.data) {
            const result = await replacementApi().from('users')
              .select('is_active,user_role,membership_status,membership_expires_at')
              .eq('id', String(mapped.data)).maybeSingle();
            if (result.error) throw result.error;
            if (result.data) {
              expiresAt = result.data.membership_expires_at;
              activated = isReaderActivated({ accountActive: result.data.is_active === true,
                readerRole: result.data.user_role === 'Reader', membershipStatus: result.data.membership_status, expiresAt });
            }
          }
        } else {
          const [profile, memberships] = await Promise.all([
            database().from('profiles').select('is_active,roles(name)').eq('user_id', userId).maybeSingle(),
            database().from('memberships').select('status,expires_at').eq('user_id', userId).eq('status', 'ACTIVE'),
          ]);
          if (profile.error) throw profile.error;
          if (memberships.error) throw memberships.error;
          const account = profile.data as { is_active: boolean; roles: { name: string } | null } | null;
          const eligible = (memberships.data ?? []).filter(membership => isReaderActivated({
            accountActive: account?.is_active === true, readerRole: account?.roles?.name === 'reader',
            membershipStatus: membership.status, expiresAt: membership.expires_at, allowNoExpiry: true,
          }));
          activated = eligible.length > 0;
          // Legacy memberships can be unlimited; otherwise retain the latest expiry.
          expiresAt = eligible.some(item => item.expires_at === null) ? null
            : eligible.sort((a, b) => Date.parse(b.expires_at) - Date.parse(a.expires_at))[0]?.expires_at ?? null;
        }
        if (!disposed && current === generation) setAccess({ userId: checkedUserId, status: activated ? 'active' : 'inactive', expiresAt: expiresAt ? Date.parse(expiresAt) : null });
      } catch {
        if (!disposed && current === generation) setAccess({ userId: checkedUserId, status: 'error', expiresAt: null });
      }
    }
    void check();
    const timer = window.setInterval(() => { if (!document.hidden) void check(); }, 30_000);
    const onVisible = () => { if (!document.hidden) void check(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { disposed = true; generation++; clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [userId]);

  useEffect(() => {
    if (!access || access.status !== 'active' || access.expiresAt === null) return;
    const expire = () => setAccess(previous => previous === access ? { ...previous, status: 'inactive' } : previous);
    // Re-arm long expirations rather than overflowing the browser timer limit.
    const timer = window.setTimeout(() => {
      if (access.expiresAt !== null && access.expiresAt <= Date.now()) expire();
      else setAccess(previous => previous === access ? { ...previous } : previous);
    }, Math.max(0, Math.min(access.expiresAt - Date.now(), 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [access]);

  if (!userId) return 'signed-out' as const;
  if (!access || access.userId !== userId) return 'checking' as const;
  if (access.status === 'active' && access.expiresAt !== null && access.expiresAt <= Date.now()) return 'inactive' as const;
  return access.status;
}
