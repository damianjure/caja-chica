import { useEffect, useRef, useState } from 'react';
import { Sparkles, SendHorizontal, Loader2, X, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { useBackClose } from '../../hooks/useBackClose';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

type HistoryMode = 'session' | 'local';

const SUGGESTIONS = [
  '¿Cuánto gasté este mes?',
  '¿En qué categoría gasto más?',
  '¿Cómo vienen los ingresos vs el mes pasado?',
];

const HISTORY_MODE_KEY = 'caja-chica:ask-history-mode';
const SESSION_HISTORY_KEY = 'caja-chica:ask-history-session';
const LOCAL_HISTORY_KEY = 'caja-chica:ask-history-local';
const MAX_STORED_MESSAGES = 30;

function storageFor(mode: HistoryMode): Storage {
  return mode === 'local' ? window.localStorage : window.sessionStorage;
}

function keyFor(mode: HistoryMode): string {
  return mode === 'local' ? LOCAL_HISTORY_KEY : SESSION_HISTORY_KEY;
}

function readHistoryMode(): HistoryMode {
  try {
    return window.localStorage.getItem(HISTORY_MODE_KEY) === 'local' ? 'local' : 'session';
  } catch {
    return 'session';
  }
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const msg = value as Record<string, unknown>;
  return (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string';
}

function readStoredMessages(mode: HistoryMode): ChatMessage[] {
  try {
    const raw = storageFor(mode).getItem(keyFor(mode));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isChatMessage).slice(-MAX_STORED_MESSAGES).map((m) => ({
      role: m.role,
      content: m.content.slice(0, 1000),
      ...(m.isError ? { isError: true } : {}),
    }));
  } catch {
    return [];
  }
}

function writeStoredMessages(mode: HistoryMode, messages: ChatMessage[]) {
  try {
    const safe = messages
      .filter((m) => !m.isError)
      .slice(-MAX_STORED_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
    storageFor(mode).setItem(keyFor(mode), JSON.stringify(safe));
  } catch {
    // If storage is unavailable/full, the chat still works for the current render.
  }
}

function clearStoredMessages(mode: HistoryMode) {
  try {
    storageFor(mode).removeItem(keyFor(mode));
  } catch {
    // ignore storage failures
  }
}

/**
 * Floating Q&A chat backed by POST /api/ask. Mounted once in DashboardApp so
 * it is available from every tab. Multi-turn: previous messages travel as
 * `history` (server caps turns/length); errors stay out of the history sent.
 *
 * Privacy invariant: conversation history is client-owned only. The user can
 * keep it for this browser session (sessionStorage) or persist it on this
 * device (localStorage). No transcript is stored server-side.
 */
export default function AskChat() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [historyMode, setHistoryMode] = useState<HistoryMode>(() => readHistoryMode());
  const [messages, setMessages] = useState<ChatMessage[]>(() => readStoredMessages(readHistoryMode()));
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, loading, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Android/browser Back closes the panel instead of leaving the app — same
  // contract as every dashboard modal.
  useBackClose(open, () => setOpen(false));

  useEffect(() => {
    try { window.localStorage.setItem(HISTORY_MODE_KEY, historyMode); } catch {}
    writeStoredMessages(historyMode, messages);
  }, [historyMode, messages]);

  const changeHistoryMode = (mode: HistoryMode) => {
    if (mode === historyMode) return;

    const current = messages.filter((m) => !m.isError);
    writeStoredMessages(mode, current);
    if (historyMode === 'local') clearStoredMessages('local');
    setHistoryMode(mode);
    setMessages(readStoredMessages(mode));
  };

  const clearConversation = () => {
    clearStoredMessages(historyMode);
    setMessages([]);
  };

  const submit = async (q: string) => {
    const trimmed = q.trim().slice(0, 500);
    if (!trimmed || loading) return;
    const history = messages
      .filter((m) => !m.isError)
      .map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setQuestion('');
    setLoading(true);
    try {
      const res = await api.ask(trimmed, history);
      setMessages((prev) => [...prev, { role: 'assistant', content: res.answer }]);
    } catch (err) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        isError: true,
        content: api.isApiError(err) && err.status === 503
          ? 'La IA no está disponible ahora mismo. Probá en unos minutos.'
          : 'No pude responder la consulta. Intentá de nuevo.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir asistente de consultas"
        className="fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+5rem)] sm:right-6 sm:bottom-6 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--app-strong-surface)] text-[var(--app-strong-text)] shadow-[0_8px_24px_rgba(0,0,0,0.28)] transition hover:scale-105 active:scale-95"
      >
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </button>
    );
  }

  return (
    <>
      {/* Mobile-only dim backdrop (variant B): lifts the panel off the dashboard.
          Desktop (variant A) keeps the dashboard visible — no overlay. */}
      <div
        onClick={() => setOpen(false)}
        aria-hidden="true"
        className="fixed inset-0 z-30 bg-black/45 sm:hidden"
      />
      <div className="fixed z-40 inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[360px] flex flex-col rounded-2xl border border-[var(--app-strong-surface)] sm:border-[var(--app-border-strong)] bg-[var(--app-surface-2)] shadow-[0_20px_56px_rgba(0,0,0,0.55)] sm:shadow-[0_16px_48px_rgba(0,0,0,0.4)] overflow-hidden">
      <div className="border-b border-[var(--app-border)] bg-[var(--app-surface-3)] sm:bg-transparent px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[var(--app-text-3)]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[var(--app-text-1)]">Preguntale a tus números</h2>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearConversation}
                aria-label="Limpiar conversación"
                className="rounded-lg p-1.5 text-[var(--app-text-3)] transition hover:text-[var(--app-text-1)]"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar asistente"
              className="rounded-lg p-1.5 text-[var(--app-text-3)] transition hover:text-[var(--app-text-1)]"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <label className="mt-2 flex items-center gap-2 text-[11px] text-[var(--app-text-3)]">
          <span className="shrink-0">Historial</span>
          <select
            value={historyMode}
            onChange={(e) => changeHistoryMode(e.target.value === 'local' ? 'local' : 'session')}
            aria-label="Dónde guardar el historial del asistente"
            className="min-w-0 flex-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-3)] px-2 py-1 text-[11px] text-[var(--app-text-2)]"
          >
            <option value="session">Solo esta sesión</option>
            <option value="local">Este dispositivo</option>
          </select>
        </label>
        <p className="mt-1 text-[10px] leading-snug text-[var(--app-text-4)]">
          El historial queda en tu navegador; no se guarda en el servidor.
        </p>
      </div>

      <div ref={listRef} role="log" aria-live="polite" className="flex max-h-[50vh] sm:max-h-[380px] min-h-[160px] flex-col gap-2.5 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !loading && (
          <div className="my-auto">
            <p className="mb-2 text-sm text-[var(--app-text-3)]">Preguntá lo que quieras sobre tus movimientos:</p>
            <div className="flex flex-col items-start gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  className="rounded-full border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-2)] transition hover:text-[var(--app-text-1)]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === 'user'
                ? 'self-end max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--app-strong-surface)] px-3.5 py-2 text-sm text-[var(--app-strong-text)]'
                : m.isError
                  ? 'self-start max-w-[90%] rounded-2xl rounded-bl-sm border border-[var(--app-amber-border)] bg-[var(--app-amber-surface)] px-3.5 py-2 text-sm text-[var(--app-amber-text)]'
                  : 'self-start max-w-[90%] rounded-2xl rounded-bl-sm bg-[var(--app-surface-3)] px-3.5 py-2 text-sm text-[var(--app-text-1)] whitespace-pre-wrap leading-relaxed'
            }
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="self-start flex items-center gap-2 rounded-2xl rounded-bl-sm bg-[var(--app-surface-3)] px-3.5 py-2 text-sm text-[var(--app-text-3)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            Analizando tus movimientos…
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-[var(--app-border)] px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit(question);
        }}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          enterKeyHint="send"
          autoComplete="off"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="Escribí tu consulta…"
          aria-label="Pregunta sobre tus movimientos"
          className="flex-1 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-3)] px-3 py-2 text-sm text-[var(--app-text-1)] placeholder:text-[var(--app-text-4)] focus:outline-none focus:ring-2 focus:ring-[var(--app-border-strong)]"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          aria-label="Enviar pregunta"
          className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-3)] px-3 py-2 text-[var(--app-text-2)] transition hover:text-[var(--app-text-1)] disabled:opacity-50"
        >
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
      </div>
    </>
  );
}
