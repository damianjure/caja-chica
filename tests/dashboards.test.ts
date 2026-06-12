import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCuit,
  listUserDashboards,
  createPymeDashboard,
  setActiveDashboard,
} from "../src/server/dashboards.ts";

// Op-aware fake: select → selects[table], insert .select() → inserted[table],
// update → ok. Captures inserts/updates.
function fakeDb(config: {
  selects?: Record<string, any[]>;
  inserted?: Record<string, any[]>;
} = {}) {
  const captured = { inserts: [] as any[], updates: [] as any[] };
  function builder(table: string) {
    let op: "select" | "insert" | "update" = "select";
    const resolve = () => ({
      data: op === "insert" ? (config.inserted?.[table] ?? [{ id: "new-id" }]) : (config.selects?.[table] ?? []),
      error: null,
    });
    const b: any = {
      select: () => b,
      insert: (payload: any) => { op = "insert"; captured.inserts.push({ table, payload }); return b; },
      update: (payload: any) => { op = "update"; captured.updates.push({ table, payload }); return b; },
      eq: () => b, in: () => b, limit: () => Promise.resolve(resolve()),
      then: (r: (v: any) => void) => r(resolve()),
    };
    return b;
  }
  return { supabase: { from: builder } as any, captured };
}

// --- normalizeCuit ---

test("normalizeCuit: acepta 11 dígitos (con guiones/puntos)", () => {
  assert.equal(normalizeCuit("20-12345678-9"), "20123456789");
  assert.equal(normalizeCuit("20123456789"), "20123456789");
});

test("normalizeCuit: rechaza largo inválido / vacío", () => {
  assert.equal(normalizeCuit("123"), null);
  assert.equal(normalizeCuit(""), null);
  assert.equal(normalizeCuit(null), null);
});

// --- listUserDashboards ---

test("listUserDashboards: cruza membresías con dashboards + tipo", async () => {
  const { supabase } = fakeDb({
    selects: {
      dashboard_members: [{ dashboard_id: "d1", role: "owner" }, { dashboard_id: "d2", role: "editor" }],
      dashboards: [{ id: "d1", name: "Personal", type: "personal" }, { id: "d2", name: "Mi PyME", type: "pyme" }],
    },
  });
  const list = await listUserDashboards(supabase, "u1");
  assert.equal(list.length, 2);
  assert.equal(list[0].type, "personal");
  assert.equal(list[1].name, "Mi PyME");
  assert.equal(list[1].role, "editor");
});

test("listUserDashboards: sin membresías → []", async () => {
  const { supabase } = fakeDb({ selects: { dashboard_members: [] } });
  assert.deepEqual(await listUserDashboards(supabase, "u1"), []);
});

// --- createPymeDashboard ---

test("createPymeDashboard: CUIT válido → crea dashboard pyme + membership owner", async () => {
  const { supabase, captured } = fakeDb({ inserted: { dashboards: [{ id: "pyme-1" }] } });
  const r = await createPymeDashboard(supabase, { userId: "u1", name: "Acme SRL", cuit: "30-71234567-0", cuil: null });
  assert.equal(r.status, "ok");
  assert.equal(r.status === "ok" && r.dashboardId, "pyme-1");
  const dash = captured.inserts.find((i) => i.table === "dashboards");
  assert.equal(dash.payload.type, "pyme");
  assert.equal(dash.payload.cuit, "30712345670");
  const member = captured.inserts.find((i) => i.table === "dashboard_members");
  assert.equal(member.payload.role, "owner");
});

test("createPymeDashboard: CUIT inválido → invalid_cuit, no inserta", async () => {
  const { supabase, captured } = fakeDb();
  const r = await createPymeDashboard(supabase, { userId: "u1", name: "Acme", cuit: "123" });
  assert.equal(r.status, "invalid_cuit");
  assert.equal(captured.inserts.length, 0);
});

test("createPymeDashboard: nombre vacío → invalid_name", async () => {
  const { supabase } = fakeDb();
  const r = await createPymeDashboard(supabase, { userId: "u1", name: "  ", cuit: "30712345670" });
  assert.equal(r.status, "invalid_name");
});

// --- setActiveDashboard ---

test("setActiveDashboard: miembro activo → ok + update app_users", async () => {
  const { supabase, captured } = fakeDb({ selects: { dashboard_members: [{ id: "m1" }] } });
  const r = await setActiveDashboard(supabase, { userId: "u1", dashboardId: "d2" });
  assert.equal(r.status, "ok");
  assert.ok(captured.updates.some((u) => u.table === "app_users" && u.payload.active_dashboard_id === "d2"));
});

test("setActiveDashboard: no es miembro → forbidden, sin update", async () => {
  const { supabase, captured } = fakeDb({ selects: { dashboard_members: [] } });
  const r = await setActiveDashboard(supabase, { userId: "u1", dashboardId: "dX" });
  assert.equal(r.status, "forbidden");
  assert.equal(captured.updates.length, 0);
});
