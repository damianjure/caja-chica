import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

function createSupabaseStub(
  seed:
    | unknown[]
    | {
        movimientos?: unknown[];
        empresas?: unknown[];
        presupuestos?: unknown[];
        dashboardMembers?: unknown[];
        usuarios?: unknown[];
        appUsers?: unknown[];
        dashboardInvitations?: unknown[];
        auditLogs?: unknown[];
        empresaDeleteBackups?: unknown[];
        reportExports?: unknown[];
        telegramLinks?: unknown[];
        telegramInviteTokens?: unknown[];
      } = [],
) {
  const callLog: Array<{ table: string; type: string; args: unknown[] }> = [];
  const dataSeed = Array.isArray(seed) ? { movimientos: seed } : seed;
  const invitationRows = [
    {
      id: "invite-1",
      email: "nuevo@empresa.com",
      role: "member",
      status: "pending",
      invite_token: "token-123",
      expires_at: null,
      created_at: "2026-04-30T00:00:00.000Z",
      accepted_at: null,
    },
  ];
  const appUsersRows = dataSeed.appUsers ?? [
    {
      user_id: "admin-1",
      email: "admin@example.com",
      role: "admin",
      status: "active",
      invited_by: null,
      invited_at: null,
      created_at: "2026-04-30T00:00:00.000Z",
    },
  ];
  const usuariosRows = dataSeed.usuarios ?? [
    {
      id: "user-link-1",
      owner_user_id: "user-1",
      chat_id: null,
      username: null,
      linked_at: null,
      link_token: "bot-token-123",
      link_token_expires_at: "2026-04-30T01:00:00.000Z",
      reminders_enabled: true,
    },
  ];
  const dashboardMembersRows = dataSeed.dashboardMembers ?? [];
  const dashboardInvitationsRows = dataSeed.dashboardInvitations ?? [];
  const empresasRows = dataSeed.empresas ?? [];
  const presupuestosRows = dataSeed.presupuestos ?? [];
  const auditLogsRows = dataSeed.auditLogs ?? [];
  const empresaDeleteBackupsRows = dataSeed.empresaDeleteBackups ?? [];
  const reportExportsRows = dataSeed.reportExports ?? [];
  const telegramLinksRows = dataSeed.telegramLinks ?? [];
  const telegramInviteTokensRows = dataSeed.telegramInviteTokens ?? [];

  const builder = (table: string) => {
    let rows = [...(dataSeed.movimientos ?? [])];
    if (table === "user_invitations") rows = [...invitationRows];
    if (table === "app_users") rows = [...appUsersRows];
    if (table === "usuarios") rows = [...usuariosRows];
    if (table === "dashboard_members") rows = [...dashboardMembersRows];
    if (table === "dashboard_invitations") rows = [...dashboardInvitationsRows];
    if (table === "empresas") rows = [...empresasRows];
    if (table === "presupuestos") rows = [...presupuestosRows];
    if (table === "audit_logs") rows = [...auditLogsRows];
    if (table === "empresa_delete_backups") rows = [...empresaDeleteBackupsRows];
    if (table === "report_exports") rows = [...reportExportsRows];
    if (table === "telegram_links") rows = [...telegramLinksRows];
    if (table === "telegram_invite_tokens") rows = [...telegramInviteTokensRows];
    const api = {
      select(...args: unknown[]) {
        callLog.push({ table, type: "select", args });
        return api;
      },
      order(...args: unknown[]) {
        callLog.push({ table, type: "order", args });
        return api;
      },
      limit(limit: number) {
        callLog.push({ table, type: "limit", args: [limit] });
        rows = rows.slice(0, limit);
        return Promise.resolve({ data: rows, error: null });
      },
      lt(column: string, value: string) {
        callLog.push({ table, type: "lt", args: [column, value] });
        rows = rows.filter((row: any) => row[column] < value);
        return api;
      },
      eq(column: string, value: unknown) {
        callLog.push({ table, type: "eq", args: [column, value] });
        rows = rows.filter((row: any) => row[column] === value);
        return api;
      },
      is(column: string, value: unknown) {
        callLog.push({ table, type: "is", args: [column, value] });
        rows = rows.filter((row: any) => {
          const cell = row[column];
          if (value === null) return cell === null || cell === undefined;
          return cell === value;
        });
        return api;
      },
      in(column: string, values: unknown[]) {
        callLog.push({ table, type: "in", args: [column, values] });
        rows = rows.filter((row: any) => values.includes(row[column]));
        return api;
      },
      insert(...args: unknown[]) {
        callLog.push({ table, type: "insert", args });
        const payload = Array.isArray(args[0]) ? (args[0] as any[])[0] : null;
        return {
          select() {
            if (table === "movimientos") {
              return Promise.resolve({ data: [{ id: "saved-1", ...payload }], error: null });
            }
            if (table === "audit_logs" || table === "empresa_delete_backups" || table === "report_exports") {
              return Promise.resolve({ data: [{ id: `${table}-1`, ...payload }], error: null });
            }
            if (table === "presupuestos") {
              return {
                single() {
                  return Promise.resolve({ data: { id: "budget-1", ...payload }, error: null });
                },
              };
            }
            return Promise.resolve({ data: rows, error: null });
          },
          single() {
            if (table === "empresas") {
              return Promise.resolve({ data: { id: "saved-1", ...payload }, error: null });
            }
            return Promise.resolve({ data: rows[0], error: null });
          },
        };
      },
      upsert(...args: unknown[]) {
        callLog.push({ table, type: "upsert", args });
        const payload = Array.isArray(args[0]) ? (args[0] as any[])[0] : (args[0] as any);
        rows = [{
          ...(table === "presupuestos" ? { id: "budget-1" } : {}),
          ...((rows[0] as Record<string, unknown> | undefined) ?? {}),
          ...(payload ?? {}),
        }];
        return {
          select() {
            return {
              single() {
                return Promise.resolve({ data: rows[0], error: null });
              },
            };
          },
        };
      },
      delete() {
        callLog.push({ table, type: "delete", args: [] });
        return {
          eq(column: string, value: string) {
            callLog.push({ table, type: "eq", args: [column, value] });
            return Promise.resolve({ error: null });
          },
          neq(column: string, value: string) {
            callLog.push({ table, type: "neq", args: [column, value] });
            return Promise.resolve({ error: null });
          },
        };
      },
      update(...args: unknown[]) {
        callLog.push({ table, type: "update", args });
        let filteredRows = [...rows];
        const updateBuilder: any = {
          eq(column: string, value: string) {
            callLog.push({ table, type: "eq", args: [column, value] });
            filteredRows = filteredRows.filter((row: any) => row[column] === value);
            return updateBuilder;
          },
          select(_cols?: string) {
            return updateBuilder;
          },
          limit(_n: number) {
            return Promise.resolve({ data: filteredRows, error: null });
          },
          then(resolve: (v: unknown) => void) {
            resolve({ data: filteredRows, error: null });
          },
        };
        return updateBuilder;
      },
      single() {
        callLog.push({ table, type: "single", args: [] });
        return Promise.resolve({ data: null, error: null });
      },
    };

    return api;
  };

  return {
    client: {
      from(table: string) {
        return builder(table);
      },
    },
    callLog,
  };
}

async function withServer(
  deps: Partial<AppDeps>,
  fn: (baseUrl: string) => Promise<void>,
) {
  const supabase = createSupabaseStub();
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
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

test("CORS preflight permite DELETE para orígenes autorizados", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/movimientos/abc`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "DELETE",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("access-control-allow-methods"),
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
  });
});

test("CORS preflight permite PATCH para edición autenticada", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/movimientos/abc`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "PATCH",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("access-control-allow-methods"),
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
  });
});

test("CORS preflight permite Authorization para requests autenticados", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/presupuestos`, {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:5173",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "authorization,content-type",
      },
    });

    assert.equal(res.status, 200);
    assert.equal(
      res.headers.get("access-control-allow-headers"),
      "Authorization, Content-Type, X-Admin-Token",
    );
  });
});

test("requiere sesión para consultar el perfil", async () => {
  await withServer({}, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/me`);

    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: "unauthorized" });
  });
});

test("devuelve perfil para usuario autenticado activo", async () => {
  await withServer(
    {
      resolveSession: async () => memberSession,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/me`, {
        headers: {
          Authorization: "Bearer valid-token",
        },
      });

      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), {
        id: "user-1",
        email: "member@example.com",
        role: "member",
        status: "active",
      });
    },
  );
});

const memberSession: AppSession = {
  userId: "user-1",
  email: "member@example.com",
  role: "member",
  status: "active",
};

const adminSession: AppSession = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "admin",
  status: "active",
};

const viewerSession: AppSession = {
  userId: "viewer-1",
  email: "viewer@example.com",
  role: "member",
  status: "active",
};

test("rechaza payload inválido al guardar movimientos", async () => {
  await withServer(
    {
      resolveSession: async () => memberSession,
    },
    async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/movimientos`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ items: [{ tipo: "egreso" }], originalText: 123 }),
    });

      assert.equal(res.status, 400);
      assert.deepEqual(await res.json(), { error: "invalid_request" });
    },
  );
});

test("guarda movimientos conciliados por defecto", async () => {
  const supabase = createSupabaseStub();
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ tipo: "egreso", moneda: "ARS", monto: 1000, categoria: "Insumos", empresa: "Taller", descripcion: "Compra" }],
        originalText: "compra",
      }),
    });

    assert.equal(res.status, 200);
    const insertCall = supabase.callLog.find((entry) => entry.table === "movimientos" && entry.type === "insert");
    const payload = Array.isArray(insertCall?.args[0]) ? (insertCall?.args[0] as any[])[0] : undefined;
    assert.equal(payload?.conciliado, true);
    assert.equal(payload?.conciliado_notas, null);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("bloquea borrado masivo cuando la ruta peligrosa no está habilitada", async () => {
  await withServer(
    {
      resolveSession: async () => adminSession,
    },
    async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/movimientos/all`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "forbidden" });
    },
  );
});

test("pagina movimientos con cursor before y nextCursor", async () => {
  const rows = [
    { id: "1", owner_user_id: "user-1", created_at: "2026-04-30T00:00:00.000Z" },
    { id: "2", owner_user_id: "user-1", created_at: "2026-04-29T00:00:00.000Z" },
    { id: "3", owner_user_id: "user-1", created_at: "2026-04-28T00:00:00.000Z" },
  ];
  const supabase = createSupabaseStub(rows);
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/movimientos?limit=2&before=2026-04-30T00:00:00.000Z`,
      {
        headers: {
          Authorization: "Bearer valid-token",
        },
      },
    );

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      items: [
        { id: "2", owner_user_id: "user-1", created_at: "2026-04-29T00:00:00.000Z" },
        { id: "3", owner_user_id: "user-1", created_at: "2026-04-28T00:00:00.000Z" },
      ],
      nextCursor: "2026-04-28T00:00:00.000Z",
    });
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "movimientos" &&
          entry.type === "lt" &&
          entry.args[0] === "created_at",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("admin puede crear invitaciones", async () => {
  await withServer(
    {
      resolveSession: async () => adminSession,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/invitations`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "nuevo@empresa.com", role: "member" }),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.email, "nuevo@empresa.com");
      assert.equal(body.role, "member");
      assert.equal(body.invite_url, "https://app.example.com/?invite=token-123");
    },
  );
});

test("genera token de vínculo para Telegram", async () => {
  await withServer(
    {
      resolveSession: async () => memberSession,
      telegramBotUsername: "cajachica_bot",
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/bot/connection/link-token`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.telegramDeepLink?.startsWith("https://t.me/cajachica_bot?start="), true);
      assert.equal(body.manualStartCode?.startsWith("/start "), true);
      assert.equal(body.pendingToken !== null, true);
    },
  );
});

test("genera token de vínculo para Telegram en dashboard compartido sin depender de unique(user_id)", async () => {
  const supabase = createSupabaseStub({
    usuarios: [],
    dashboardMembers: [
      { user_id: "user-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
    telegramBotUsername: "cajachica_bot",
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/bot/connection/link-token`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.telegramDeepLink?.startsWith("https://t.me/cajachica_bot?start="), true);
    const insertCall = supabase.callLog.find((entry) => entry.table === "usuarios" && entry.type === "insert");
    const payload = Array.isArray(insertCall?.args[0]) ? (insertCall?.args[0] as any[])[0] : undefined;
    assert.equal(payload?.user_id, "user-1");
    assert.equal(payload?.owner_user_id, "user-1");
    assert.equal(payload?.dashboard_id, "dashboard-1");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("scopea movimientos por owner_user_id", async () => {
  const supabase = createSupabaseStub([
    { id: "1", owner_user_id: "user-1", created_at: "2026-04-30T00:00:00.000Z" },
    { id: "2", owner_user_id: "other-user", created_at: "2026-04-29T00:00:00.000Z" },
  ]);
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos?limit=10`, {
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.items, [
      { id: "1", owner_user_id: "user-1", created_at: "2026-04-30T00:00:00.000Z" },
    ]);
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "movimientos" &&
          entry.type === "eq" &&
          entry.args[0] === "owner_user_id" &&
          entry.args[1] === "user-1",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("scopea movimientos por dashboard_id cuando existe membresía compartida", async () => {
  const supabase = createSupabaseStub({
    movimientos: [
      { id: "1", dashboard_id: "dashboard-1", created_at: "2026-04-30T00:00:00.000Z" },
      { id: "2", dashboard_id: "dashboard-2", created_at: "2026-04-29T00:00:00.000Z" },
    ],
    dashboardMembers: [
      { user_id: "viewer-1", dashboard_id: "dashboard-1", role: "viewer", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => viewerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos?limit=10`, {
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.items, [
      { id: "1", dashboard_id: "dashboard-1", created_at: "2026-04-30T00:00:00.000Z" },
    ]);
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "dashboard_members" &&
          entry.type === "eq" &&
          entry.args[0] === "user_id" &&
          entry.args[1] === "viewer-1",
      ),
    );
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "movimientos" &&
          entry.type === "eq" &&
          entry.args[0] === "dashboard_id" &&
          entry.args[1] === "dashboard-1",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("prioriza dashboard_id sobre owner_user_id legacy cuando ambos existen", async () => {
  const supabase = createSupabaseStub({
    movimientos: [
      {
        id: "1",
        dashboard_id: "dashboard-1",
        owner_user_id: "other-user",
        created_at: "2026-04-30T00:00:00.000Z",
      },
      {
        id: "2",
        dashboard_id: "dashboard-2",
        owner_user_id: "user-1",
        created_at: "2026-04-29T00:00:00.000Z",
      },
    ],
    dashboardMembers: [
      { user_id: "user-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos?limit=10`, {
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body.items, [
      {
        id: "1",
        dashboard_id: "dashboard-1",
        owner_user_id: "other-user",
        created_at: "2026-04-30T00:00:00.000Z",
      },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("bloquea escrituras para miembros viewer del dashboard compartido", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { user_id: "viewer-1", dashboard_id: "dashboard-1", role: "viewer", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => viewerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        originalText: "café 2500",
        items: [
          {
            tipo: "egreso",
            moneda: "ARS",
            monto: 2500,
            categoria: "Comida",
            empresa: "Personal",
            descripcion: "café",
          },
        ],
      }),
    });

    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "forbidden" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("mantiene owner_user_id legacy al guardar movimientos en dashboard compartido", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { user_id: "user-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        originalText: "café 2500",
        items: [
          {
            tipo: "egreso",
            moneda: "ARS",
            monto: 2500,
            categoria: "Comida",
            empresa: "Personal",
            descripcion: "café",
          },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const insertCall = supabase.callLog.find((entry) => entry.table === "movimientos" && entry.type === "insert");
    const payload = Array.isArray(insertCall?.args[0]) ? (insertCall?.args[0] as any[])[0] : undefined;
    assert.equal(payload?.dashboard_id, "dashboard-1");
    assert.equal(payload?.created_by_user_id, "user-1");
    assert.equal(payload?.owner_user_id, "user-1");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("bloquea generar vínculo de Telegram para miembros viewer del dashboard compartido", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { user_id: "viewer-1", dashboard_id: "dashboard-1", role: "viewer", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => viewerSession,
    telegramBotUsername: "cajachica_bot",
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/bot/connection/link-token`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 403);
    assert.deepEqual(await res.json(), { error: "forbidden" });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("lista miembros e invitaciones del dashboard compartido", async () => {
  const supabase = createSupabaseStub({
    appUsers: [
      {
        user_id: "owner-1",
        email: "owner@example.com",
        role: "member",
        status: "active",
        invited_by: null,
        invited_at: null,
        created_at: "2026-04-30T00:00:00.000Z",
      },
      {
        user_id: "editor-1",
        email: "editor@example.com",
        role: "member",
        status: "active",
        invited_by: null,
        invited_at: null,
        created_at: "2026-04-30T00:00:00.000Z",
      },
    ],
    dashboardMembers: [
      { id: "dm-1", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active", created_at: "2026-04-30T00:00:00.000Z" },
      { id: "dm-2", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active", created_at: "2026-04-30T00:00:00.000Z" },
    ],
    dashboardInvitations: [
      { id: "di-1", dashboard_id: "dashboard-1", email: "viewer@example.com", role: "viewer", status: "pending", invite_token: "dash-token-1", expires_at: null, created_at: "2026-04-30T00:00:00.000Z", accepted_at: null },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ({ ...memberSession, userId: "owner-1", email: "owner@example.com" }),
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/dashboard/members`, {
      headers: { Authorization: "Bearer valid-token" },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), {
      dashboardId: "dashboard-1",
      members: [
        { id: "dm-1", user_id: "owner-1", email: "owner@example.com", role: "owner", status: "active", created_at: "2026-04-30T00:00:00.000Z", permissions: {} },
        { id: "dm-2", user_id: "editor-1", email: "editor@example.com", role: "editor", status: "active", created_at: "2026-04-30T00:00:00.000Z", permissions: {} },
      ],
      invitations: [
        { id: "di-1", dashboard_id: "dashboard-1", email: "viewer@example.com", role: "viewer", status: "pending", invite_token: "dash-token-1", invite_url: "https://app.example.com/?invite=dash-token-1", expires_at: null, created_at: "2026-04-30T00:00:00.000Z", accepted_at: null },
      ],
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("owner puede invitar colaborador editor al dashboard y crea membresía si el usuario ya existe", async () => {
  const supabase = createSupabaseStub({
    appUsers: [
      {
        user_id: "owner-1",
        email: "owner@example.com",
        role: "member",
        status: "active",
        invited_by: null,
        invited_at: null,
        created_at: "2026-04-30T00:00:00.000Z",
      },
      {
        user_id: "editor-1",
        email: "editor@example.com",
        role: "member",
        status: "active",
        invited_by: null,
        invited_at: null,
        created_at: "2026-04-30T00:00:00.000Z",
      },
    ],
    dashboardMembers: [
      { id: "dm-1", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active", created_at: "2026-04-30T00:00:00.000Z" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ({ ...memberSession, userId: "owner-1", email: "owner@example.com" }),
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/dashboard/invitations`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: "editor@example.com", role: "editor" }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.email, "editor@example.com");
    assert.equal(body.role, "editor");
    assert.equal(body.status, "accepted");
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "dashboard_members" &&
          entry.type === "upsert" &&
          (entry.args[0] as Record<string, unknown>).user_id === "editor-1",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("sincroniza invitaciones pendientes de dashboard al autenticarse", async () => {
  const supabase = createSupabaseStub({
    dashboardInvitations: [
      { id: "di-1", dashboard_id: "dashboard-1", email: "member@example.com", role: "viewer", status: "pending", invite_token: "dash-token-1", expires_at: null, created_at: "2026-04-30T00:00:00.000Z", accepted_at: null },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/me`, {
      headers: { Authorization: "Bearer valid-token" },
    });

    assert.equal(res.status, 200);
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "dashboard_members" &&
          entry.type === "upsert" &&
          (entry.args[0] as Record<string, unknown>).dashboard_id === "dashboard-1",
      ),
    );
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "dashboard_invitations" &&
          entry.type === "update",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("owner puede revocar invitación pendiente del dashboard", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-1", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active", created_at: "2026-04-30T00:00:00.000Z" },
    ],
    dashboardInvitations: [
      { id: "di-1", dashboard_id: "dashboard-1", email: "viewer@example.com", role: "viewer", status: "pending", invite_token: "dash-token-1", expires_at: null, created_at: "2026-04-30T00:00:00.000Z", accepted_at: null },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ({ ...memberSession, userId: "owner-1", email: "owner@example.com" }),
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/dashboard/invitations/di-1/revoke`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "dashboard_invitations" &&
          entry.type === "update",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("permite editar un movimiento y registra audit log", async () => {
  const supabase = createSupabaseStub({
    movimientos: [
      {
        id: "mov-1",
        dashboard_id: "dashboard-1",
        created_at: "2026-04-30T00:00:00.000Z",
        tipo: "egreso",
        moneda: "ARS",
        monto: 2500,
        categoria: "Comida",
        empresa_nombre: "Personal",
        descripcion: "café",
        original_text: "café 2500",
      },
    ],
    dashboardMembers: [
      { user_id: "user-1", dashboard_id: "dashboard-1", role: "editor", status: "active", permissions: { edit_any: true } },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos/mov-1`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        monto: 3000,
        categoria: "Cafetería",
        descripcion: "café doble",
        empresa: "Personal",
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "movimientos" &&
          entry.type === "update" &&
          (entry.args[0] as Record<string, unknown>).monto === 3000,
      ),
    );
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "audit_logs" &&
          entry.type === "insert" &&
          (entry.args[0] as Array<Record<string, unknown>>)[0].action === "update",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("permite editar un movimiento del dashboard compartido", async () => {
  const supabase = createSupabaseStub({
    movimientos: [
      {
        id: "mov-legacy-1",
        owner_user_id: "user-1",
        dashboard_id: "dashboard-1",
        created_at: "2026-04-30T00:00:00.000Z",
        tipo: "egreso",
        moneda: "ARS",
        monto: 2500,
        categoria: "Comida",
        empresa_nombre: "Personal",
        descripcion: "café",
        original_text: "café 2500",
      },
    ],
    dashboardMembers: [
      { user_id: "user-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/movimientos/mov-legacy-1`, {
      method: "PATCH",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        monto: 5000,
        categoria: "Alimentos",
        descripcion: "media lunas",
        empresa: "Servicios Delta",
      }),
    });

    assert.equal(res.status, 200);
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "movimientos" &&
          entry.type === "update" &&
          (entry.args[0] as Record<string, unknown>).monto === 5000,
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("soft delete de empresa crea backup redundante y audit log", async () => {
  const supabase = createSupabaseStub({
    empresas: [
      {
        id: "emp-1",
        dashboard_id: "dashboard-1",
        nombre: "Taller",
        created_at: "2026-04-30T00:00:00.000Z",
      },
    ],
    movimientos: [
      {
        id: "mov-1",
        dashboard_id: "dashboard-1",
        empresa_nombre: "Taller",
        tipo: "ingreso",
        moneda: "ARS",
        monto: 50000,
        descripcion: "venta",
        created_at: "2026-04-30T00:00:00.000Z",
      },
    ],
    dashboardMembers: [
      { user_id: "user-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/empresas/emp-1`, {
      method: "DELETE",
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 200);
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "empresa_delete_backups" &&
          entry.type === "insert",
      ),
    );
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "audit_logs" &&
          entry.type === "insert" &&
          (entry.args[0] as Array<Record<string, unknown>>)[0].action === "delete",
      ),
    );
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "empresas" &&
          entry.type === "update" &&
          (entry.args[0] as Record<string, unknown>).deleted_at,
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("member no puede usar rutas admin", async () => {
  await withServer(
    {
      resolveSession: async () => memberSession,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/admin/users`, {
        headers: {
          Authorization: "Bearer valid-token",
        },
      });

      assert.equal(res.status, 403);
      assert.deepEqual(await res.json(), { error: "forbidden" });
    },
  );
});

test("guarda presupuestos por categoría y período", async () => {
  await withServer(
    {
      resolveSession: async () => memberSession,
    },
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/presupuestos`, {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          period: "2026-05",
          categoria: "Comida",
          moneda: "ARS",
          monto: 120000,
        }),
      });

      assert.equal(res.status, 201);
      assert.deepEqual(await res.json(), {
        id: "budget-1",
        period: "2026-05",
        categoria: "Comida",
        moneda: "ARS",
        monto: 120000,
        owner_user_id: "user-1",
      });
    },
  );
});

test("lista presupuestos filtrando por owner_user_id y período", async () => {
  const supabase = createSupabaseStub({
    presupuestos: [
      {
        id: "budget-1",
        owner_user_id: "user-1",
        period: "2026-05",
        categoria: "Comida",
        moneda: "ARS",
        monto: 120000,
      },
      {
        id: "budget-2",
        owner_user_id: "user-1",
        period: "2026-04",
        categoria: "Transporte",
        moneda: "ARS",
        monto: 50000,
      },
      {
        id: "budget-3",
        owner_user_id: "other-user",
        period: "2026-05",
        categoria: "Comida",
        moneda: "ARS",
        monto: 999999,
      },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/presupuestos?period=2026-05`,
      {
        headers: {
          Authorization: "Bearer valid-token",
        },
      },
    );

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      {
        id: "budget-1",
        owner_user_id: "user-1",
        period: "2026-05",
        categoria: "Comida",
        moneda: "ARS",
        monto: 120000,
      },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("permite conciliar un movimiento propio", async () => {
  const supabase = createSupabaseStub([
    {
      id: "mov-1",
      owner_user_id: "user-1",
      created_at: "2026-04-30T00:00:00.000Z",
      conciliado: false,
      conciliado_notas: null,
    },
  ]);
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(
      `http://127.0.0.1:${address.port}/api/movimientos/mov-1/conciliar`,
      {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conciliado: true,
          notas: "Match con extracto banco Galicia",
        }),
      },
    );

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true });
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "movimientos" &&
          entry.type === "update" &&
          (entry.args[0] as Record<string, unknown>).conciliado === true,
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("exporta CSV filtrado por período y empresa, y registra historial", async () => {
  const supabase = createSupabaseStub({
    movimientos: [
      {
        id: "mov-1",
        owner_user_id: "user-1",
        created_at: "2026-05-02T10:00:00.000Z",
        tipo: "ingreso",
        moneda: "ARS",
        monto: 5000,
        categoria: "Ventas",
        empresa_nombre: "Taller",
        descripcion: "Venta mostrador",
      },
      {
        id: "mov-2",
        owner_user_id: "user-1",
        created_at: "2026-05-01T10:00:00.000Z",
        tipo: "egreso",
        moneda: "ARS",
        monto: 1200,
        categoria: "Insumos",
        empresa_nombre: "Taller",
        descripcion: "Compra tornillos",
      },
      {
        id: "mov-3",
        owner_user_id: "user-1",
        created_at: "2026-05-02T11:00:00.000Z",
        tipo: "ingreso",
        moneda: "USD",
        monto: 400,
        categoria: "Ventas",
        empresa_nombre: "Otra",
        descripcion: "Venta externa",
      },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/report-exports`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        format: "csv",
        period: "day",
        anchorDate: "2026-05-02",
        company: "Taller",
        tipo: "all",
        moneda: "ARS",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.format, "csv");
    assert.equal(body.mimeType, "text/csv;charset=utf-8");
    assert.equal(body.record.totalMovements, 1);
    const csv = Buffer.from(body.contentBase64, "base64").toString("utf8");
    assert.match(csv, /Fecha,Tipo,Moneda,Monto,Categoría,Empresa,Descripción/);
    assert.match(csv, /Venta mostrador/);
    assert.ok(!csv.includes("Compra tornillos"));
    assert.ok(
      supabase.callLog.some(
        (entry) =>
          entry.table === "report_exports" &&
          entry.type === "insert" &&
          (entry.args[0] as Array<Record<string, unknown>>)[0].format === "csv",
      ),
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("exporta PDF y devuelve binario base64 con nombre de archivo", async () => {
  const supabase = createSupabaseStub({
    movimientos: [
      {
        id: "mov-1",
        owner_user_id: "user-1",
        created_at: "2026-05-02T10:00:00.000Z",
        tipo: "ingreso",
        moneda: "ARS",
        monto: 5000,
        categoria: "Ventas",
        empresa_nombre: "Taller",
        descripcion: "Venta mostrador",
      },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/report-exports`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        format: "pdf",
        period: "month",
        month: "2026-05",
        company: "all",
        tipo: "all",
        moneda: "all",
      }),
    });

    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.format, "pdf");
    assert.equal(body.mimeType, "application/pdf");
    assert.match(body.fileName, /\.pdf$/);
    const pdf = Buffer.from(body.contentBase64, "base64");
    assert.equal(pdf.subarray(0, 4).toString("utf8"), "%PDF");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("lista historial de exportaciones scopeado por owner_user_id", async () => {
  const supabase = createSupabaseStub({
    reportExports: [
      {
        id: "rep-1",
        owner_user_id: "user-1",
        created_at: "2026-05-02T10:00:00.000Z",
        format: "csv",
        period_label: "Día 2026-05-02",
        company: "Taller",
        tipo: "all",
        moneda: "ARS",
        total_movements: 1,
        file_name: "informe.csv",
      },
      {
        id: "rep-2",
        owner_user_id: "other-user",
        created_at: "2026-05-02T09:00:00.000Z",
        format: "pdf",
        period_label: "Mes 2026-05",
        company: "all",
        tipo: "all",
        moneda: "all",
        total_movements: 4,
        file_name: "otro.pdf",
      },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() {
          return { text: '{"intent":"REGISTRAR","items":[]}' };
        },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => memberSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/report-exports`, {
      headers: {
        Authorization: "Bearer valid-token",
      },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), [
      {
        id: "rep-1",
        owner_user_id: "user-1",
        created_at: "2026-05-02T10:00:00.000Z",
        format: "csv",
        period_label: "Día 2026-05-02",
        company: "Taller",
        tipo: "all",
        moneda: "ARS",
        total_movements: 1,
        file_name: "informe.csv",
      },
    ]);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

// ─── Telegram invite-token & links ────────────────────────────────────────────

const ownerSession: AppSession = {
  userId: "owner-1",
  email: "owner@example.com",
  role: "member",
  status: "active",
};

const editorSession: AppSession = {
  userId: "editor-1",
  email: "editor@example.com",
  role: "member",
  status: "active",
};

test("owner genera token de invitación Telegram para un editor del dashboard", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
      { id: "dm-editor", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
    telegramInviteTokens: [],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/invite-token`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: "editor-1" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body.token, "string");
    assert.equal(typeof body.expires_at, "string");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("editor sin permiso invite_telegram recibe 403 al generar token de invitación", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
      { id: "dm-editor", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active", permissions: {} },
    ],
    telegramInviteTokens: [],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => editorSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/invite-token`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: "some-user" }),
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("owner recibe 404 al invitar por Telegram a usuario que no pertenece al dashboard", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
    ],
    telegramInviteTokens: [],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/invite-token`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: "unknown-user" }),
    });
    assert.equal(res.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("lista links de Telegram del dashboard", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
    ],
    telegramLinks: [
      { id: "tl-1", dashboard_id: "dashboard-1", telegram_user_id: "tg-100", telegram_username: "user100", app_user_id: "editor-1", status: "active", linked_at: "2026-05-01T00:00:00.000Z", created_at: "2026-05-01T00:00:00.000Z" },
      { id: "tl-2", dashboard_id: "dashboard-1", telegram_user_id: "tg-200", telegram_username: "user200", app_user_id: "editor-2", status: "pending_owner_confirm", linked_at: null, created_at: "2026-05-02T00:00:00.000Z" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/links`, {
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body.links), true);
    assert.equal(body.links.length, 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("owner confirma link de Telegram pendiente", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
    ],
    telegramLinks: [
      { id: "tl-1", dashboard_id: "dashboard-1", app_user_id: "editor-1", status: "pending_owner_confirm", linked_at: null, created_at: "2026-05-01T00:00:00.000Z" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/links/tl-1/confirm`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.confirmed, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("editor recibe 403 al intentar confirmar link de Telegram", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-editor", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
    telegramLinks: [
      { id: "tl-1", dashboard_id: "dashboard-1", app_user_id: "some-user", status: "pending_owner_confirm", linked_at: null, created_at: "2026-05-01T00:00:00.000Z" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => editorSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/links/tl-1/confirm`, {
      method: "POST",
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("owner puede revocar el link de Telegram de otro usuario", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
    ],
    telegramLinks: [
      { id: "tl-1", dashboard_id: "dashboard-1", app_user_id: "editor-1", status: "active", linked_at: "2026-05-01T00:00:00.000Z", created_at: "2026-05-01T00:00:00.000Z" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/links/tl-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.revoked, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("editor puede revocar su propio link de Telegram", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-editor", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
    telegramLinks: [
      { id: "tl-1", dashboard_id: "dashboard-1", app_user_id: "editor-1", status: "active", linked_at: "2026-05-01T00:00:00.000Z", created_at: "2026-05-01T00:00:00.000Z" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => editorSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/links/tl-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.revoked, true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("editor recibe 403 al intentar revocar el link de otro usuario", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-editor", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
    telegramLinks: [
      { id: "tl-1", dashboard_id: "dashboard-1", app_user_id: "someone-else", status: "active", linked_at: "2026-05-01T00:00:00.000Z", created_at: "2026-05-01T00:00:00.000Z" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => editorSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/telegram/links/tl-1`, {
      method: "DELETE",
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

// ─── PATCH /api/dashboard/members/:id/permissions ─────────────────────────────

test("owner actualiza permisos de un editor del dashboard", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
      { id: "dm-editor-1", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active", permissions: {} },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/dashboard/members/dm-editor-1/permissions`, {
      method: "PATCH",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { export_drive: true, delete_any: false } }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.permissions.export_drive, true);
    assert.equal(body.permissions.delete_any, false);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("no se pueden establecer permisos en un viewer — recibe 400", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-owner", user_id: "owner-1", dashboard_id: "dashboard-1", role: "owner", status: "active" },
      { id: "dm-viewer-1", user_id: "viewer-2", dashboard_id: "dashboard-1", role: "viewer", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/dashboard/members/dm-viewer-1/permissions`, {
      method: "PATCH",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { export_drive: true } }),
    });
    assert.equal(res.status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});

test("editor recibe 403 al intentar cambiar permisos de un miembro", async () => {
  const supabase = createSupabaseStub({
    dashboardMembers: [
      { id: "dm-editor", user_id: "editor-1", dashboard_id: "dashboard-1", role: "editor", status: "active" },
    ],
  });
  const app = createApp({
    supabase: supabase.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => editorSession,
  });
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const address = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/dashboard/members/dm-editor/permissions`, {
      method: "PATCH",
      headers: { Authorization: "Bearer valid-token", "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { export_drive: true } }),
    });
    assert.equal(res.status, 403);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
});
