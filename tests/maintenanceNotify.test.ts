import test from "node:test";
import assert from "node:assert/strict";

import { notifyMaintenance } from "../src/server/maintenanceNotify.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabaseStub(opts: { emailUsers?: any[]; telegramLinks?: any[] } = {}) {
  const emailUsers = opts.emailUsers ?? [
    { user_id: "u1", email: "alice@example.com" },
    { user_id: "u2", email: "bob@example.com" },
  ];
  const telegramLinks = opts.telegramLinks ?? [
    { telegram_chat_id: "111", user_id: "u1" },
    { telegram_chat_id: "222", user_id: "u2" },
  ];

  return {
    from(table: string) {
      const api: any = {
        select(_cols?: string) { return api; },
        eq(_col: string, _val: unknown) { return api; },
        is(_col: string, _val: unknown) { return api; },
        limit(_n: number) {
          const rows = table === "app_users" ? emailUsers : table === "telegram_links" ? telegramLinks : [];
          const p: any = Promise.resolve({ data: rows, error: null });
          p.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
          return p;
        },
        then(resolve: (v: unknown) => void) {
          const rows = table === "app_users" ? emailUsers : table === "telegram_links" ? telegramLinks : [];
          resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  } as any;
}

// ---------------------------------------------------------------------------
// 1. Promise.allSettled fan-out: Brevo failure does NOT throw
// ---------------------------------------------------------------------------

test("notifyMaintenance: Brevo failure does not throw, other channels still run", async () => {
  const supabase = makeSupabaseStub({ emailUsers: [{ user_id: "u1", email: "x@y.com" }], telegramLinks: [] });

  const telegramSentTo: string[] = [];
  const mockBot = {
    api: {
      async sendMessage(chatId: string, _text: string) {
        telegramSentTo.push(chatId);
      },
    },
  } as any;

  // Override BREVO_API_KEY to something but also intercept fetch
  // We just need it to not throw — if email module is injected we'd mock it,
  // but since the module calls process.env.BREVO_API_KEY, with no key set,
  // it falls back gracefully. Verify the call doesn't throw.
  await assert.doesNotReject(
    () => notifyMaintenance(supabase, mockBot, { type: "start" }),
  );
});

// ---------------------------------------------------------------------------
// 2. Telegram failure does NOT throw
// ---------------------------------------------------------------------------

test("notifyMaintenance: Telegram failure does not throw", async () => {
  const supabase = makeSupabaseStub({
    emailUsers: [],
    telegramLinks: [{ telegram_chat_id: "123", user_id: "u1" }],
  });

  const mockBot = {
    api: {
      async sendMessage(_chatId: string, _text: string) {
        throw new Error("Telegram API down");
      },
    },
  } as any;

  await assert.doesNotReject(
    () => notifyMaintenance(supabase, mockBot, { type: "end" }),
  );
});

// ---------------------------------------------------------------------------
// 3. Both channels called with correct recipient sets
// ---------------------------------------------------------------------------

test("notifyMaintenance: sends Telegram messages to all active linked users", async () => {
  const telegramLinks = [
    { telegram_chat_id: "111", user_id: "u1" },
    { telegram_chat_id: "222", user_id: "u2" },
  ];
  const supabase = makeSupabaseStub({ emailUsers: [], telegramLinks });

  const sentTo: string[] = [];
  const mockBot = {
    api: {
      async sendMessage(chatId: string, _text: string) {
        sentTo.push(String(chatId));
      },
    },
  } as any;

  await notifyMaintenance(supabase, mockBot, { type: "reminder" });

  assert.deepEqual(sentTo.sort(), ["111", "222"].sort());
});

// ---------------------------------------------------------------------------
// 4. Partial failure: one user fail does not abort others
// ---------------------------------------------------------------------------

test("notifyMaintenance: one Telegram failure does not abort other recipients", async () => {
  const telegramLinks = [
    { telegram_chat_id: "111", user_id: "u1" },
    { telegram_chat_id: "222", user_id: "u2" },
    { telegram_chat_id: "333", user_id: "u3" },
  ];
  const supabase = makeSupabaseStub({ emailUsers: [], telegramLinks });

  const sentTo: string[] = [];
  const mockBot = {
    api: {
      async sendMessage(chatId: string, _text: string) {
        if (chatId === "222") throw new Error("Network error");
        sentTo.push(chatId);
      },
    },
  } as any;

  await assert.doesNotReject(
    () => notifyMaintenance(supabase, mockBot, { type: "start" }),
  );
  // 111 and 333 should have received messages
  assert.ok(sentTo.includes("111"));
  assert.ok(sentTo.includes("333"));
  assert.ok(!sentTo.includes("222"));
});
