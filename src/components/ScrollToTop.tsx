import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

/** Botón flotante "volver arriba". Aparece tras scrollear; sube con animación suave. */
export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const toTop = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  };

  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={toTop}
      aria-label="Volver arriba"
      title="Volver arriba"
      className="anim-fade-in fixed bottom-4 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[var(--app-border-strong)] bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] shadow-[var(--app-shadow-md)] active:scale-[0.94] transition sm:bottom-[5.5rem] sm:right-6"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
