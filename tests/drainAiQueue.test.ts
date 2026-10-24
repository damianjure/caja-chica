import test from "node:test";
import assert from "node:assert/strict";

import { runDrainAiQueue } from "../src/server/cronJobs/drainAiQueue.ts";
import { queueAuthorId, type AiQueueItem } from "../src/server/aiQueue.ts";
import type { GenAILike } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One recorded query: table, operation, payload and the filters applied to it. */
type Query = {
  table: string;
  op: "select" | "insert" | "update" | "delete";
  payload: unknown;
  eq: Record<string, unknown>;
  in: Record<string, unknown[]>;
  lt: Record<string, unknown>;
};

/**
 * Chainable Supabase fake. Every query method records itself on the query and
 * returns the same builder; awaiting the builder resolves a canned result.
 */
function fakeSupabase(opts: {
  queue?: AiQueueItem[];
  expired?: AiQueueItem[];
  movimientosInsertError?: unknown;
  roles?: Record<string, string | null>;
}) {
  let movementSeq = 0;
  const queries: Query[] = [];
  const supabase = {
    from(table: string) {
      const q: Query = { table, op: "select", payload: undefined, eq: {}, in: {}, lt: {} };
      queries.push(q);
      const resolve = () => {
        if (table === "pending_ai_queue" && q.op === "select") {
          return { data: "expires_at" in q.lt ? opts.expired ?? [] : opts.queue ?? [], error: null };
        }
        if (table === "movimientos" && q.op === "insert") {
          if (opts.movimientosInsertError) return { data: null, error: opts.movimientosInsertError };
          // .insert(...).select() returns the created rows (persistTelegramMovement reads data[0]).
          return { data: [{ id: `mov-${++movementSeq}` }], error: null };
        }
        if (table === "dashboard_members" && q.op === "select") {
          const userId = String(q.eq.user_id);
          const role = opts.roles && userId in opts.roles ? opts.roles[userId] : "owner";
          return { data: role ? [{ role, status: "active" }] : [], error: null };
        }
        return { data: [], error: null };
      };
      const builder: any = new Proxy({}, {
        get(_target, prop: string) {
          if (prop === "then") {
            return (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
              Promise.resolve(resolve()).then(onFulfilled, onRejected);
          }
          return (...args: unknown[]) => {
            if (prop === "insert" || prop === "update" || prop === "delete") {
              q.op = prop;
              q.payload = args[0];
            } else if (prop === "eq") q.eq[String(args[0])] = args[1];
            else if (prop === "in") q.in[String(args[0])] = args[1] as unknown[];
            else if (prop === "lt") q.lt[String(args[0])] = args[1];
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { supabase, queries };
}

/** Status updates written to a queue item, in order. */
function queueUpdates(queries: Query[], id: string) {
  return queries
    .filter((q) => q.table === "pending_ai_queue" && q.op === "update" && q.eq.id === id)
    .map((q) => q.payload as Record<string, any>);
}

function finalStatus(queries: Query[], id: string) {
  const withStatus = queueUpdates(queries, id).filter((p) => "status" in p);
  return withStatus.at(-1);
}

function item(id: string, over: Partial<AiQueueItem> = {}): AiQueueItem {
  return {
    id,
    dashboard_id: "dashboard-1",
    owner_user_id: "user-1",
    channel: "web",
    chat_id: null,
    kind: "web_text",
    text_content: `texto ${id}`,
    file_ids: null,
    mime_types: null,
    created_at: "2026-10-01T00:00:00.000Z",
    expires_at: "2099-01-01T00:00:00.000Z",
    retry_count: 0,
    status: "pending",
    processed_at: null,
    result: null,
    seen_at: null,
    ...over,
  };
}

const TWO_ITEMS_JSON = JSON.stringify({
  intent: "REGISTRAR",
  items: [
    { tipo: "egreso", moneda: "ARS", monto: 100, categoria: "Otros", descripcion: "nafta" },
    { tipo: "egreso", moneda: "ARS", monto: 50, categoria: "Otros", descripcion: "peaje" },
  ],
});

function genAIReturning(text: string): GenAILike {
  return { models: { async generateContent() { return { text }; } } };
}

function fakeBot() {
  const messages: Array<{ chatId: number; text: string }> = [];
  return {
    messages,
    bot: {
      api: {
        async getFile() { return {}; },
        async sendMessage(chatId: number, text: string) { messages.push({ chatId, text }); return {}; },
      },
    },
  };
}

const noBot = { bot: null, botToken: undefined };

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

test("drain web item — saves all movements in one insert and marks the item processed (not deleted)", async () => {
  const { supabase, queries } = fakeSupabase({ queue: [item("q1")] });
  const result = await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, ...noBot });

  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  const inserts = queries.filter((q) => q.table === "movimientos" && q.op === "insert");
  assert.equal(inserts.length, 1);
  assert.equal((inserts[0].payload as unknown[]).length, 2);
  const final = finalStatus(queries, "q1");
  assert.equal(final?.status, "processed");
  assert.equal(final?.result.count, 2);
  assert.ok(final?.processed_at);
  assert.equal(queries.some((q) => q.table === "pending_ai_queue" && q.op === "delete" && q.eq.id === "q1"), false);
});

test("drain web item — insert error keeps the item pending and counts a retry", async () => {
  const { supabase, queries } = fakeSupabase({ queue: [item("q1")], movimientosInsertError: { message: "insert failed" } });
  const result = await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, ...noBot });

  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(queueUpdates(queries, "q1"), [{ retry_count: 1 }]);
});

test("drain — the last allowed retry marks the item failed instead of dropping it", async () => {
  const { supabase, queries } = fakeSupabase({
    queue: [item("q1", { retry_count: 2 })],
    movimientosInsertError: { message: "insert failed" },
  });
  await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, ...noBot });

  const final = finalStatus(queries, "q1");
  assert.equal(final?.status, "failed");
  assert.equal(final?.result.reason, "processing_failed");
  assert.equal(final?.retry_count, 3);
});

test("drain — a 400 on one item does not stop the queue (not an outage)", async () => {
  const { supabase, queries } = fakeSupabase({ queue: [item("bad", { text_content: "texto raro" }), item("good")] });
  const genAI: GenAILike = {
    models: {
      async generateContent(args: any) {
        if (String(args.contents).includes("texto raro")) {
          throw Object.assign(new Error("Invalid argument"), { status: 400 });
        }
        return { text: TWO_ITEMS_JSON };
      },
    },
  };
  const result = await runDrainAiQueue({ supabase: supabase as any, genAI, genAI2: null, ...noBot });

  assert.equal(result.stopped, false);
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(queueUpdates(queries, "bad"), [{ retry_count: 1 }]);
  assert.equal(finalStatus(queries, "good")?.status, "processed");
});

test("drain — AI still down: stops and leaves items pending", async () => {
  const { supabase, queries } = fakeSupabase({ queue: [item("q1")] });
  const genAI: GenAILike = {
    models: { async generateContent() { throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 }); } },
  };
  const result = await runDrainAiQueue({ supabase: supabase as any, genAI, genAI2: null, ...noBot });

  assert.equal(result.stopped, true);
  assert.deepEqual(queueUpdates(queries, "q1"), []);
});

// ---------------------------------------------------------------------------
// Permissions and expiry
// ---------------------------------------------------------------------------

test("drain — an author who is no longer allowed to write gets the item failed as forbidden", async () => {
  const { supabase, queries } = fakeSupabase({ queue: [item("q1", { owner_user_id: "viewer-1" })], roles: { "viewer-1": "viewer" } });
  const result = await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, ...noBot });

  assert.equal(result.processed, 0);
  assert.equal(finalStatus(queries, "q1")?.result.reason, "forbidden");
  assert.equal(queries.some((q) => q.table === "movimientos" && q.op === "insert"), false);
});

test("drain — an author removed from the dashboard gets the item failed as forbidden", async () => {
  const { supabase, queries } = fakeSupabase({ queue: [item("q1", { owner_user_id: "gone-1" })], roles: { "gone-1": null } });
  await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, ...noBot });
  assert.equal(finalStatus(queries, "q1")?.result.reason, "forbidden");
});

test("drain — expired pending items are marked failed (expired), not deleted", async () => {
  const { supabase, queries } = fakeSupabase({ expired: [item("old")] });
  const result = await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, ...noBot });

  assert.equal(result.expired, 1);
  assert.equal(finalStatus(queries, "old")?.result.reason, "expired");
  assert.equal(queries.some((q) => q.table === "pending_ai_queue" && q.op === "delete" && q.eq.id === "old"), false);
});

// ---------------------------------------------------------------------------
// Telegram summary
// ---------------------------------------------------------------------------

test("drain — Telegram summary also lists what could not be processed, with the original text", async () => {
  const { bot, messages } = fakeBot();
  const tg = (id: string, over: Partial<AiQueueItem> = {}) =>
    item(id, { channel: "telegram", kind: "text", chat_id: 77, ...over });
  const { supabase, queries } = fakeSupabase({
    queue: [tg("no-perm", { owner_user_id: "viewer-1", text_content: "pagué 500 de luz" })],
    expired: [tg("late", { text_content: "cobré 2000" })],
    roles: { "viewer-1": "viewer" },
  });
  await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, bot: bot as any, botToken: "t" });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].chatId, 77);
  assert.match(messages[0].text, /pagué 500 de luz/);
  assert.match(messages[0].text, /cobré 2000/);
  // Notified Telegram items count as seen.
  assert.ok(queries.some((q) => q.table === "pending_ai_queue" && q.op === "update" && (q.payload as any).seen_at && (q.in.id ?? []).includes("late")));
});

// ---------------------------------------------------------------------------
// Concurrency
// ---------------------------------------------------------------------------

test("drain — concurrent runs never process the same item twice", async () => {
  const { supabase, queries } = fakeSupabase({ queue: [item("q1")] });
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let geminiCalls = 0;
  const genAI: GenAILike = {
    models: {
      async generateContent() {
        geminiCalls++;
        await gate;
        return { text: TWO_ITEMS_JSON };
      },
    },
  };
  const deps = { supabase: supabase as any, genAI, genAI2: null, ...noBot };

  const first = runDrainAiQueue(deps);
  await new Promise((r) => setTimeout(r, 10));
  const secondRun = runDrainAiQueue(deps);
  await new Promise((r) => setTimeout(r, 10));
  release();
  const [firstResult, second] = await Promise.all([first, secondRun]);

  assert.equal(second.busy, true);
  assert.equal(second.processed, 0);
  assert.equal(firstResult.processed, 1);
  assert.equal(geminiCalls, 1);
  assert.equal(queries.filter((q) => q.table === "movimientos" && q.op === "insert").length, 1);
});

// ---------------------------------------------------------------------------
// Author of Telegram items
// ---------------------------------------------------------------------------

test("queueAuthorId: Telegram members linked via telegram_links keep their own user id", () => {
  assert.equal(queueAuthorId({ userId: "member-1", ownerUserId: null }), "member-1");
  assert.equal(queueAuthorId({ userId: null, ownerUserId: "owner-1" }), "owner-1");
  assert.equal(queueAuthorId({ userId: null, ownerUserId: null }), null);
});

// ---------------------------------------------------------------------------
// Albums
// ---------------------------------------------------------------------------

test("drain — a queued album is reprocessed photo by photo", async () => {
  const { bot } = fakeBot();
  const tgBot = { api: { ...bot.api, async getFile(fileId: string) { return { file_path: `photos/${fileId}.jpg` }; } } };
  const extracted: string[] = [];
  const extractReceipt = async (args: any) => {
    extracted.push(args.filePath);
    return { result: { items: [], total: 1000, moneda: "ARS", empresa: "Kiosco" }, sourceType: "photo" } as any;
  };
  const album = item("al1", { channel: "telegram", kind: "album", chat_id: 77, text_content: null, file_ids: ["f1", "f2"], mime_types: ["image/jpeg", "image/jpeg"] });
  const { supabase, queries } = fakeSupabase({ queue: [album] });
  const result = await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, bot: tgBot as any, botToken: "t", extractReceipt });

  assert.deepEqual(extracted, ["photos/f1.jpg", "photos/f2.jpg"]);
  assert.equal(result.processed, 1);
  const final = finalStatus(queries, "al1");
  assert.equal(final?.status, "processed");
  assert.equal(final?.result.count, 2);
});

test("drain — a queued photo with no readable amount saves nothing (no $0 movement) and counts a retry", async () => {
  const tgBot = { api: { async getFile() { return { file_path: "photos/x.jpg" }; }, async sendMessage() { return {}; } } };
  const extractReceipt = async () => ({ result: { items: [], total: null, moneda: "ARS", empresa: null }, sourceType: "photo" }) as any;
  const photo = item("ph1", { channel: "telegram", kind: "photo", chat_id: 77, text_content: null, file_ids: ["f1"], mime_types: ["image/jpeg"] });
  const { supabase, queries } = fakeSupabase({ queue: [photo] });
  await runDrainAiQueue({ supabase: supabase as any, genAI: genAIReturning(TWO_ITEMS_JSON), genAI2: null, bot: tgBot as any, botToken: "t", extractReceipt });

  assert.equal(queries.some((q) => q.table === "movimientos" && q.op === "insert"), false);
  assert.deepEqual(queueUpdates(queries, "ph1"), [{ retry_count: 1 }]);
});
