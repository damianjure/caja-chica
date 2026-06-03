import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminderStatusText, REMINDER_QUICK_HOURS } from "../src/bot/reminderText.ts";

test("status — activado muestra hora y canal", () => {
  const t = buildReminderStatusText({ enabled: true, telegram: true, email: false, hour: 9, minute: 0 });
  assert.match(t, /Activado/i);
  assert.match(t, /09:00/);
  assert.match(t, /Telegram/i);
});
test("status — desactivado lo dice", () => {
  const t = buildReminderStatusText({ enabled: false, telegram: true, email: false, hour: 9, minute: 0 });
  assert.match(t, /Desactivado/i);
});
test("quick hours fijas 9/12/18/21", () => {
  assert.deepEqual(REMINDER_QUICK_HOURS, [9, 12, 18, 21]);
});
