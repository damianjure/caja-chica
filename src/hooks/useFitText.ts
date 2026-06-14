import { useLayoutEffect, useRef } from 'react';

/**
 * Shrinks a single-line text element's font-size just enough to fit its
 * container width, so long numbers never overflow their card. Imperative
 * (writes element.style.fontSize), no re-render. Re-fits on container resize
 * and when the text changes. The element must be block, full-width and
 * `whitespace-nowrap`. Returns a ref to attach to that element.
 */
export function useFitText<T extends HTMLElement>(text: string, maxPx = 24, minPx = 14) {
  const ref = useRef<T>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = `${maxPx}px`;
      const avail = el.clientWidth;
      const needed = el.scrollWidth;
      if (avail > 0 && needed > avail) {
        el.style.fontSize = `${Math.max(minPx, Math.floor(maxPx * (avail / needed)))}px`;
      }
    };
    fit();
    // Observe the parent (not the element) so our own font change doesn't loop.
    const parent = el.parentElement;
    const ro = new ResizeObserver(fit);
    if (parent) ro.observe(parent);
    return () => ro.disconnect();
  }, [text, maxPx, minPx]);

  return ref;
}
