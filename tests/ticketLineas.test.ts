/**
 * Fase A — ticket + persisted line items API.
 *
 * Covers POST /api/movimientos/ticket (parent total + child lines, no empresa
 * auto-create), GET /api/movimientos/:id/lineas, PATCH/DELETE on a line and the
 * parent-total recompute. Uses a small stateful in-memory Supabase stub so we
 * can assert totals after edits/deletes.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";
import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

const memberSession: AppSession = {
  userId: "user-1",
  email: "member@example.com",
  role: "member",
  status: "active",
};

/** Stateful stub for movimientos + movimiento_lineas (+ empty supporting tables). */
function makeStore() {
  const tables: Record<string, any[]> = {};
  let idc = 0;
  const nid = (p: string) => `${p}-${++idc}`;

  function from(name: string) {
    const rows = tables[name] ?? (tables[name] = []);
    const filters: Array<[string, any]> = [];
    const isF: Array<[string, any]> = [];
    let op: null | { kind: "update" | "delete"; patch?: any } = null;
    let lim: number | null = null;

    function match() {
      let r = rows.filter(
        (row) =>
          filters.every(([c, v]) => row[c] === v || String(row[c]) === String(v)) &&
          isF.every(([c, v]) => (v === null ? row[c] === null || row[c] === undefined : row[c] === v)),
      );
      if (lim != null) r = r.slice(0, lim);
      return r;
    }
    function exec() {
      if (op?.kind === "update") {
        for (const row of match()) Object.assign(row, op.patch);
        return { data: null, error: null };
      }
      if (op?.kind === "delete") {
        for (const row of match()) {
          const i = rows.indexOf(row);
          if (i >= 0) rows.splice(i, 1);
        }
        return { data: null, error: null };
      }
      return { data: match(), error: null };
    }

    const b: any = {
      select() { return b; },
      is(c: string, v: any) { isF.push([c, v]); return b; },
      eq(c: string, v: any) { filters.push([c, v]); return b; },
      order() { return b; },
      limit(n: number) { lim = n; return b; },
      update(patch: any) { op = { kind: "update", patch }; return b; },
      delete() { op = { kind: "delete" }; return b; },
      insert(input: any) {
        const arr = Array.isArray(input) ? input : [input];
        const inserted = arr.map((r: any) => {
          const row = { id: nid(name), created_at: new Date().toISOString(), deleted_at: null, ...r };
          rows.push(row);
          return row;
        });
        return {
          select() { return Promise.resolve({ data: inserted, error: null }); },
          single() { return Promise.resolve({ data: inserted[0], error: null }); },
          then(res: any) { return res({ data: inserted, error: null }); },
        };
      },
      then(resolve: any) { return resolve(exec()); },
    };
    return b;
  }

  return { tables, supabase: { from, auth: { getUser: async () => ({ data: { user: null } }) } } };
}

async function withServer(store: ReturnType<typeof makeStore>, fn: (baseUrl: string) => Promise<void>) {
  const app = createApp({
    supabase: store.supabase as any,
    genAI: {} as any,
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    resolveSession: async (token) => (token === "valid-token" ? memberSession : null),
  } as Partial<AppDeps> as AppDeps);

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

const AUTH = { "Content-Type": "application/json", Authorization: "Bearer valid-token" };

const ticketBody = () => ({
  empresa: "Personal",
  moneda: "ARS",
  descripcion: "Carrefour", // merchant goes here, NOT into empresa
  lineas: [
    { descripcion: "Leche", monto: 1200, categoria: "Supermercado", cantidad: 1 },
    { descripcion: "Pan", monto: 800, categoria: "Panadería", cantidad: 2 },
  ],
});

test("POST /api/movimientos/ticket — 401 without auth", async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/movimientos/ticket`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ticketBody()),
    });
    assert.equal(res.status, 401);
  });
});

test("POST /api/movimientos/ticket — 400 when lineas empty", async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/movimientos/ticket`, {
      method: "POST",
      headers: AUTH,
      body: JSON.stringify({ empresa: "Personal", moneda: "ARS", descripcion: "x", lineas: [] }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/movimientos/ticket — creates parent total + lines, no empresa auto-create", async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/movimientos/ticket`, {
      method: "POST", headers: AUTH, body: JSON.stringify(ticketBody()),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.movimiento.monto, 2000, "parent total = sum of lines");
    assert.equal(body.movimiento.empresa_nombre, "Personal");
    assert.equal(body.movimiento.tipo, "egreso");
    assert.equal(body.movimiento.has_lineas, true);
    assert.equal(body.movimiento.descripcion, "Carrefour");
    assert.equal(body.lineas.length, 2);
    // Merchant ("Carrefour") must NOT have been registered as a company.
    assert.equal((store.tables.empresas ?? []).length, 0, "no empresa auto-created");
  });
});

test("GET /api/movimientos/:id/lineas — returns the persisted lines", async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/api/movimientos/ticket`, {
      method: "POST", headers: AUTH, body: JSON.stringify(ticketBody()),
    })).json() as any;
    const id = created.movimiento.id;
    const res = await fetch(`${baseUrl}/api/movimientos/${id}/lineas`, { headers: AUTH });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].descripcion, "Leche");
  });
});

test("PATCH /api/movimientos/lineas/:id — edits a line and recomputes parent total", async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/api/movimientos/ticket`, {
      method: "POST", headers: AUTH, body: JSON.stringify(ticketBody()),
    })).json() as any;
    const lineId = created.lineas[0].id; // Leche 1200
    const res = await fetch(`${baseUrl}/api/movimientos/lineas/${lineId}`, {
      method: "PATCH", headers: AUTH, body: JSON.stringify({ monto: 1500 }),
    });
    assert.equal(res.status, 200);
    const parent = store.tables.movimientos.find((m) => m.id === created.movimiento.id);
    assert.equal(parent.monto, 2300, "1500 + 800 = 2300");
  });
});

test("DELETE /api/movimientos/lineas/:id — soft-deletes a line and recomputes total", async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/api/movimientos/ticket`, {
      method: "POST", headers: AUTH, body: JSON.stringify(ticketBody()),
    })).json() as any;
    const lineId = created.lineas[1].id; // Pan 800
    const res = await fetch(`${baseUrl}/api/movimientos/lineas/${lineId}`, {
      method: "DELETE", headers: AUTH,
    });
    assert.equal(res.status, 200);
    const parent = store.tables.movimientos.find((m) => m.id === created.movimiento.id);
    assert.equal(parent.monto, 1200, "only Leche remains");
    assert.equal(parent.has_lineas, true);
    // GET should now return a single active line.
    const list = await (await fetch(`${baseUrl}/api/movimientos/${created.movimiento.id}/lineas`, { headers: AUTH })).json() as any;
    assert.equal(list.items.length, 1);
  });
});

test("PATCH /api/movimientos/lineas/:id — 400 on empty patch", async () => {
  const store = makeStore();
  await withServer(store, async (baseUrl) => {
    const created = await (await fetch(`${baseUrl}/api/movimientos/ticket`, {
      method: "POST", headers: AUTH, body: JSON.stringify(ticketBody()),
    })).json() as any;
    const res = await fetch(`${baseUrl}/api/movimientos/lineas/${created.lineas[0].id}`, {
      method: "PATCH", headers: AUTH, body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
  });
});
