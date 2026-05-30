import test from "node:test";
import assert from "node:assert/strict";

import { runRecurrentes } from "../../src/server/cronJobs/recurrentes.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface RecRow {
  id: string;
  owner_user_id?: string | null;
  dashboard_id?: string | null;
  created_by_user_id?: string | null;
  monto: number;
  tipo: string;
  moneda: string;
  categoria?: string | null;
  empresa_nombre?: string | null;
  descripcion: string;
  frecuencia: string;
  is_active: boolean;
  deleted_at: string | null;
  last_processed: string | null;
  chat_id?: number | null;
  day_of_month?: number | null;
}

function makeSupabase(opts: {
  recurrentes?: RecRow[];
  insertError?: Error | null;
}) {
  const rows = opts.recurrentes ?? [];
  const insertError = opts.insertError ?? null;
  const insertedMovimientos: unknown[] = [];
  const updatedIds: string[] = [];
  const botMessages: Array<{ chatId: number; text: string }> = [];

  const recurrentesFilters: Array<[string, string, unknown]> = [];

  const stub = {
    from(table: string) {
      const self: any = {
        select: () => self,
        eq(col: string, val: unknown) {
          if (table === "recurrentes") recurrentesFilters.push(["eq", col, val]);
          return self;
        },
        is(col: string, val: unknown) {
          if (table === "recurrentes") recurrentesFilters.push(["is", col, val]);
          return self;
        },
        then(resolve: Function) {
          if (table === "recurrentes") {
            return Promise.resolve({ data: rows, error: null }).then(resolve as any);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve as any);
        },
        insert(data: unknown) {
          insertedMovimientos.push(data);
          return Promise.resolve({ data: null, error: insertError });
        },
        update(data: unknown) {
          return {
            eq(col: string, val: unknown) {
              if (table === "recurrentes" && col === "id") {
                updatedIds.push(String(val));
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
      return self;
    },
    _insertedMovimientos: insertedMovimientos,
    _updatedIds: updatedIds,
    _recurrentesFilters: recurrentesFilters,
  };

  return stub;
}

function makeBot() {
  const calls: Array<{ chatId: number | string; text: string }> = [];
  return {
    api: {
      async sendMessage(chatId: number | string, text: string, _opts?: unknown) {
        calls.push({ chatId, text });
        return {};
      },
    },
    calls,
  };
}

// 2 days ago ISO string
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();
}

const BASE_REC: RecRow = {
  id: "rec-1",
  owner_user_id: "user-1",
  dashboard_id: null,
  created_by_user_id: null,
  monto: 5000,
  tipo: "egreso",
  moneda: "ARS",
  categoria: "Varios",
  empresa_nombre: "Personal",
  descripcion: "Netflix",
  frecuencia: "diario",
  is_active: true,
  deleted_at: null,
  last_processed: null,
  chat_id: null,
  day_of_month: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("runRecurrentes: bot=null returns {processed:0}", async () => {
  const supabase = makeSupabase({});
  const result = await runRecurrentes({ supabase: supabase as any, bot: null });
  assert.deepStrictEqual(result, { processed: 0 });
});

test("runRecurrentes: is_active=false entry is skipped", async () => {
  const rec = { ...BASE_REC, is_active: false };
  const supabase = makeSupabase({ recurrentes: [rec] });
  const bot = makeBot();
  const result = await runRecurrentes({ supabase: supabase as any, bot: bot as any });
  assert.deepStrictEqual(result, { processed: 0 });
  assert.strictEqual(supabase._insertedMovimientos.length, 0);
});

test("runRecurrentes: deleted_at set entry is skipped", async () => {
  const rec = { ...BASE_REC, deleted_at: "2026-05-01T00:00:00.000Z" };
  const supabase = makeSupabase({ recurrentes: [rec] });
  const bot = makeBot();
  const result = await runRecurrentes({ supabase: supabase as any, bot: bot as any });
  assert.deepStrictEqual(result, { processed: 0 });
  assert.strictEqual(supabase._insertedMovimientos.length, 0);
});

test("runRecurrentes: last_processed=null → processed", async () => {
  const rec = { ...BASE_REC, last_processed: null, frecuencia: "diario" };
  const supabase = makeSupabase({ recurrentes: [rec] });
  const bot = makeBot();
  const result = await runRecurrentes({ supabase: supabase as any, bot: bot as any });
  assert.strictEqual(result.processed, 1);
  assert.strictEqual(supabase._updatedIds.includes("rec-1"), true);
});

test("runRecurrentes: frecuencia=diario, days>=1 → processed", async () => {
  const rec = { ...BASE_REC, frecuencia: "diario", last_processed: daysAgo(2) };
  const supabase = makeSupabase({ recurrentes: [rec] });
  const bot = makeBot();
  const result = await runRecurrentes({ supabase: supabase as any, bot: bot as any });
  assert.strictEqual(result.processed, 1);
});

test("runRecurrentes: frecuencia=diario, days<1 → skipped", async () => {
  // last_processed 30 minutes ago
  const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const rec = { ...BASE_REC, frecuencia: "diario", last_processed: thirtyMinAgo };
  const supabase = makeSupabase({ recurrentes: [rec] });
  const bot = makeBot();
  const result = await runRecurrentes({ supabase: supabase as any, bot: bot as any });
  assert.deepStrictEqual(result, { processed: 0 });
});

test("runRecurrentes: insertErr thrown → caught per-recurrente, loop continues", async () => {
  const rec1 = { ...BASE_REC, id: "rec-1", last_processed: null };
  const rec2 = { ...BASE_REC, id: "rec-2", last_processed: null };
  // First call fails; second succeeds — but our stub returns same error for all inserts
  // We need a stub that fails on first insert only
  const insertCalls: unknown[] = [];
  let insertCallCount = 0;
  const customSupabase = {
    from(table: string) {
      const self: any = {
        select: () => self,
        eq: () => self,
        is: () => self,
        then(resolve: Function) {
          return Promise.resolve({ data: [rec1, rec2], error: null }).then(resolve as any);
        },
        insert(data: unknown) {
          insertCallCount++;
          insertCalls.push(data);
          const err = insertCallCount === 1 ? new Error("insert failed") : null;
          return Promise.resolve({ data: null, error: err });
        },
        update(_data: unknown) {
          return {
            eq: (_c: string, _v: unknown) => Promise.resolve({ data: null, error: null }),
          };
        },
      };
      return self;
    },
  };
  const bot = makeBot();
  const result = await runRecurrentes({ supabase: customSupabase as any, bot: bot as any });
  // rec-1 fails (insertErr), rec-2 succeeds
  assert.strictEqual(result.processed, 1);
  assert.strictEqual(insertCallCount, 2);
});

test("runRecurrentes: prefiltra is_active=true AND deleted_at IS NULL en DB (no full scan)", async () => {
  const rec = { ...BASE_REC, last_processed: null };
  const supabase = makeSupabase({ recurrentes: [rec] });
  const bot = makeBot();
  await runRecurrentes({ supabase: supabase as any, bot: bot as any });
  const filters = supabase._recurrentesFilters;
  assert.ok(
    filters.some(([op, col, val]) => op === "eq" && col === "is_active" && val === true),
    "debe filtrar is_active=true en la query",
  );
  assert.ok(
    filters.some(([op, col, val]) => op === "is" && col === "deleted_at" && val === null),
    "debe filtrar deleted_at IS NULL en la query",
  );
});

test("runRecurrentes: chat_id present → bot.api.sendMessage called", async () => {
  const rec = { ...BASE_REC, last_processed: null, chat_id: 99999 };
  const supabase = makeSupabase({ recurrentes: [rec] });
  const bot = makeBot();
  await runRecurrentes({ supabase: supabase as any, bot: bot as any });
  assert.strictEqual(bot.calls.length, 1);
  assert.strictEqual(bot.calls[0].chatId, 99999);
});
