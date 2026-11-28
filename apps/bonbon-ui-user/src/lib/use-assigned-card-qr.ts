import { useEffect, useState } from 'react';
import { subscribeToCardDirectory } from './cardDirectorySync';
import { createKioskQrPayload } from './kioskQr';
import { replacementApi } from './replacement-library';

type CardQrState = { qrPayload: string; error: string; loading: boolean };

export function useAssignedCardQr(readerId: string | undefined, enabled: boolean): CardQrState {
  const [state, setState] = useState<CardQrState>({ qrPayload: '', error: '', loading: false });

  useEffect(() => {
    if (!enabled || !readerId) {
      setState({ qrPayload: '', error: '', loading: false });
      return;
    }
    let current = true;
    let request = 0;
    const load = async () => {
      const version = ++request;
      setState({ qrPayload: '', error: '', loading: true });
      try {
        const { data, error } = await replacementApi().from('librarycard')
          .select('librarycard_rfid')
          .eq('user_id', readerId)
          .eq('is_active', true)
          .is('deactivated_at', null)
          .limit(1)
          .maybeSingle();
        if (error) throw error;
        if (!data?.librarycard_rfid) throw new Error('No active library card is assigned. Please ask library staff to link your card.');
        if (current && version === request) setState({ qrPayload: createKioskQrPayload(data.librarycard_rfid), error: '', loading: false });
      } catch (cause) {
        if (current && version === request) setState({ qrPayload: '', error: cause instanceof Error ? cause.message : 'Your digital card could not be loaded.', loading: false });
      }
    };
    void load();
    const unsubscribe = subscribeToCardDirectory(() => { void load(); });
    return () => { current = false; unsubscribe(); };
  }, [readerId, enabled]);

  return state;
}
