import { test } from "node:test";
import assert from "node:assert/strict";
import { readReminder, writeReminder } from "../src/bot/reminderPrefs.ts";

function fakeSupabase(row: any, captured: any = {}) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        single() { return Promise.resolve({ data: row, error: null }); },
        update(patch: any) { captured.patch = patch; return { eq: () => Promise.resolve({ error: null }) }; },
      };
    },
  };
}

test("readReminder — defaults cuando faltan campos", async () => {
  const r = await readReminder(fakeSupabase({}) as any, "u1");
  assert.equal(r.enabled, true);
  assert.equal(r.hour, 21);
  assert.equal(r.minute, 0);
});

test("readReminder — lee valores presentes", async () => {
  const r = await readReminder(fakeSupabase({ notification_enabled: false, notification_hour: 9, notification_minute: 30, notification_telegram: true, notification_email: true }) as any, "u1");
  assert.equal(r.enabled, false);
  assert.equal(r.hour, 9);
  assert.equal(r.minute, 30);
  assert.equal(r.email, true);
});

test("writeReminder — manda solo el patch dado (mapeado a columnas)", async () => {
  const captured: any = {};
  await writeReminder(fakeSupabase({}, captured) as any, "u1", { enabled: false });
  assert.deepEqual(captured.patch, { notification_enabled: false });
});

test("writeReminder — patch vacío no escribe", async () => {
  const captured: any = {};
  await writeReminder(fakeSupabase({}, captured) as any, "u1", {});
  assert.equal(captured.patch, undefined);
});
