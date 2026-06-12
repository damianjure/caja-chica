import test from "node:test";
import assert from "node:assert/strict";

import { canWriteToScope, fetchScopedMovimientos, resolveDataAccessScope } from "../src/server/dataScope.ts";
import type { AppSession, DataAccessScope } from "../src/server/contracts.ts";

function createMovimientosClient(rowsSeed: unknown[]) {
  const callLog: Array<{ table: string; type: string; args: unknown[] }> = [];
  return {
    callLog,
    client: {
      from(table: string) {
        let rows = table === "movimientos" ? [...rowsSeed] : [];
        const api: any = {
          select(...args: unknown[]) { callLog.push({ table, type: "select", args }); return api; },
          is(column: string, value: unknown) {
            callLog.push({ table, type: "is", args: [column, value] });
            rows = (rows as any[]).filter((row: any) => value === null ? row[column] == null : row[column] === value);
            return api;
          },
          order(...args: unknown[]) { callLog.push({ table, type: "order", args }); return api; },
          eq(column: string, value: unknown) {
            callLog.push({ table, type: "eq", args: [column, value] });
            rows = (rows as any[]).filter((row: any) => row[column] === value);
            return api;
          },
          range(from: number, to: number) {
            callLog.push({ table, type: "range", args: [from, to] });
            return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
          },
        };
        return api;
      },
    },
  };
}

const session: AppSession = {
  userId: "user-1",
  email: "user@example.com",
  role: "member",
  status: "active",
};

const scope: DataAccessScope = {
  dashboardId: "dashboard-1",
  membershipRole: "owner",
  memberPermissions: {},
};

test("fetchScopedMovimientos pagina todos los movimientos sin límite silencioso de 2000", async () => {
  const rows = Array.from({ length: 2501 }, (_, index) => ({
    id: `mov-${index}`,
    dashboard_id: "dashboard-1",
    deleted_at: null,
    created_at: new Date(2026, 0, 1).toISOString(),
  }));
  const supabase = createMovimientosClient(rows);

  const result = await fetchScopedMovimientos(supabase.client as any, session, scope);

  assert.equal(result.length, 2501);
  assert.deepEqual(
    supabase.callLog.filter((entry) => entry.type === "range").map((entry) => entry.args),
    [[0, 999], [1000, 1999], [2000, 2999]],
  );
});

test("resolveDataAccessScope elige membresía primaria de forma determinística", async () => {
  const rows = [
    {
      dashboard_id: "viewer-dashboard",
      user_id: "user-1",
      status: "active",
      role: "viewer",
      permissions: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
    {
      dashboard_id: "owner-dashboard",
      user_id: "user-1",
      status: "active",
      role: "owner",
      permissions: {},
      created_at: "2026-02-01T00:00:00.000Z",
    },
  ];
  const supabase = {
    from(table: string) {
      let filtered = table === "dashboard_members" ? [...rows] : [];
      const api: any = {
        select() { return api; },
        eq(column: string, value: unknown) {
          filtered = filtered.filter((row: any) => row[column] === value);
          return api;
        },
        limit(n: number) {
          return Promise.resolve({ data: filtered.slice(0, n), error: null });
        },
      };
      return api;
    },
  };

  const scope = await resolveDataAccessScope(supabase as any, session);

  assert.deepEqual(scope, {
    dashboardId: "owner-dashboard",
    membershipRole: "owner",
    memberPermissions: {},
  });
});

test("resolveDataAccessScope respeta el dashboard activo elegido por el usuario", async () => {
  const rows = [
    { dashboard_id: "owner-dashboard", user_id: "user-1", status: "active", role: "owner", permissions: {}, created_at: "2026-02-01T00:00:00.000Z" },
    { dashboard_id: "pyme-dashboard", user_id: "user-1", status: "active", role: "owner", permissions: {}, created_at: "2026-03-01T00:00:00.000Z" },
  ];
  const supabase = {
    from(table: string) {
      let filtered: any[] = table === "dashboard_members" ? [...rows] : table === "app_users" ? [{ active_dashboard_id: "pyme-dashboard" }] : [];
      const api: any = {
        select() { return api; },
        eq(column: string, value: unknown) { filtered = filtered.filter((row: any) => column in row ? row[column] === value : true); return api; },
        limit(n: number) { return Promise.resolve({ data: filtered.slice(0, n), error: null }); },
      };
      return api;
    },
  };
  const scope = await resolveDataAccessScope(supabase as any, session);
  assert.equal(scope.dashboardId, "pyme-dashboard");
});

test("resolveDataAccessScope excluye membresías revocadas aunque tengan rol superior", async () => {
  const rows = [
    {
      dashboard_id: "owner-dashboard",
      user_id: "user-1",
      status: "revoked",
      role: "owner",
      permissions: {},
      created_at: "2026-02-01T00:00:00.000Z",
    },
    {
      dashboard_id: "viewer-dashboard",
      user_id: "user-1",
      status: "active",
      role: "viewer",
      permissions: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  ];
  const supabase = {
    from(table: string) {
      let filtered = table === "dashboard_members" ? [...rows] : [];
      const api: any = {
        select() { return api; },
        eq(column: string, value: unknown) {
          filtered = filtered.filter((row: any) => row[column] === value);
          return api;
        },
        limit(n: number) {
          return Promise.resolve({ data: filtered.slice(0, n), error: null });
        },
      };
      return api;
    },
  };

  const scope = await resolveDataAccessScope(supabase as any, session);

  assert.deepEqual(scope, {
    dashboardId: "viewer-dashboard",
    membershipRole: "viewer",
    memberPermissions: {},
  });
});

test("canWriteToScope solo permite roles de escritura conocidos (allowlist)", () => {
  assert.equal(canWriteToScope({ dashboardId: null, membershipRole: null, memberPermissions: {} }), true);
  assert.equal(canWriteToScope({ dashboardId: "d", membershipRole: "owner", memberPermissions: {} }), true);
  assert.equal(canWriteToScope({ dashboardId: "d", membershipRole: "editor", memberPermissions: {} }), true);
  assert.equal(canWriteToScope({ dashboardId: "d", membershipRole: "viewer", memberPermissions: {} }), false);
  // un rol read-only futuro distinto de "viewer" NO debe ganar escritura
  assert.equal(canWriteToScope({ dashboardId: "d", membershipRole: "auditor" as any, memberPermissions: {} }), false);
});

test("resolveDataAccessScope loguea warning y cae a legacy ante error de schema", async () => {
  const supabase = {
    from() {
      const api: any = {
        select() { return api; },
        eq() { return api; },
        limit() {
          return Promise.resolve({ data: null, error: { message: 'relation "dashboard_members" does not exist' } });
        },
      };
      return api;
    },
  };

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => { warnings.push(args); };
  try {
    const scope = await resolveDataAccessScope(supabase as any, session);
    assert.deepEqual(scope, { dashboardId: null, membershipRole: null, memberPermissions: {} });
    assert.equal(warnings.length, 1);
  } finally {
    console.warn = originalWarn;
  }
});
