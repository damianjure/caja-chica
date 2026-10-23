import test from "node:test";
import assert from "node:assert/strict";

import { runDrainAiQueue } from "../src/server/cronJobs/drainAiQueue.ts";
import type { AiQueueItem } from "../src/server/aiQueue.ts";
import type { GenAILike } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Call = { table: string; op: string; method: string; args: unknown[] };

/**
 * Chainable Supabase fake: every query method records itself and returns the
 * same builder; awaiting the builder resolves a canned result per table/op.
 */
function fakeSupabase(opts: { queue: AiQueueItem[]; movimientosInsertError?: unknown }) {
  const calls: Call[] = [];
  const supabase = {
    from(table: string) {
      let op = "select";
      const resolve = () => {
        if (table === "pending_ai_queue" && op === "select") return { data: opts.queue, error: null };
        if (table === "movimientos" && op === "insert") {
          return { data: null, error: opts.movimientosInsertError ?? null };
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
            if (prop === "insert" || prop === "update" || prop === "delete") op = prop;
            calls.push({ table, op, method: prop, args });
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { supabase, calls };
}

function webItem(id: string, text: string): AiQueueItem {
  return {
    id,
    dashboard_id: "dashboard-1",
    owner_user_id: "user-1",
    channel: "web",
    chat_id: null,
    kind: "web_text",
    text_content: text,
    file_ids: null,
    mime_types: null,
    created_at: "2026-10-01T00:00:00.000Z",
    expires_at: "2099-01-01T00:00:00.000Z",
    retry_count: 0,
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

function deletedQueueIds(calls: Call[]): unknown[] {
  return calls
    .filter((c) => c.table === "pending_ai_queue" && c.op === "delete" && c.method === "eq" && c.args[0] === "id")
    .map((c) => c.args[1]);
}

function retriedQueueIds(calls: Call[]): unknown[] {
  return calls
    .filter((c) => c.table === "pending_ai_queue" && c.op === "update" && c.method === "eq" && c.args[0] === "id")
    .map((c) => c.args[1]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("drain web item — saves all extracted movements in one insert and removes the item", async () => {
  const { supabase, calls } = fakeSupabase({ queue: [webItem("q1", "nafta 100 y peaje 50")] });

  const result = await runDrainAiQueue({
    supabase: supabase as any,
    genAI: genAIReturning(TWO_ITEMS_JSON),
    genAI2: null,
    bot: null,
    botToken: undefined,
  });

  assert.equal(result.processed, 1);
  assert.equal(result.failed, 0);
  const inserts = calls.filter((c) => c.table === "movimientos" && c.method === "insert");
  assert.equal(inserts.length, 1);
  assert.equal((inserts[0].args[0] as unknown[]).length, 2);
  assert.deepEqual(deletedQueueIds(calls), ["q1"]);
});

test("drain web item — insert error keeps the item queued and counts a retry", async () => {
  const { supabase, calls } = fakeSupabase({
    queue: [webItem("q1", "nafta 100")],
    movimientosInsertError: { message: "insert failed" },
  });

  const result = await runDrainAiQueue({
    supabase: supabase as any,
    genAI: genAIReturning(TWO_ITEMS_JSON),
    genAI2: null,
    bot: null,
    botToken: undefined,
  });

  assert.equal(result.processed, 0);
  assert.equal(result.failed, 1);
  assert.deepEqual(deletedQueueIds(calls), []);
  assert.deepEqual(retriedQueueIds(calls), ["q1"]);
});

test("drain — a 400 on one item does not stop the queue (not an outage)", async () => {
  const { supabase, calls } = fakeSupabase({
    queue: [webItem("bad", "texto raro"), webItem("good", "nafta 100")],
  });
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

  const result = await runDrainAiQueue({ supabase: supabase as any, genAI, genAI2: null, bot: null, botToken: undefined });

  assert.equal(result.stopped, false);
  assert.equal(result.processed, 1);
  assert.equal(result.failed, 1);
  assert.deepEqual(retriedQueueIds(calls), ["bad"]);
  assert.deepEqual(deletedQueueIds(calls), ["good"]);
});

test("drain — concurrent runs never process the same item twice", async () => {
  const { supabase, calls } = fakeSupabase({ queue: [webItem("q1", "nafta 100")] });
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
  const deps = { supabase: supabase as any, genAI, genAI2: null, bot: null, botToken: undefined };

  const first = runDrainAiQueue(deps);
  // Let the first run reach the Gemini call before starting the second one.
  await new Promise((r) => setTimeout(r, 10));
  const secondRun = runDrainAiQueue(deps);
  await new Promise((r) => setTimeout(r, 10));
  release();
  const [firstResult, second] = await Promise.all([first, secondRun]);

  assert.equal(second.busy, true);
  assert.equal(second.processed, 0);
  assert.equal(firstResult.processed, 1);
  assert.equal(geminiCalls, 1);
  assert.equal(calls.filter((c) => c.table === "movimientos" && c.method === "insert").length, 1);
});
