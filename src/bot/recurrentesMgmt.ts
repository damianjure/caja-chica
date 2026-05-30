/**
 * recurrentesMgmt.ts — pure helpers for the /recurrentes bot management command.
 * No I/O — all functions are pure and unit-testable.
 */
import type { TelegramLinkRecord } from "../server/telegramAccess.ts";
import { escapeMd } from "./utils.ts";

// ---------------------------------------------------------------------------
// Callback-data prefixes (stateless, encoded id)
// ---------------------------------------------------------------------------

/** Callback prefix for pausing an active recurrente. Full format: `rec_pause:<id>` */
export const RECURRENTE_PAUSE_PREFIX = "rec_pause:";

/** Callback prefix for reactivating a paused recurrente. Full format: `rec_on:<id>` */
export const RECURRENTE_ON_PREFIX = "rec_on:";

// ---------------------------------------------------------------------------
// Row formatter
// ---------------------------------------------------------------------------

export interface RecurrenteLite {
  id: string;
  monto: number | string;
  tipo: string;
  moneda: string;
  frecuencia: string;
  descripcion?: string | null;
  empresa_nombre?: string | null;
  is_active: boolean;
  deleted_at?: string | null;
  next_run_label: string;
}

const FRECUENCIA_LABELS: Record<string, string> = {
  diario: "diario",
  semanal: "semanal",
  quincenal: "quincenal",
  mensual: "mensual",
  anual: "anual",
};

/**
 * Formats a single recurrente as one line of MarkdownV1 text.
 * User-provided fields (descripcion) are escaped.
 */
export function buildRecurrenteRow(rec: RecurrenteLite): string {
  const tipoLabel = rec.tipo === "ingreso" ? "Ingreso" : "Gasto";
  const tipoIcon = rec.tipo === "ingreso" ? "🟢" : "🔴";
  const statusIcon = rec.is_active ? "✅" : "⏸";
  const statusLabel = rec.is_active ? "activo" : "pausado";

  const desc = rec.descripcion ? escapeMd(String(rec.descripcion)) : "Sin descripción";
  const frecLabel = FRECUENCIA_LABELS[rec.frecuencia] ?? rec.frecuencia;

  return `${tipoIcon} *${desc}* — ${rec.monto} ${rec.moneda} (${frecLabel})\n  ${statusIcon} ${statusLabel} · próximo: ${rec.next_run_label} · ${tipoLabel}`;
}

// ---------------------------------------------------------------------------
// Full list renderer
// ---------------------------------------------------------------------------

/**
 * Renders the complete list of recurrentes as a MarkdownV1 string.
 * Returns a friendly empty-state message if the array is empty.
 */
export function buildRecurrentesListText(recs: RecurrenteLite[]): string {
  if (recs.length === 0) {
    return "📋 No tenés recurrentes configurados aún\\. Creá uno con /recurrente\\.".replace(/\\\./g, ".");
  }

  const header = "🔄 *Tus recurrentes*\n\n";
  const rows = recs.map((r, i) => `${i + 1}\\. ${buildRecurrenteRow(r)}`.replace(/\\\./g, `${i + 1}. `)).join("\n\n");

  // Build cleanly without double-escaped dots
  const lines = recs.map((r, i) => `${i + 1}. ${buildRecurrenteRow(r)}`);
  return header + lines.join("\n\n");
}

// ---------------------------------------------------------------------------
// Per-item inline keyboard
// ---------------------------------------------------------------------------

export interface RecurrenteKeyboardItem {
  id: string;
  is_active: boolean;
}

/**
 * Builds the action keyboard for a single recurrente.
 * Active → shows Pause button; Inactive → shows Activate button.
 * Callback data is stateless: `rec_pause:<id>` or `rec_on:<id>`.
 */
export function buildRecurrenteActionKeyboard(item: RecurrenteKeyboardItem): {
  inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
} {
  if (item.is_active) {
    return {
      inline_keyboard: [[
        { text: "⏸ Pausar", callback_data: `${RECURRENTE_PAUSE_PREFIX}${item.id}` },
      ]],
    };
  }
  return {
    inline_keyboard: [[
      { text: "▶️ Reactivar", callback_data: `${RECURRENTE_ON_PREFIX}${item.id}` },
    ]],
  };
}

// ---------------------------------------------------------------------------
// Scope guard for toggle
// ---------------------------------------------------------------------------

export interface RecurrenteScopeRow {
  dashboard_id: string | null;
  owner_user_id: string | null;
  deleted_at: string | null;
}

/**
 * Returns true only if the caller's scope matches the recurrente's scope
 * AND the recurrente is not soft-deleted.
 *
 * This guard is checked BEFORE issuing the UPDATE, and the UPDATE itself
 * also applies the scope filter (defense-in-depth).
 */
export function canToggleRecurrente(
  rec: RecurrenteScopeRow,
  linked: Pick<TelegramLinkRecord, "dashboardId" | "ownerUserId">,
): boolean {
  if (rec.deleted_at !== null) return false;

  if (rec.dashboard_id !== null) {
    return rec.dashboard_id === linked.dashboardId;
  }
  // Legacy owner scope
  return rec.owner_user_id !== null && rec.owner_user_id === linked.ownerUserId;
}
