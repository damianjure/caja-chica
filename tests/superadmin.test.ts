import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

function makeSupabaseStub(opts: {
  appUsers?: any[];
  movimientosCount?: number;
} = {}) {
  const captured: { table: string; op: string; data?: unknown }[] = [];
  const appUsersTable = opts.appUsers ?? [];

  const client = {
    from(table: string) {
      let rows: any[] = table === "app_users" ? [...appUsersTable] : [];
      const filters: Array<{ col: string; val: unknown }> = [];

      const exec = () => {
        const filtered = rows.filter((row) =>
          filters.every((f) => row[f.col] === f.val),
        );
        return filtered;
      };

      const builder: any = {
        select(_cols?: string, opts?: { count?: string; head?: boolean }) {
          captured.push({ table, op: "select" });
          if (opts?.count === "exact" && opts?.head) {
            // count query
            return {
              eq(col: string, val: unknown) {
                filters.push({ col, val });
                return this;
              },
              is(col: string, val: unknown) {
                if (val === null) filters.push({ col, val: null });
                return this;
              },
              then(resolve: (r: { count: number; data: null; error: null }) => void) {
                resolve({ count: opts.count === "exact" ? opts.head ? (opts.head ? exec().length : 0) : 0 : 0, data: null, error: null });
              },
            };
          }
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push({ col, val });
          return builder;
        },
        is(col: string, val: unknown) {
          if (val === null) filters.push({ col, val: null });
          return builder;
        },
        order() {
          return builder;
        },
        limit(_n: number) {
          return Promise.resolve({ data: exec(), error: null });
        },
        maybeSingle() {
          const r = exec();
          return Promise.resolve({ data: r[0] ?? null, error: null });
        },
        single() {
          const r = exec();
          return Promise.resolve({ data: r[0] ?? null, error: null });
        },
        update(data: Record<string, unknown>) {
          captured.push({ table, op: "update", data });
          const upd: any = {
            eq(col: string, val: unknown) {
              filters.push({ col, val });
              const target = rows.find((r) => r[col] === val);
              if (target) Object.assign(target, data);
              return Promise.resolve({ error: null });
            },
          };
          return upd;
        },
        insert(data: any) {
          captured.push({ table, op: "insert", data });
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
    auth: {
      admin: {
        async signOut() {
          captured.push({ table: "auth", op: "signOut" });
          return { error: null };
        },
      },
      async getUser() {
        return { data: { user: null } };
      },
    },
  };
  return { client, captured };
}

async function withServer(
  session: AppSession | null,
  deps: Partial<AppDeps>,
  fn: (baseUrl: string) => Promise<void>,
) {
  const stub = makeSupabaseStub(deps as any);
  const app = createApp({
    supabase: (deps.supabase as any) ?? (stub.client as any),
    genAI: { models: { async generateContent() { return { text: "{}" }; } } } as any,
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    resolveSession: async () => session,
    ...deps,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const addr = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

const baseSession: AppSession = {
  userId: "user-1",
  email: "user@example.com",
  role: "member",
  status: "active",
};

const superadminSession: AppSession = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "superadmin",
  status: "active",
};

test("paused user can GET but not POST", async () => {
  const session: AppSession = { ...baseSession, status: "paused" };
  await withServer(session, {}, async (baseUrl) => {
    const get = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: "Bearer t" },
    });
    assert.equal(get.status, 200);

    const post = await fetch(`${baseUrl}/api/movimientos`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ items: [] }),
    });
    assert.equal(post.status, 423);
    const body = await post.json();
    assert.equal(body.error, "user_paused");
  });
});

test("active user is not blocked", async () => {
  await withServer(baseSession, {}, async (baseUrl) => {
    const get = await fetch(`${baseUrl}/api/me`, {
      headers: { Authorization: "Bearer t" },
    });
    assert.equal(get.status, 200);
  });
});

test("admin/users/:id/status requires superadmin (admin role rejected)", async () => {
  const adminSession: AppSession = { ...baseSession, role: "admin", userId: "admin-1" };
  await withServer(adminSession, {}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users/other-user/status`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    assert.equal(res.status, 403);
  });
});

test("superadmin cannot change own status", async () => {
  const stub = makeSupabaseStub({
    appUsers: [
      { user_id: superadminSession.userId, email: superadminSession.email, role: "superadmin", status: "active" },
    ],
  });
  await withServer(superadminSession, { supabase: stub.client as any }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users/${superadminSession.userId}/status`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "cannot_change_own_status");
  });
});

test("superadmin pauses another user — writes update + audit log", async () => {
  const stub = makeSupabaseStub({
    appUsers: [
      { user_id: "target-1", email: "victim@example.com", role: "member", status: "active" },
    ],
  });
  await withServer(superadminSession, { supabase: stub.client as any }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users/target-1/status`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paused", reason: "abuse" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "paused");

    const updates = stub.captured.filter((c) => c.table === "app_users" && c.op === "update");
    assert.equal(updates.length, 1);
    const auditInserts = stub.captured.filter((c) => c.table === "audit_logs" && c.op === "insert");
    assert.equal(auditInserts.length, 1);
    const auditEntry = auditInserts[0].data as any;
    assert.equal(auditEntry.action, "pause");
    assert.equal(auditEntry.entity_type, "app_user");
    assert.equal(auditEntry.entity_id, "target-1");
  });
});

test("superadmin blocks another user — triggers signOut", async () => {
  const stub = makeSupabaseStub({
    appUsers: [
      { user_id: "target-2", email: "victim2@example.com", role: "member", status: "active" },
    ],
  });
  await withServer(superadminSession, { supabase: stub.client as any }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users/target-2/status`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "blocked" }),
    });
    assert.equal(res.status, 200);

    const signOutCalls = stub.captured.filter((c) => c.table === "auth" && c.op === "signOut");
    assert.equal(signOutCalls.length, 1);
  });
});

test("invalid status payload returns 400", async () => {
  await withServer(superadminSession, {}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users/target/status`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ status: "invalid" }),
    });
    assert.equal(res.status, 400);
  });
});

test("superadmin role change writes audit log", async () => {
  const stub = makeSupabaseStub({
    appUsers: [
      { user_id: "target-3", email: "x@example.com", role: "member", status: "active" },
    ],
  });
  await withServer(superadminSession, { supabase: stub.client as any }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users/target-3/role`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(res.status, 200);

    const audit = stub.captured.find((c) => c.table === "audit_logs" && c.op === "insert");
    assert.ok(audit);
    assert.equal((audit!.data as any).action, "role_change");
  });
});

test("invalid role returns 400", async () => {
  await withServer(superadminSession, {}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/users/target/role`, {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ role: "hacker" }),
    });
    assert.equal(res.status, 400);
  });
});
