import test from "node:test";
import assert from "node:assert/strict";

import { runDailyReminders } from "../../src/server/cronJobs/reminders.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabase(opts: {
  telegramUsers?: unknown[];
  appUsers?: unknown[];
} = {}) {
  const telegramUsers = opts.telegramUsers ?? [];
  const appUsers = opts.appUsers ?? [];

  return {
    from(table: string) {
      const self: any = {
        select: () => self,
        eq: () => self,
        not: () => self,
        in: (_col: string, _vals: unknown[]) => {
          // Filter appUsers by user_id if needed; for simplicity return all
          if (table === "app_users") {
            return Promise.resolve({ data: appUsers, error: null });
          }
          return self;
        },
        then(resolve: Function) {
          if (table === "usuarios") {
            return Promise.resolve({ data: telegramUsers, error: null }).then(resolve as any);
          }
          if (table === "app_users") {
            return Promise.resolve({ data: appUsers, error: null }).then(resolve as any);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve as any);
        },
      };
      return self;
    },
  };
}

function makeBot(sendFn?: (chatId: string | number, text: string, opts?: unknown) => Promise<unknown>) {
  const calls: Array<{ chatId: string | number; text: string }> = [];
  return {
    api: {
      async sendMessage(chatId: string | number, text: string, opts?: unknown) {
        calls.push({ chatId, text });
        if (sendFn) return sendFn(chatId, text, opts);
        return {};
      },
    },
    calls,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("runDailyReminders: bot=null still checks due email reminders and sends none when no users", async () => {
  const supabase = makeSupabase({ telegramUsers: [], appUsers: [] });
  const result = await runDailyReminders({ supabase: supabase as any, bot: null });
  assert.deepStrictEqual(result, { sent: 0 });
});

test("runDailyReminders: no telegram users returns {sent:0}", async () => {
  const supabase = makeSupabase({ telegramUsers: [], appUsers: [] });
  const bot = makeBot();
  const result = await runDailyReminders({ supabase: supabase as any, bot: bot as any });
  assert.deepStrictEqual(result, { sent: 0 });
  assert.strictEqual(bot.calls.length, 0);
});

test("runDailyReminders: due user with email channel receives email without bot", async () => {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  const emails: string[] = [];
  const supabase = makeSupabase({
    telegramUsers: [],
    appUsers: [{
      user_id: "user-email",
      email: "user@example.com",
      notification_hour: currentHour,
      notification_minute: currentMinute,
      notification_enabled: true,
      notification_telegram: false,
      notification_email: true,
    }],
  });
  const result = await runDailyReminders({
    supabase: supabase as any,
    bot: null,
    sendEmail: async (to) => { emails.push(to); },
  });
  assert.strictEqual(result.sent, 1);
  assert.deepStrictEqual(emails, ["user@example.com"]);
});

test("runDailyReminders: user with matching hour+minute receives message", async () => {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  const supabase = makeSupabase({
    telegramUsers: [{ chat_id: 12345, user_id: "user-1" }],
    appUsers: [{ user_id: "user-1", notification_hour: currentHour, notification_minute: currentMinute }],
  });
  const bot = makeBot();
  const result = await runDailyReminders({ supabase: supabase as any, bot: bot as any });
  assert.strictEqual(result.sent, 1);
  assert.strictEqual(bot.calls.length, 1);
  assert.strictEqual(bot.calls[0].chatId, 12345);
});

test("runDailyReminders: user with non-matching minute is not sent", async () => {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const differentMinute = (now.getUTCMinutes() + 5) % 60;

  const supabase = makeSupabase({
    telegramUsers: [{ chat_id: 12345, user_id: "user-1" }],
    appUsers: [{ user_id: "user-1", notification_hour: currentHour, notification_minute: differentMinute }],
  });
  const bot = makeBot();
  const result = await runDailyReminders({ supabase: supabase as any, bot: bot as any });
  assert.deepStrictEqual(result, { sent: 0 });
  assert.strictEqual(bot.calls.length, 0);
});

test("runDailyReminders: sendMessage throws is caught, loop continues, sent not incremented for failed", async () => {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  const supabase = makeSupabase({
    telegramUsers: [
      { chat_id: 11111, user_id: "user-1" },
      { chat_id: 22222, user_id: "user-2" },
    ],
    appUsers: [
      { user_id: "user-1", notification_hour: currentHour, notification_minute: currentMinute },
      { user_id: "user-2", notification_hour: currentHour, notification_minute: currentMinute },
    ],
  });

  let callCount = 0;
  const bot = makeBot(async (chatId) => {
    callCount++;
    if (chatId === 11111) throw new Error("Telegram error");
    return {};
  });

  const result = await runDailyReminders({ supabase: supabase as any, bot: bot as any });
  // sendMessage was attempted twice; first threw, second succeeded
  assert.strictEqual(callCount, 2);
  // Only the successful send counts
  assert.strictEqual(result.sent, 1);
});
