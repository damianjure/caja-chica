import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

const session: AppSession = { userId: "user-1", email: "user@example.com", role: "member", status: "active" };

type Query = { table: string; op: string; payload: unknown; eq: Record<string, unknown>; in: Record<string, unknown[]>; neq: Record<string, unknown>; is: Record<string, unknown> };

/** Proxy Supabase fake: records each query and resolves canned queue rows. */
function fakeSupabase(queueRows: unknown[]) {
  const queries: Query[] = [];
  const supabase = {
    from(table: string) {
      const q: Query = { table, op: "select", payload: undefined, eq: {}, in: {}, neq: {}, is: {} };
      queries.push(q);
      const resolve = () =>
        table === "pending_ai_queue" && q.op === "select" ? { data: queueRows, error: null } : { data: [], error: null };
      const builder: any = new Proxy({}, {
        get(_t, prop: string) {
          if (prop === "then") {
            return (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, ko);
          }
          return (...args: unknown[]) => {
            if (prop === "insert" || prop === "update" || prop === "delete") { q.op = prop; q.payload = args[0]; }
            else if (prop === "eq") q.eq[String(args[0])] = args[1];
            else if (prop === "in") q.in[String(args[0])] = args[1] as unknown[];
            else if (prop === "neq") q.neq[String(args[0])] = args[1];
            else if (prop === "is") q.is[String(args[0])] = args[1];
            return builder;
          };
        },
      });
      return builder;
    },
  };
  return { supabase, queries };
}

async function withServer(supabase: unknown, fn: (base: string) => Promise<void>) {
  const app = createApp({
    supabase: supabase as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => session,
  });
  const server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((r, j) => server.close((e) => (e ? j(e) : r())));
  }
}

const H = { Authorization: "Bearer valid-token", "Content-Type": "application/json" };

test("GET /api/queue/summary returns the caller's unseen processed and failed web items", async () => {
  const { supabase, queries } = fakeSupabase([
    { id: "p1", text_content: "nafta 100", status: "processed", result: { description: "nafta", tipo: "egreso", count: 1 }, processed_at: "2026-10-23T10:00:00Z" },
    { id: "f1", text_content: "algo raro", status: "failed", result: { reason: "processing_failed" }, processed_at: "2026-10-23T10:01:00Z" },
  ]);
  await withServer(supabase, async (base) => {
    const res = await fetch(`${base}/api/queue/summary`, { headers: H });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      processed: [{ id: "p1", text_content: "nafta 100", description: "nafta", tipo: "egreso", count: 1, processed_at: "2026-10-23T10:00:00Z" }],
      failed: [{ id: "f1", text_content: "algo raro", reason: "processing_failed", processed_at: "2026-10-23T10:01:00Z" }],
    });
  });
  const select = queries.find((q) => q.table === "pending_ai_queue" && q.op === "select")!;
  assert.equal(select.eq.owner_user_id, "user-1");
  assert.equal(select.eq.channel, "web");
  assert.equal(select.neq.status, "pending");
  assert.equal(select.is.seen_at, null);
});

test("POST /api/queue/summary/seen marks only the caller's web items as seen", async () => {
  const { supabase, queries } = fakeSupabase([]);
  await withServer(supabase, async (base) => {
    const res = await fetch(`${base}/api/queue/summary/seen`, { method: "POST", headers: H, body: JSON.stringify({ ids: ["p1", "f1"] }) });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
  });
  const update = queries.find((q) => q.table === "pending_ai_queue" && q.op === "update")!;
  assert.ok((update.payload as any).seen_at);
  assert.equal(update.eq.owner_user_id, "user-1");
  assert.equal(update.eq.channel, "web");
  assert.deepEqual(update.in.id, ["p1", "f1"]);
});

test("POST /api/queue/summary/seen rejects a body without a list of ids", async () => {
  const { supabase, queries } = fakeSupabase([]);
  await withServer(supabase, async (base) => {
    const res = await fetch(`${base}/api/queue/summary/seen`, { method: "POST", headers: H, body: JSON.stringify({ ids: "p1" }) });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: "ids_required" });
  });
  assert.equal(queries.some((q) => q.table === "pending_ai_queue" && q.op === "update"), false);
});
