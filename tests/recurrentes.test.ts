import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";
import { computeNextRun, relativeRunLabel, type Frecuencia } from "../src/server/recurrentes.ts";
import { parseRecurrenteRequest } from "../src/server/validation.ts";

// ---------------------------------------------------------------------------
// Helper stubs
// ---------------------------------------------------------------------------

function createSupabaseStub(seed: {
  recurrentes?: unknown[];
  dashboardMembers?: unknown[];
} = {}) {
  const callLog: Array<{ table: string; type: string; args: unknown[] }> = [];
  const recurrentesRows = seed.recurrentes ?? [];
  const dashboardMembersRows = seed.dashboardMembers ?? [];

  const builder = (table: string) => {
    let rows: unknown[] = [];
    if (table === "recurrentes") rows = [...recurrentesRows];
    if (table === "dashboard_members") rows = [...dashboardMembersRows];

    const api: any = {
      select(...args: unknown[]) { callLog.push({ table, type: "select", args }); return api; },
      order(...args: unknown[]) { callLog.push({ table, type: "order", args }); return api; },
      eq(col: string, val: unknown) {
        callLog.push({ table, type: "eq", args: [col, val] });
        rows = rows.filter((r: any) => r[col] === val);
        return api;
      },
      is(col: string, val: unknown) {
        callLog.push({ table, type: "is", args: [col, val] });
        rows = rows.filter((r: any) => {
          const cell = (r as any)[col];
          if (val === null) return cell === null || cell === undefined;
          return cell === val;
        });
        return api;
      },
      neq(col: string, val: unknown) {
        callLog.push({ table, type: "neq", args: [col, val] });
        rows = rows.filter((r: any) => r[col] !== val);
        return api;
      },
      not(col: string, op: string, val: unknown) {
        callLog.push({ table, type: "not", args: [col, op, val] });
        if (op === "is" && val === null) rows = rows.filter((r: any) => (r as any)[col] !== null && (r as any)[col] !== undefined);
        return api;
      },
      insert(data: unknown) {
        callLog.push({ table, type: "insert", args: [data] });
        const arr = Array.isArray(data) ? data : [data];
        const inserted = arr.map((item: any, i: number) => ({ id: `new-${i}`, ...item }));
        const promise: any = Promise.resolve({ data: inserted, error: null });
        promise.select = () => promise;
        promise.single = () => Promise.resolve({ data: inserted[0], error: null });
        return promise;
      },
      update(data: unknown) {
        callLog.push({ table, type: "update", args: [data] });
        // Apply update to matching rows (after eq/is filters)
        const updated = rows.map((r: any) => ({ ...r, ...(data as object) }));
        return {
          eq(col: string, val: unknown) {
            callLog.push({ table, type: "update.eq", args: [col, val] });
            const matched = updated.filter((r: any) => r[col] === val);
            const promise: any = Promise.resolve({ data: matched, error: null });
            promise.select = () => promise;
            promise.single = () => Promise.resolve({ data: matched[0] ?? null, error: matched[0] ? null : { code: "PGRST116" } });
            return promise;
          },
          is(col: string, val: unknown) {
            callLog.push({ table, type: "update.is", args: [col, val] });
            const matched = updated.filter((r: any) => {
              const cell = r[col];
              if (val === null) return cell === null || cell === undefined;
              return cell === val;
            });
            const promise: any = Promise.resolve({ data: matched, error: null });
            promise.select = () => promise;
            promise.single = () => Promise.resolve({ data: matched[0] ?? null, error: matched[0] ? null : { code: "PGRST116" } });
            return promise;
          },
          select() { return this; },
          single() {
            return Promise.resolve({ data: updated[0] ?? null, error: updated[0] ? null : { code: "PGRST116" } });
          },
        };
      },
      single() { return Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { code: "PGRST116" } }); },
      limit(n: number) {
        rows = rows.slice(0, n);
        const promise: any = Promise.resolve({ data: rows, error: null });
        promise.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
        return promise;
      },
      then(resolve: Function) { return Promise.resolve({ data: rows, error: null }).then(resolve as any); },
    };
    // Make api thenable for direct await
    Object.defineProperty(api, Symbol.toStringTag, { value: "Promise" });
    api[Symbol.iterator] = undefined;
    // Make it work with await directly
    api.then = (resolve: Function) => Promise.resolve({ data: rows, error: null }).then(resolve as any);
    return api;
  };

  return { from: builder, callLog };
}

function makeSession(overrides: Partial<AppSession> = {}): AppSession {
  return {
    userId: "user-1",
    email: "owner@example.com",
    role: "member",
    status: "active",
    ...overrides,
  };
}

function startServer(supabase: unknown, session: AppSession) {
  const deps: AppDeps = {
    supabase: supabase as any,
    genAI: null as any,
    allowedOrigins: ["*"],
    botActive: false,
    resolveSession: async () => session,
  };
  const app = createApp(deps);
  return new Promise<{ port: number; close: () => void }>((res) => {
    const srv = app.listen(0, () => {
      const { port } = srv.address() as AddressInfo;
      res({ port, close: () => srv.close() });
    });
  });
}

async function req(port: number, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: "Bearer test-token",
  };
  const opts: RequestInit = { method, headers };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`http://localhost:${port}${path}`, opts);
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

// ---------------------------------------------------------------------------
// A.2: computeNextRun tests (RED → GREEN after recurrentes.ts created)
// ---------------------------------------------------------------------------

test("computeNextRun: null lastProcessed returns null", () => {
  const result = computeNextRun("diario", null);
  assert.strictEqual(result, null);
});

test("computeNextRun: diario adds 1 day", () => {
  const base = new Date("2026-05-01T00:00:00.000Z");
  const result = computeNextRun("diario", base)!;
  assert.strictEqual(result.toISOString(), "2026-05-02T00:00:00.000Z");
});

test("computeNextRun: semanal adds 7 days", () => {
  const base = new Date("2026-05-01T00:00:00.000Z");
  const result = computeNextRun("semanal", base)!;
  assert.strictEqual(result.toISOString(), "2026-05-08T00:00:00.000Z");
});

test("computeNextRun: quincenal adds 14 days", () => {
  const base = new Date("2026-05-01T00:00:00.000Z");
  const result = computeNextRun("quincenal", base)!;
  assert.strictEqual(result.toISOString(), "2026-05-15T00:00:00.000Z");
});

test("computeNextRun: mensual same day next month", () => {
  const base = new Date("2026-05-21T00:00:00.000Z");
  const result = computeNextRun("mensual", base)!;
  assert.strictEqual(result.toISOString(), "2026-06-21T00:00:00.000Z");
});

test("computeNextRun: mensual edge case Jan 31 → Feb 28", () => {
  const base = new Date("2026-01-31T00:00:00.000Z");
  const result = computeNextRun("mensual", base)!;
  assert.strictEqual(result.toISOString(), "2026-02-28T00:00:00.000Z");
});

test("computeNextRun: anual same date next year", () => {
  const base = new Date("2026-05-21T00:00:00.000Z");
  const result = computeNextRun("anual", base)!;
  assert.strictEqual(result.toISOString(), "2027-05-21T00:00:00.000Z");
});

test("computeNextRun: anual leap year Feb 29 → Feb 28 in non-leap", () => {
  const base = new Date("2024-02-29T00:00:00.000Z");
  const result = computeNextRun("anual", base)!;
  assert.strictEqual(result.toISOString(), "2025-02-28T00:00:00.000Z");
});

test("computeNextRun: mensual with day_of_month pins to that day next month", () => {
  // last_processed May 5, day_of_month=5, now May 10 → already past the 5th this month
  const base = new Date("2026-05-05T00:00:00.000Z");
  const now = new Date("2026-05-10T00:00:00.000Z");
  const result = computeNextRun("mensual", base, 5, now)!;
  assert.strictEqual(result.toISOString(), "2026-06-05T00:00:00.000Z");
});

test("computeNextRun: mensual with day_of_month still ahead this month", () => {
  // last_processed May 1, day_of_month=20, now May 10 → the 20th is still ahead
  const base = new Date("2026-05-01T00:00:00.000Z");
  const now = new Date("2026-05-10T00:00:00.000Z");
  const result = computeNextRun("mensual", base, 20, now)!;
  assert.strictEqual(result.toISOString(), "2026-05-20T00:00:00.000Z");
});

test("computeNextRun: mensual day_of_month=31 clamps to Feb 28", () => {
  // day_of_month=31, target month February → clamp to last day
  const base = new Date("2026-01-31T00:00:00.000Z");
  const now = new Date("2026-02-01T00:00:00.000Z");
  const result = computeNextRun("mensual", base, 31, now)!;
  assert.strictEqual(result.toISOString(), "2026-02-28T00:00:00.000Z");
});

test("computeNextRun: mensual without day_of_month falls back to addMonth", () => {
  const base = new Date("2026-05-21T00:00:00.000Z");
  const result = computeNextRun("mensual", base, null)!;
  assert.strictEqual(result.toISOString(), "2026-06-21T00:00:00.000Z");
});

// ---------------------------------------------------------------------------
// relativeRunLabel tests
// ---------------------------------------------------------------------------

test("relativeRunLabel: null returns se activa esta noche", () => {
  assert.strictEqual(relativeRunLabel(null), "se activa esta noche");
});

test("relativeRunLabel: same day returns hoy", () => {
  const now = new Date("2026-05-21T10:00:00.000Z");
  const nextRun = new Date("2026-05-21T22:00:00.000Z");
  assert.strictEqual(relativeRunLabel(nextRun, now), "hoy");
});

test("relativeRunLabel: 1 day returns mañana", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");
  const nextRun = new Date("2026-05-22T00:00:00.000Z");
  assert.strictEqual(relativeRunLabel(nextRun, now), "mañana");
});

test("relativeRunLabel: 3 days returns en N días", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");
  const nextRun = new Date("2026-05-24T00:00:00.000Z");
  assert.strictEqual(relativeRunLabel(nextRun, now), "en 3 días");
});

test("relativeRunLabel: 7 days returns en 1 semana", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");
  const nextRun = new Date("2026-05-28T00:00:00.000Z");
  assert.strictEqual(relativeRunLabel(nextRun, now), "en 1 semana");
});

test("relativeRunLabel: 14 days returns en 2 semanas", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");
  const nextRun = new Date("2026-06-04T00:00:00.000Z");
  assert.strictEqual(relativeRunLabel(nextRun, now), "en 2 semanas");
});

test("relativeRunLabel: 30 days returns en 1 mes", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");
  const nextRun = new Date("2026-06-20T00:00:00.000Z");
  assert.strictEqual(relativeRunLabel(nextRun, now), "en 1 mes");
});

test("relativeRunLabel: 365 days returns en 1 año", () => {
  const now = new Date("2026-05-21T00:00:00.000Z");
  const nextRun = new Date("2027-05-21T00:00:00.000Z");
  assert.strictEqual(relativeRunLabel(nextRun, now), "en 1 año");
});

// ---------------------------------------------------------------------------
// parseRecurrenteRequest tests
// ---------------------------------------------------------------------------

test("parseRecurrenteRequest: valid body returns parsed object", () => {
  const result = parseRecurrenteRequest({
    monto: 1500,
    tipo: "egreso",
    moneda: "ARS",
    frecuencia: "mensual",
  });
  assert.ok(result);
  assert.strictEqual(result.monto, 1500);
  assert.strictEqual(result.frecuencia, "mensual");
});

test("parseRecurrenteRequest: frecuencia inválida returns null", () => {
  const result = parseRecurrenteRequest({
    monto: 1000,
    tipo: "egreso",
    moneda: "ARS",
    frecuencia: "trimestral",
  });
  assert.strictEqual(result, null);
});

test("parseRecurrenteRequest: monto <= 0 returns null", () => {
  const result = parseRecurrenteRequest({
    monto: 0,
    tipo: "egreso",
    moneda: "ARS",
    frecuencia: "diario",
  });
  assert.strictEqual(result, null);
});

test("parseRecurrenteRequest: tipo inválido returns null", () => {
  const result = parseRecurrenteRequest({
    monto: 100,
    tipo: "gasto", // legacy name no longer accepted — DB uses egreso
    moneda: "ARS",
    frecuencia: "semanal",
  });
  // Only egreso|ingreso are accepted (consistent with DB check constraint).
  assert.strictEqual(result, null);
});

test("parseRecurrenteRequest: quincenal and anual accepted", () => {
  for (const f of ["quincenal", "anual"] as const) {
    const result = parseRecurrenteRequest({ monto: 100, tipo: "egreso", moneda: "USD", frecuencia: f });
    assert.ok(result, `frecuencia ${f} should be accepted`);
    assert.strictEqual(result.frecuencia, f);
  }
});

// ---------------------------------------------------------------------------
// A.4: Endpoint tests (RED → GREEN after endpoints added to app.ts)
// ---------------------------------------------------------------------------

const BASE_RECURRENTE = {
  id: "rec-1",
  owner_user_id: "user-1",
  dashboard_id: null,
  monto: 5000,
  tipo: "egreso",
  moneda: "ARS",
  frecuencia: "mensual",
  empresa_nombre: "Personal",
  descripcion: "Netflix",
  categoria: "Entretenimiento",
  is_active: true,
  deleted_at: null,
  last_processed: "2026-04-21T00:00:00.000Z",
  created_by_user_id: null,
};

test("GET /api/recurrentes: owner scope, returns items with next_run_at and next_run_label", async () => {
  const stub = createSupabaseStub({ recurrentes: [BASE_RECURRENTE] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status, data } = await req(port, "GET", "/api/recurrentes");
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data));
    assert.strictEqual(data.length, 1);
    assert.ok("next_run_at" in data[0], "next_run_at should be present");
    assert.ok("next_run_label" in data[0], "next_run_label should be present");
  } finally {
    close();
  }
});

test("GET /api/recurrentes: deleted_at rows excluded by default", async () => {
  const deleted = { ...BASE_RECURRENTE, id: "rec-del", deleted_at: "2026-05-01T00:00:00.000Z" };
  const stub = createSupabaseStub({ recurrentes: [BASE_RECURRENTE, deleted] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status, data } = await req(port, "GET", "/api/recurrentes");
    assert.strictEqual(status, 200);
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].id, "rec-1");
  } finally {
    close();
  }
});

test("GET /api/recurrentes: ?active=false returns only paused", async () => {
  const paused = { ...BASE_RECURRENTE, id: "rec-paused", is_active: false };
  const stub = createSupabaseStub({ recurrentes: [BASE_RECURRENTE, paused] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status, data } = await req(port, "GET", "/api/recurrentes?active=false");
    assert.strictEqual(status, 200);
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].id, "rec-paused");
  } finally {
    close();
  }
});

test("GET /api/recurrentes: viewer gets 200", async () => {
  const stub = createSupabaseStub({
    recurrentes: [{ ...BASE_RECURRENTE, dashboard_id: "dash-1", owner_user_id: null }],
    dashboardMembers: [{
      id: "mem-1",
      user_id: "viewer-1",
      dashboard_id: "dash-1",
      role: "viewer",
      permissions: {},
      status: "active",
    }],
  });
  const session = makeSession({ userId: "viewer-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "GET", "/api/recurrentes");
    assert.strictEqual(status, 200);
  } finally {
    close();
  }
});

test("POST /api/recurrentes: viewer gets 403", async () => {
  const stub = createSupabaseStub({
    recurrentes: [],
    dashboardMembers: [{
      id: "mem-1", user_id: "viewer-1", dashboard_id: "dash-1",
      role: "viewer", permissions: {}, status: "active",
    }],
  });
  const session = makeSession({ userId: "viewer-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "POST", "/api/recurrentes", {
      monto: 1000, tipo: "egreso", moneda: "ARS", frecuencia: "mensual",
    });
    assert.strictEqual(status, 403);
  } finally {
    close();
  }
});

test("POST /api/recurrentes: frecuencia inválida returns 400", async () => {
  const stub = createSupabaseStub({ recurrentes: [] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "POST", "/api/recurrentes", {
      monto: 1000, tipo: "egreso", moneda: "ARS", frecuencia: "foo",
    });
    assert.strictEqual(status, 400);
  } finally {
    close();
  }
});

test("POST /api/recurrentes: successful creation returns 201", async () => {
  const stub = createSupabaseStub({ recurrentes: [] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status, data } = await req(port, "POST", "/api/recurrentes", {
      monto: 2000, tipo: "egreso", moneda: "ARS", frecuencia: "quincenal",
    });
    assert.strictEqual(status, 201);
    assert.ok(data);
  } finally {
    close();
  }
});

test("PATCH /api/recurrentes/:id: viewer gets 403", async () => {
  const stub = createSupabaseStub({
    recurrentes: [BASE_RECURRENTE],
    dashboardMembers: [{
      id: "mem-1", user_id: "viewer-1", dashboard_id: "dash-1",
      role: "viewer", permissions: {}, status: "active",
    }],
  });
  const session = makeSession({ userId: "viewer-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "PATCH", "/api/recurrentes/rec-1", { monto: 9000 });
    assert.strictEqual(status, 403);
  } finally {
    close();
  }
});

test("PATCH /api/recurrentes/:id: deleted returns 404", async () => {
  const deleted = { ...BASE_RECURRENTE, id: "rec-del", deleted_at: "2026-05-01T00:00:00.000Z" };
  const stub = createSupabaseStub({ recurrentes: [deleted] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "PATCH", "/api/recurrentes/rec-del", { monto: 9000 });
    assert.strictEqual(status, 404);
  } finally {
    close();
  }
});

test("PATCH /api/recurrentes/:id/toggle: flips is_active", async () => {
  const stub = createSupabaseStub({ recurrentes: [BASE_RECURRENTE] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status, data } = await req(port, "PATCH", "/api/recurrentes/rec-1/toggle");
    assert.strictEqual(status, 200);
    // is_active should be flipped from true to false
    assert.strictEqual(data.is_active, false);
  } finally {
    close();
  }
});

test("PATCH /api/recurrentes/:id/toggle: viewer gets 403", async () => {
  const stub = createSupabaseStub({
    recurrentes: [BASE_RECURRENTE],
    dashboardMembers: [{
      id: "mem-1", user_id: "viewer-1", dashboard_id: "dash-1",
      role: "viewer", permissions: {}, status: "active",
    }],
  });
  const session = makeSession({ userId: "viewer-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "PATCH", "/api/recurrentes/rec-1/toggle");
    assert.strictEqual(status, 403);
  } finally {
    close();
  }
});

test("DELETE /api/recurrentes/:id: soft delete sets deleted_at", async () => {
  const stub = createSupabaseStub({ recurrentes: [BASE_RECURRENTE] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "DELETE", "/api/recurrentes/rec-1");
    assert.strictEqual(status, 200);
  } finally {
    close();
  }
});

test("DELETE /api/recurrentes/:id: already deleted returns 404", async () => {
  const deleted = { ...BASE_RECURRENTE, id: "rec-del", deleted_at: "2026-05-01T00:00:00.000Z" };
  const stub = createSupabaseStub({ recurrentes: [deleted] });
  const session = makeSession({ userId: "user-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "DELETE", "/api/recurrentes/rec-del");
    assert.strictEqual(status, 404);
  } finally {
    close();
  }
});

test("DELETE /api/recurrentes/:id: viewer gets 403", async () => {
  const stub = createSupabaseStub({
    recurrentes: [BASE_RECURRENTE],
    dashboardMembers: [{
      id: "mem-1", user_id: "viewer-1", dashboard_id: "dash-1",
      role: "viewer", permissions: {}, status: "active",
    }],
  });
  const session = makeSession({ userId: "viewer-1" });
  const { port, close } = await startServer(stub, session);
  try {
    const { status } = await req(port, "DELETE", "/api/recurrentes/rec-1");
    assert.strictEqual(status, 403);
  } finally {
    close();
  }
});
