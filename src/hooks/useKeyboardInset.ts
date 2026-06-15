import { useEffect, useState } from 'react';

/**
 * Height (px) the on-screen keyboard overlaps the layout viewport, via the
 * `visualViewport` API. On iOS a `position: fixed` element stays pinned to the
 * layout viewport, so the keyboard covers bottom-anchored inputs — lift the
 * element by this value to keep it visible. Returns 0 when no keyboard (and on
 * browsers without `visualViewport`, e.g. older desktop).
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const overlap = window.innerHeight - vv.height - vv.offsetTop;
      // Ignore small viewport changes (address-bar collapse ~50px); a keyboard
      // is always much taller.
      setInset(overlap > 80 ? Math.round(overlap) : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}
