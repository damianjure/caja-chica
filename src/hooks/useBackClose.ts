import { useEffect, useRef } from 'react';

/**
 * Makes the device/browser Back button (and the Android gesture) close an open
 * modal instead of leaving the page. While `isOpen`, pushes a throwaway history
 * entry; a Back press pops it and fires `onClose`. If the modal is closed any
 * other way (X, save, confirm), the pushed entry is removed so Back keeps
 * working normally afterwards. Safe to use on several modals at once.
 */
export function useBackClose(isOpen: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  useEffect(() => {
    if (!isOpen) return;
    window.history.pushState({ __modal: true }, '');
    const onPop = () => onCloseRef.current();
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Closed without a Back press → drop the entry we pushed. (After a real
      // Back the entry is already gone, so history.state.__modal is false.)
      const state = window.history.state as { __modal?: boolean } | null;
      if (state && state.__modal) window.history.back();
    };
  }, [isOpen]);
}
