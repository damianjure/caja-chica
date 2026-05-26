import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";
import { maintenanceCache } from "../src/server/maintenance.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNoneCache() {
  maintenanceCache.state = { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();
}

function makeActiveCache() {
  maintenanceCache.state = { status: "active", started_at: new Date().toISOString(), scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();
}

function makeGraceCache() {
  maintenanceCache.state = { status: "grace", started_at: null, scheduled_at: null, grace_ends_at: new Date(Date.now() + 60_000).toISOString(), estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();
}

function createMinimalSupabaseStub() {
  return {
    from(_table: string) {
      const api: any = {
        select(..._args: unknown[]) { return api; },
        eq(..._args: unknown[]) { return api; },
        is(..._args: unknown[]) { return api; },
        not(..._args: unknown[]) { return api; },
        order(..._args: unknown[]) { return api; },
        limit(_n: number) {
          const p: any = Promise.resolve({ data: [], error: null });
          p.single = () => Promise.resolve({ data: null, error: null });
          return p;
        },
        single() { return Promise.resolve({ data: null, error: null }); },
        insert(..._args: unknown[]) {
          return { select() { return Promise.resolve({ data: [{ id: "x" }], error: null }); } };
        },
        upsert(..._args: unknown[]) {
          return {
            select(_c?: string) {
              return { single() { return Promise.resolve({ data: { id: 1, status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null }, error: null }); } };
            },
          };
        },
        update(..._args: unknown[]) {
          return {
            eq(..._args: unknown[]) { return Promise.resolve({ data: [], error: null }); },
          };
        },
      };
      return api;
    },
    rpc(_fn: string, _args?: unknown) { return Promise.resolve({ data: null, error: null }); },
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
  } as any;
}

const superadminSession: AppSession = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "superadmin",
  status: "active",
};

const memberSession: AppSession = {
  userId: "user-1",
  email: "member@example.com",
  role: "member",
  status: "active",
};

async function withServer(
  deps: Partial<AppDeps>,
  fn: (baseUrl: string) => Promise<void>,
) {
  const supabase = createMinimalSupabaseStub();
  const app = createApp({
    supabase,
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    ...deps,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

// ---------------------------------------------------------------------------
// 1. 503 on POST/PATCH/DELETE during active
// ---------------------------------------------------------------------------

test("maintenanceWriteGuard: returns 503 with MAINTENANCE_ACTIVE code during active", async () => {
  makeActiveCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ text: "test" }),
      });
      assert.equal(res.status, 503);
      const body = await res.json() as any;
      assert.equal(body.code, "MAINTENANCE_ACTIVE");
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 2. 503 on POST/PATCH/DELETE during grace
// ---------------------------------------------------------------------------

test("maintenanceWriteGuard: returns 503 during grace period", async () => {
  makeGraceCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/empresas`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ nombre: "TestCo" }),
      });
      assert.equal(res.status, 503);
      const body = await res.json() as any;
      assert.equal(body.code, "MAINTENANCE_ACTIVE");
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 3. GET allowed during active maintenance
// ---------------------------------------------------------------------------

test("maintenanceWriteGuard: GET requests pass through during active maintenance", async () => {
  makeActiveCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/maintenance/status`);
      // Should NOT be 503 (it may be 200 or another status depending on route)
      assert.notEqual(res.status, 503);
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 4. GET /api/maintenance/status is public (no auth)
// ---------------------------------------------------------------------------

test("GET /api/maintenance/status returns 200 without auth", async () => {
  makeNoneCache();
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/maintenance/status`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok("status" in body, "response should have a status field");
  });
});

// ---------------------------------------------------------------------------
// 5. /api/maintenance/* whitelist — not blocked during active
// ---------------------------------------------------------------------------

test("maintenanceWriteGuard: /api/maintenance/* is exempt from write block", async () => {
  makeActiveCache();
  await withServer(
    { resolveSession: async () => superadminSession },
    async (baseUrl) => {
      // POST /api/maintenance/end — should not get 503, even during active
      const res = await fetch(`${baseUrl}/api/maintenance/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      });
      // Not 503 (might be 200, 400, etc.)
      assert.notEqual(res.status, 503);
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 6. /api/health is never blocked
// ---------------------------------------------------------------------------

test("maintenanceWriteGuard: /api/health is not blocked", async () => {
  makeActiveCache();
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
  });
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 7. Write succeeds when maintenance is none
// ---------------------------------------------------------------------------

test("maintenanceWriteGuard: write routes pass when status is none", async () => {
  makeNoneCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ text: "test" }),
      });
      // Not 503 — might be 400/200 depending on stub
      assert.notEqual(res.status, 503);
    },
  );
});

// ---------------------------------------------------------------------------
// 8. Write succeeds during scheduled (no write block)
// ---------------------------------------------------------------------------

test("maintenanceWriteGuard: writes pass during scheduled state", async () => {
  maintenanceCache.state = { status: "scheduled", started_at: null, scheduled_at: new Date(Date.now() + 60_000).toISOString(), grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();

  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ text: "test" }),
      });
      assert.notEqual(res.status, 503);
    },
  );
  makeNoneCache();
});
