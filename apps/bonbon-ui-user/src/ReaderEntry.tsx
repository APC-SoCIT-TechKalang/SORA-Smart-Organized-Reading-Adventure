import { useEffect, useState } from 'react';
import { App } from './App';
import { supabase } from './lib/supabase';

/** Keep the main reader route private while guests browse through /kiosk. */
export function ReaderEntry() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    if (!supabase) { window.location.replace('/kiosk'); return; }
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user) window.location.replace('/kiosk');
      else setReady(true);
    }).catch(() => { if (active) window.location.replace('/kiosk'); });
    return () => { active = false; };
  }, []);
  return ready ? <App /> : <p role="status" className="sr-only">Opening the library…</p>;
}
