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

function createMinimalSupabaseStub(maintenanceRow?: any) {
  const row = maintenanceRow ?? { id: 1, status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null, notification_sent_30min: false };

  return {
    from(table: string) {
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
        single() {
          if (table === "maintenance_windows") {
            return Promise.resolve({ data: row, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(..._args: unknown[]) {
          return {
            select() {
              return Promise.resolve({ data: [{ id: "x" }], error: null });
            },
          };
        },
        upsert(_payload: unknown, _opts?: unknown) {
          return {
            select(_c?: string) {
              return {
                single() {
                  return Promise.resolve({ data: { ...row, ...((_payload as any) ?? {}) }, error: null });
                },
              };
            },
          };
        },
        update(_payload: unknown) {
          return {
            eq(..._args: unknown[]) {
              return Promise.resolve({ data: [], error: null });
            },
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
// 1. GET /api/maintenance/status — public, no auth required
// ---------------------------------------------------------------------------

test("GET /api/maintenance/status returns 200 with state (no auth)", async () => {
  makeNoneCache();
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/maintenance/status`);
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.status, "none");
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/maintenance/activate — superadmin only, member gets 403
// ---------------------------------------------------------------------------

test("POST /api/maintenance/activate returns 403 for member", async () => {
  makeNoneCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/maintenance/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({}),
      });
      assert.equal(res.status, 403);
    },
  );
});

// ---------------------------------------------------------------------------
// 3. POST /api/maintenance/activate — superadmin sets status to grace
// ---------------------------------------------------------------------------

test("POST /api/maintenance/activate sets status to grace for superadmin", async () => {
  makeNoneCache();
  await withServer(
    { resolveSession: async () => superadminSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/maintenance/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ message: "Updating servers" }),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      // After activation, status should be grace
      assert.equal(body.status, "grace");
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 4. POST /api/maintenance/schedule — superadmin sets status to scheduled
// ---------------------------------------------------------------------------

test("POST /api/maintenance/schedule sets status to scheduled for superadmin", async () => {
  makeNoneCache();
  const scheduledAt = new Date(Date.now() + 3_600_000).toISOString(); // 1 hour from now
  await withServer(
    { resolveSession: async () => superadminSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/maintenance/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ scheduledAt }),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.status, "scheduled");
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 5. POST /api/maintenance/end — superadmin clears status to none
// ---------------------------------------------------------------------------

test("POST /api/maintenance/end clears status to none for superadmin", async () => {
  makeActiveCache();
  await withServer(
    { resolveSession: async () => superadminSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/maintenance/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.status, "none");
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 6. POST /api/maintenance/schedule — 403 for member
// ---------------------------------------------------------------------------

test("POST /api/maintenance/schedule returns 403 for member", async () => {
  makeNoneCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/maintenance/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ scheduledAt: new Date(Date.now() + 3600_000).toISOString() }),
      });
      assert.equal(res.status, 403);
    },
  );
});

// ---------------------------------------------------------------------------
// 7. POST /api/maintenance/end — 403 for member
// ---------------------------------------------------------------------------

test("POST /api/maintenance/end returns 403 for member", async () => {
  makeActiveCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/maintenance/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      });
      assert.equal(res.status, 403);
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 8. Write route returns 503 during active maintenance
// ---------------------------------------------------------------------------

test("POST /api/movimientos returns 503 during active maintenance", async () => {
  makeActiveCache();
  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ text: "gasto" }),
      });
      assert.equal(res.status, 503);
      const body = await res.json() as any;
      assert.equal(body.code, "MAINTENANCE_ACTIVE");
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 9. Write route succeeds during grace period (write is BLOCKED in grace too per spec)
// Note: spec says writes ARE blocked during grace. This test verifies 503 during grace.
// ---------------------------------------------------------------------------

test("POST /api/movimientos returns 503 during grace period", async () => {
  maintenanceCache.state = { status: "grace", started_at: null, scheduled_at: null, grace_ends_at: new Date(Date.now() + 60_000).toISOString(), estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();

  await withServer(
    { resolveSession: async () => memberSession },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/movimientos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
        body: JSON.stringify({ text: "gasto" }),
      });
      assert.equal(res.status, 503);
    },
  );
  makeNoneCache();
});

// ---------------------------------------------------------------------------
// 10. POST /api/maintenance/activate — Telegram notification IS attempted when bot is wired
// ---------------------------------------------------------------------------

test("POST /api/maintenance/activate calls bot.api.sendMessage when bot is provided in deps", async () => {
  makeNoneCache();

  let sendMessageCalled = false;
  const mockBot = {
    api: {
      sendMessage: async (_chatId: string | number, _text: string, _opts?: unknown) => {
        sendMessageCalled = true;
        return {};
      },
      getFile: async (_fileId: string) => ({ file_path: undefined }),
    },
  };

  const supabaseWithTelegramLinks = (() => {
    const baseRow = { id: 1, status: "grace", started_at: null, scheduled_at: null, grace_ends_at: new Date(Date.now() + 300_000).toISOString(), estimated_end_at: null, message: null, notification_sent_30min: false };
    return {
      from(table: string) {
        const api: any = {
          select(..._args: unknown[]) { return api; },
          eq(..._args: unknown[]) { return api; },
          is(..._args: unknown[]) { return api; },
          not(..._args: unknown[]) { return api; },
          order(..._args: unknown[]) { return api; },
          limit(_n: number) {
            if (table === "telegram_links") {
              const p: any = Promise.resolve({ data: [{ telegram_chat_id: "12345", user_id: "u1" }], error: null });
              p.single = () => Promise.resolve({ data: null, error: null });
              return p;
            }
            const p: any = Promise.resolve({ data: [], error: null });
            p.single = () => Promise.resolve({ data: null, error: null });
            return p;
          },
          single() {
            if (table === "maintenance_windows") return Promise.resolve({ data: baseRow, error: null });
            return Promise.resolve({ data: null, error: null });
          },
          insert(..._args: unknown[]) {
            return { select() { return Promise.resolve({ data: [{ id: "x" }], error: null }); } };
          },
          upsert(_payload: unknown) {
            return {
              select(_c?: string) {
                return {
                  single() {
                    return Promise.resolve({ data: { ...baseRow, ...((_payload as any) ?? {}) }, error: null });
                  },
                };
              },
            };
          },
          update(_payload: unknown) {
            return { eq(..._args: unknown[]) { return Promise.resolve({ data: [], error: null }); } };
          },
        };
        return api;
      },
      rpc(_fn: string, _args?: unknown) { return Promise.resolve({ data: null, error: null }); },
      auth: { admin: { deleteUser: async () => ({ error: null }) } },
    } as any;
  })();

  const app = createApp({
    supabase: supabaseWithTelegramLinks,
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    bot: mockBot,
    resolveSession: async () => superadminSession,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/maintenance/activate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer tok" },
      body: JSON.stringify({ message: "Deploying update" }),
    });
    assert.equal(res.status, 200);
    // Give the fire-and-forget notification a moment to run
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(sendMessageCalled, true, "bot.api.sendMessage should have been called");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }

  makeNoneCache();
});
