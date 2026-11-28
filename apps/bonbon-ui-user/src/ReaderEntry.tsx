import { useEffect, useState } from 'react';
import { App } from './App';
import { ReaderGuestHome } from './ReaderGuestHome';
import { supabase } from './lib/supabase';

/** The reader home stays available to guests; /kiosk is the separate card sign-in station. */
export function ReaderEntry() {
  const [entry, setEntry] = useState<'loading' | 'reader' | 'guest'>('loading');
  useEffect(() => {
    let active = true;
    if (!supabase) { setEntry('guest'); return; }
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setEntry(error || !data.user ? 'guest' : 'reader');
    }).catch(() => { if (active) setEntry('guest'); });
    return () => { active = false; };
  }, []);
  if (entry === 'reader') return <App />;
  if (entry === 'guest') return <ReaderGuestHome />;
  return <p role="status" className="sr-only">Opening the library…</p>;
}
