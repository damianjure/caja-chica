import { useEffect, useRef } from 'react';

/**
 * Traps the browser/Android Back button on the app's root so it asks before
 * leaving. Pushes a sentinel history entry on mount; a Back press pops it and
 * fires `onAttempt` (show a confirm). It only fires when the sentinel itself is
 * popped — modal Back-closes ([[useBackClose]]) sit ABOVE the sentinel, so
 * closing a modal with Back lands on the sentinel (`state.__exit === true`) and
 * is ignored here. After the confirm: call `stayInApp()` to re-trap (cancel) or
 * `leaveApp()` to proceed with the Back navigation (confirm).
 */
export function useBackExitGuard(onAttempt: () => void) {
  const onAttemptRef = useRef(onAttempt);
  useEffect(() => { onAttemptRef.current = onAttempt; });

  useEffect(() => {
    window.history.pushState({ __exit: true }, '');
    const onPop = () => {
      const state = window.history.state as { __exit?: boolean } | null;
      if (state && state.__exit) return; // still on the sentinel (e.g. a modal closed) — not an exit
      onAttemptRef.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      const state = window.history.state as { __exit?: boolean } | null;
      if (state && state.__exit) window.history.back();
    };
  }, []);
}

/** Cancel path: re-arm the trap so Back keeps asking. */
export function stayInApp() {
  window.history.pushState({ __exit: true }, '');
}

/** Confirm path: proceed with the Back navigation the user attempted. */
export function leaveApp() {
  window.history.back();
}
