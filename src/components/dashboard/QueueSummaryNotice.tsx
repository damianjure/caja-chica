import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/Button';
import type { QueueSummaryView } from '../../dashboard/queueSummary';

interface QueueSummaryNoticeProps {
  view: QueueSummaryView;
  canWriteData: boolean;
  onRetry: (text: string) => void;
  onDismiss: () => void;
}

/**
 * Shown when messages the user queued while the AI was down have been
 * processed (or could not be): what was saved, and what needs to be sent again.
 */
export function QueueSummaryNotice({ view, canWriteData, onRetry, onDismiss }: QueueSummaryNoticeProps) {
  return (
    <div role="status" className="rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] p-4 shadow-[var(--app-shadow-sm)] text-sm space-y-3">
      <p className="flex items-start gap-2 font-semibold text-[var(--app-text-1)]">
        {view.saved.length > 0
          ? <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-[var(--chart-income)]" aria-hidden="true" />
          : <AlertTriangle className="h-5 w-5 flex-shrink-0 text-[var(--app-amber-text)]" aria-hidden="true" />}
        {view.title}
      </p>

      {view.saved.length > 0 && (
        <ul className="space-y-1 pl-7 text-[var(--app-text-2)]">
          {view.saved.map((line, i) => <li key={i}>{line}</li>)}
        </ul>
      )}

      {view.failed.length > 0 && (
        <div className="space-y-2 pl-7">
          {view.saved.length > 0 && (
            <p className="font-semibold text-[var(--app-amber-text)]">Estos no se pudieron procesar:</p>
          )}
          <ul className="space-y-2">
            {view.failed.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 text-[var(--app-text-2)]">
                  {f.text ? <>“{f.text}” · </> : null}
                  <span className="text-[var(--app-text-3)]">{f.reason}</span>
                </span>
                {canWriteData && f.text && (
                  <Button variant="secondary" size="sm" onClick={() => onRetry(f.text)}>Cargar de nuevo</Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end">
        <Button variant="primary" size="sm" onClick={onDismiss}>Entendido</Button>
      </div>
    </div>
  );
}
