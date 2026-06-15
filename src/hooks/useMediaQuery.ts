import { useEffect, useState } from 'react';

/**
 * Reactive media-query match. Stdlib only. Seeds synchronously from
 * `matchMedia` so the first render is already correct (no flash), then updates
 * on viewport changes. Use to gate work that should only happen at a breakpoint
 * — e.g. mounting desktop-only content instead of rendering-then-hiding it.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}
