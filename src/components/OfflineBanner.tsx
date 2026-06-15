import { useEffect, useRef, useState } from 'react';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

// Fixed top pill: shows while offline (data may be stale), then a brief
// "reconnected" confirmation. Lives outside any transformed ancestor so its
// `fixed` positioning isn't trapped (same reason the bottom-nav sits outside
// the pull-to-refresh wrapper). Respects the iOS safe-area top inset.
export function OfflineBanner() {
  const online = useOnlineStatus();
  const [showReconnected, setShowReconnected] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setShowReconnected(false);
      return;
    }
    if (wasOffline.current) {
      wasOffline.current = false;
      setShowReconnected(true);
      const t = setTimeout(() => setShowReconnected(false), 2500);
      return () => clearTimeout(t);
    }
  }, [online]);

  if (online && !showReconnected) return null;

  const offline = !online;
  return (
    <div
      className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[70] -translate-x-1/2 px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-[var(--app-shadow-md)] ${
          offline
            ? 'border-[var(--app-amber-border)] bg-[var(--app-amber-surface)] text-[var(--app-amber-text)]'
            : 'border-[var(--app-green-border)] bg-[var(--app-green-surface)] text-[var(--chart-income)]'
        }`}
      >
        {offline ? <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <Wifi className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        {offline ? 'Sin conexión — los datos pueden estar desactualizados' : 'Conexión restablecida'}
      </div>
    </div>
  );
}
