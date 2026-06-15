import { useEffect, useState } from 'react';

/**
 * Tracks browser connectivity via the `online`/`offline` window events.
 * Seeds from `navigator.onLine`. Stdlib only — no deps. Note: `onLine` only
 * knows about the network interface, not whether the backend is reachable, so
 * treat it as a hint, not a guarantee.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  return online;
}
