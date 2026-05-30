/**
 * quickActions.ts — pure helpers for bot-quick-actions features.
 * All functions here are pure (no I/O) so they can be tested in isolation.
 */
import type { TelegramLinkRecord } from "../server/telegramAccess.ts";

// ---------------------------------------------------------------------------
// Feature 1: Undo inline after save
// ---------------------------------------------------------------------------

/** Inline keyboard with a single ↩️ Deshacer button. Stateless — movId encoded in callback_data. */
export function buildUndoKeyboard(movId: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return {
    inline_keyboard: [[{ text: "↩️ Deshacer", callback_data: `undo:${movId}` }]],
  };
}

/**
 * Scope guard for the undo callback.
 * Returns true only if the caller's dashboard/owner scope matches the movement's scope
 * AND the movement is not already soft-deleted.
 *
 * Never allows undoing a movement outside the caller's scope — security invariant.
 */
export function canUndoMovement(
  mov: { id: string; dashboard_id: string | null; owner_user_id: string | null; deleted_at: string | null },
  linked: Pick<TelegramLinkRecord, "dashboardId" | "ownerUserId" | "userId">,
): boolean {
  if (mov.deleted_at !== null) return false;

  if (mov.dashboard_id !== null) {
    return mov.dashboard_id === linked.dashboardId;
  }
  // Legacy owner scope
  return mov.owner_user_id !== null && mov.owner_user_id === linked.ownerUserId;
}

// ---------------------------------------------------------------------------
// Feature 2: Quick balance (saldo rápido)
// ---------------------------------------------------------------------------

export interface MovimientoLite {
  tipo: string;
  monto: number | string;
  moneda: string;
  created_at: string;
  deleted_at: string | null;
}

/** Compute net balance (ingresos − gastos) per currency from a list of movements. Ignores soft-deleted rows. */
export function computeQuickBalance(movs: MovimientoLite[]): { netARS: number; netUSD: number } {
  let netARS = 0;
  let netUSD = 0;

  for (const m of movs) {
    if (m.deleted_at !== null) continue;
    const amount = typeof m.monto === "number" ? m.monto : parseFloat(String(m.monto)) || 0;
    const sign = m.tipo === "ingreso" ? 1 : -1;
    if (m.moneda === "USD") {
      netUSD += sign * amount;
    } else {
      netARS += sign * amount;
    }
  }

  return { netARS, netUSD };
}

// ---------------------------------------------------------------------------
// Feature 3: setMyCommands per role
// ---------------------------------------------------------------------------

export interface BotCommand {
  command: string;
  description: string;
}

/** Read-only commands available to viewers. */
export const VIEWER_COMMANDS: BotCommand[] = [
  { command: "menu", description: "Abrir el menú principal" },
  { command: "cancel", description: "Cancelar la operación actual" },
  { command: "informes", description: "Generar informe por período" },
  { command: "exportar", description: "Exportar informe (CSV o PDF)" },
  { command: "recurrentes", description: "Ver recurrentes" },
  { command: "saldos", description: "Ver saldos por empresa" },
  { command: "buscar", description: "Buscar movimientos" },
  { command: "empresas", description: "Listar empresas activas" },
  { command: "categorias", description: "Listar categorías" },
  { command: "dashboard", description: "Abrir dashboard web" },
];

/** Full command list for owner and editor roles. */
export const FULL_COMMANDS: BotCommand[] = [
  { command: "menu", description: "Abrir el menú principal" },
  { command: "cancel", description: "Cancelar la operación actual" },
  { command: "informes", description: "Generar informe por período" },
  { command: "exportar", description: "Exportar informe (CSV o PDF)" },
  { command: "recurrente", description: "Configurar gasto/ingreso recurrente" },
  { command: "recurrentes", description: "Ver y gestionar recurrentes" },
  { command: "saldos", description: "Ver saldos por empresa" },
  { command: "buscar", description: "Buscar movimientos" },
  { command: "empresas", description: "Listar empresas activas" },
  { command: "categorias", description: "Listar categorías" },
  { command: "dashboard", description: "Abrir dashboard web" },
];

/** Returns the command list appropriate for the given dashboard role. */
export function getCommandsForRole(role: "owner" | "editor" | "viewer" | null): BotCommand[] {
  if (role === "viewer") return VIEWER_COMMANDS;
  return FULL_COMMANDS;
}

// ---------------------------------------------------------------------------
// Feature 4: Low-confidence note in review card
// Canonical implementation lives in server/extractionReview.ts (correct dependency
// direction: bot → server). Re-exported here for callers/tests importing from the bot module.
// ---------------------------------------------------------------------------

export { buildLowConfidenceNote, LOW_CONFIDENCE_THRESHOLD } from "../server/extractionReview.ts";
