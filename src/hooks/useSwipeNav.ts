import { useEffect, useRef, type RefObject } from 'react';

const THRESHOLD = 70; // px of horizontal travel to count as a section swipe
const DOMINANCE = 1.8; // horizontal must beat vertical by this factor

/**
 * Horizontal swipe navigation between sections. Attaches touch listeners to
 * `ref` and calls onPrev/onNext on a clear left/right swipe. Bails when the
 * gesture starts inside a horizontally-scrollable element (tabs, filter rows,
 * charts) so those keep scrolling. Stdlib only; no-op on desktop (no touch).
 */
export function useSwipeNav<T extends HTMLElement>(
  ref: RefObject<T | null>,
  onPrev: () => void,
  onNext: () => void,
) {
  const onPrevRef = useRef(onPrev);
  const onNextRef = useRef(onNext);
  useEffect(() => { onPrevRef.current = onPrev; onNextRef.current = onNext; });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let sx = 0;
    let sy = 0;
    let armed = false;

    const startsInHScroller = (target: EventTarget | null) => {
      let n = target as HTMLElement | null;
      while (n && n !== el) {
        const s = getComputedStyle(n);
        if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && n.scrollWidth > n.clientWidth + 4) return true;
        n = n.parentElement;
      }
      return false;
    };

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { armed = false; return; }
      armed = !startsInHScroller(e.target);
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      if (!armed) return;
      armed = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx;
      const dy = t.clientY - sy;
      if (Math.abs(dx) > THRESHOLD && Math.abs(dx) > Math.abs(dy) * DOMINANCE) {
        if (dx < 0) onNextRef.current();
        else onPrevRef.current();
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [ref]);
}
