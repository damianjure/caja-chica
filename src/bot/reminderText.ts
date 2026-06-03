import { InlineKeyboard } from "grammy";
import type { ReminderState } from "./reminderPrefs.ts";

export const REMINDER_QUICK_HOURS = [9, 12, 18, 21];

const hh = (h: number, m: number) =>
  `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export function buildReminderStatusText(s: ReminderState): string {
  if (!s.enabled) {
    return "⏰ *Recordatorio diario*\n\nEstado: *Desactivado*.\n\nPrendelo cuando quieras 👇";
  }
  const canales =
    [s.telegram ? "Telegram" : null, s.email ? "Mail" : null]
      .filter(Boolean)
      .join(" + ") || "ninguno";
  return `⏰ *Recordatorio diario*\n\nEstado: *Activado*\nHora: *${hh(s.hour, s.minute)}* (UTC)\nCanal: ${canales}`;
}

export function buildReminderKeyboard(s: ReminderState): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(s.enabled ? "🔕 Desactivar" : "🔔 Activar", s.enabled ? "rem_off" : "rem_on").row();
  if (s.enabled) {
    REMINDER_QUICK_HOURS.forEach((h, i) => {
      kb.text(`${String(h).padStart(2, "0")}:00`, `rem_h:${h}`);
      if (i % 2 === 1) kb.row();
    });
  }
  return kb;
}
