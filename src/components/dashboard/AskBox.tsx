import { useState } from 'react';
import { Sparkles, SendHorizontal, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

const SUGGESTIONS = [
  '¿Cuánto gasté este mes?',
  '¿En qué categoría gasto más?',
  '¿Cómo vienen los ingresos vs el mes pasado?',
];

/**
 * Natural-language Q&A box backed by POST /api/ask. Read-only: the server
 * computes every number over the caller's scoped data.
 */
export default function AskBox() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (q: string) => {
    const trimmed = q.trim().slice(0, 500);
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setAnswer(null);
    setAsked(trimmed);
    try {
      const res = await api.ask(trimmed);
      setAnswer(res.answer);
    } catch (err) {
      setError(
        api.isApiError(err) && err.status === 503
          ? 'La IA no está disponible ahora mismo. Probá en unos minutos.'
          : 'No pude responder la consulta. Intentá de nuevo.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-[var(--app-text-3)]" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-[var(--app-text-1)]">Preguntale a tus números</h2>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Ej: ¿cuánto gasté en supermercado este mes?"
          aria-label="Pregunta sobre tus movimientos"
          className="flex-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-sm text-[var(--app-text-1)] placeholder:text-[var(--app-text-4)] focus:outline-none focus:ring-2 focus:ring-[var(--app-border-strong)]"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          aria-label="Enviar pregunta"
          className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3 py-2 text-[var(--app-text-2)] transition hover:text-[var(--app-text-1)] disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SendHorizontal className="h-4 w-4" aria-hidden="true" />}
        </button>
      </form>

      {!asked && !loading && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setQuestion(s);
                submit(s);
              }}
              className="rounded-full border border-[var(--app-border)] px-2.5 py-1 text-xs text-[var(--app-text-3)] transition hover:text-[var(--app-text-1)]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {(loading || answer || error) && (
        <div className="mt-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-2)] px-3.5 py-3" role="status" aria-live="polite">
          {asked && <p className="text-xs text-[var(--app-text-3)] mb-1.5">«{asked}»</p>}
          {loading && <p className="text-sm text-[var(--app-text-2)]">Analizando tus movimientos…</p>}
          {answer && <p className="text-sm text-[var(--app-text-1)] whitespace-pre-wrap leading-relaxed">{answer}</p>}
          {error && <p className="text-sm text-[var(--app-amber-text)]">{error}</p>}
        </div>
      )}
    </section>
  );
}
