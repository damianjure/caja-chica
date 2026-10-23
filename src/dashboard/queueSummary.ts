import type { QueueSummary } from '../services/api';

export interface QueueSummaryView {
  title: string;
  saved: string[];
  failed: Array<{ id: string; text: string; reason: string }>;
  /** Every id shown, to mark them as seen when the user dismisses the notice. */
  ids: string[];
}

const REASONS: Record<string, string> = {
  processing_failed: 'No se pudo procesar',
  expired: 'Venció antes de que volviera la IA',
  forbidden: 'Ya no tenés permiso para cargar en este dashboard',
  unsupported: 'Este tipo de mensaje no se puede reprocesar',
};

const plural = (n: number, word: string) => `${n} ${word}${n !== 1 ? 's' : ''}`;

/**
 * Copy for the notice shown when queued web messages were processed or failed
 * while the user was away. Returns null when there is nothing to show.
 */
export function describeQueueSummary(summary: QueueSummary): QueueSummaryView | null {
  const { processed, failed } = summary;
  if (processed.length === 0 && failed.length === 0) return null;

  const title =
    processed.length > 0
      ? `La IA volvió: se guardaron ${plural(processed.length, 'mensaje')} que tenías en cola`
      : `No se pudo procesar ${plural(failed.length, 'mensaje')} que tenías en cola`;

  return {
    title,
    saved: processed.map((p) => {
      const label = p.description?.trim() || p.text_content?.trim() || 'Movimiento';
      return p.count > 1 ? `${label} (${p.count} movimientos)` : label;
    }),
    failed: failed.map((f) => ({
      id: f.id,
      text: f.text_content?.trim() || '',
      reason: REASONS[f.reason] ?? REASONS.processing_failed,
    })),
    ids: [...processed.map((p) => p.id), ...failed.map((f) => f.id)],
  };
}
