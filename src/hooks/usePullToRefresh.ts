import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 70; // px pulled (post-resistance) to trigger a refresh
const MAX = 110; // cap so the indicator never runs away

/**
 * Pull-to-refresh for touch devices. Listens on window: a downward drag that
 * starts at the top of the page (scrollY === 0) grows a pull distance with
 * resistance; releasing past THRESHOLD fires onRefresh. No-op on desktop
 * (no touch events). Stdlib only, no external dependency.
 */
export function usePullToRefresh(onRefresh: () => void) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const pullRef = useRef(0);
  const refreshingRef = useRef(false);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  });

  useEffect(() => {
    const setP = (v: number) => { pullRef.current = v; setPull(v); };
    const setR = (v: boolean) => { refreshingRef.current = v; setRefreshing(v); };

    const onStart = (e: TouchEvent) => {
      if (refreshingRef.current || window.scrollY > 0) { start.current = null; return; }
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onMove = (e: TouchEvent) => {
      if (start.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - start.current.y;
      const dx = e.touches[0].clientX - start.current.x;
      if (dy <= 0 || window.scrollY > 0) { if (pullRef.current) setP(0); return; }
      // Only engage on a vertical-dominant drag, so horizontal scrollers (tabs,
      // filter rows) keep working. Once engaged (pullRef > 0), stay engaged.
      if (pullRef.current === 0 && dy <= Math.abs(dx)) return;
      setDragging(true);
      setP(Math.min(MAX, dy * 0.5));
      if (e.cancelable) e.preventDefault(); // hold the page so the pull reads as intentional
    };
    const onEnd = () => {
      if (start.current === null) return;
      start.current = null;
      setDragging(false);
      if (pullRef.current >= THRESHOLD) {
        setR(true);
        setP(THRESHOLD);
        onRefreshRef.current();
        window.setTimeout(() => { setR(false); setP(0); }, 900);
      } else {
        setP(0);
      }
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return { pull, refreshing, dragging };
}
