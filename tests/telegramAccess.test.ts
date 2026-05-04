import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTelegramDataScope,
  buildTelegramWriteOwnership,
  canEditViaTelegram,
  hasTelegramAccess,
  resolveTelegramIdentityByChatId,
  resolveTelegramIdentityByToken,
} from "../src/server/telegramAccess.ts";

function createSupabaseStub(seed: {
  usuarios?: unknown[];
  dashboardMembers?: unknown[];
}) {
  const callLog: Array<{ table: string; type: string; args: unknown[] }> = [];

  const builder = (table: string) => {
    let rows = [...(table === "usuarios" ? seed.usuarios ?? [] : seed.dashboardMembers ?? [])];

    const api = {
      select(...args: unknown[]) {
        callLog.push({ table, type: "select", args });
        return api;
      },
      eq(column: string, value: string | number) {
        callLog.push({ table, type: "eq", args: [column, value] });
        rows = rows.filter((row: any) => row[column] === value);
        return api;
      },
      gt(column: string, value: string | number) {
        callLog.push({ table, type: "gt", args: [column, value] });
        rows = rows.filter((row: any) => row[column] > value);
        return api;
      },
      limit(limit: number) {
        callLog.push({ table, type: "limit", args: [limit] });
        rows = rows.slice(0, limit);
        return Promise.resolve({ data: rows, error: null });
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

test("resuelve identidad de Telegram por chat hacia user_id/dashboard_id cuando existe membresía", async () => {
  const supabase = createSupabaseStub({
    usuarios: [
      {
        id: "link-1",
        user_id: "editor-1",
        dashboard_id: "dashboard-1",
        owner_user_id: "legacy-owner",
        chat_id: 123,
        username: "editor",
        reminders_enabled: true,
        link_token_expires_at: null,
      },
    ],
    dashboardMembers: [
      {
        user_id: "editor-1",
        dashboard_id: "dashboard-1",
        role: "editor",
        status: "active",
      },
    ],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 123);

  assert.deepEqual(linked, {
    id: "link-1",
    userId: "editor-1",
    dashboardId: "dashboard-1",
    ownerUserId: "legacy-owner",
    role: "editor",
    permissions: {},
    username: "editor",
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  });
  assert.equal(hasTelegramAccess(linked), true);
  assert.equal(canEditViaTelegram(linked), true);
});

test("cae al modelo legacy owner_user_id cuando no existe dashboard_id", async () => {
  const supabase = createSupabaseStub({
    usuarios: [
      {
        id: "link-legacy",
        link_token: "legacy-token",
        owner_user_id: "user-1",
        chat_id: 999,
        username: "legacy",
        reminders_enabled: true,
        link_token_expires_at: "2099-01-01T00:00:00.000Z",
      },
    ],
  });

  const linked = await resolveTelegramIdentityByToken(supabase.client, "legacy-token");
  assert.deepEqual(linked, {
    id: "link-legacy",
    userId: null,
    dashboardId: null,
    ownerUserId: "user-1",
    role: null,
    permissions: {},
    username: "legacy",
    remindersEnabled: true,
    linkTokenExpiresAt: "2099-01-01T00:00:00.000Z",
  });

  const byChat = await resolveTelegramIdentityByChatId(supabase.client, 999);
  assert.deepEqual(byChat, {
    id: "link-legacy",
    userId: null,
    dashboardId: null,
    ownerUserId: "user-1",
    role: null,
    permissions: {},
    username: "legacy",
    remindersEnabled: true,
    linkTokenExpiresAt: "2099-01-01T00:00:00.000Z",
  });
  assert.equal(canEditViaTelegram(byChat), true);
});

test("viewer puede leer por Telegram pero no editar", () => {
  const linked = {
    id: "link-viewer",
    userId: "viewer-1",
    dashboardId: "dashboard-1",
    ownerUserId: null,
    role: "viewer" as const,
    permissions: {},
    username: "viewer",
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  };

  assert.equal(hasTelegramAccess(linked), true);
  assert.equal(canEditViaTelegram(linked), false);
  assert.deepEqual(buildTelegramWriteOwnership(linked), {
    owner_user_id: "viewer-1",
    dashboard_id: "dashboard-1",
    created_by_user_id: "viewer-1",
  });

  const eqCalls: Array<[string, string]> = [];
  const query = {
    eq(column: string, value: string) {
      eqCalls.push([column, value]);
      return query;
    },
  };

  applyTelegramDataScope(query, linked);
  assert.deepEqual(eqCalls, [["dashboard_id", "dashboard-1"]]);
});

test("Telegram prioriza dashboard_id sobre owner_user_id legacy cuando ambos existen", async () => {
  const supabase = createSupabaseStub({
    usuarios: [
      {
        id: "link-1",
        user_id: "editor-1",
        dashboard_id: "dashboard-1",
        owner_user_id: "legacy-owner",
        chat_id: 555,
        username: "editor",
        reminders_enabled: true,
        link_token_expires_at: null,
      },
    ],
    dashboardMembers: [
      {
        user_id: "editor-1",
        dashboard_id: "dashboard-1",
        role: "editor",
        status: "active",
      },
    ],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 555);
  const eqCalls: Array<[string, string]> = [];
  const query = {
    eq(column: string, value: string) {
      eqCalls.push([column, value]);
      return query;
    },
  };

  applyTelegramDataScope(query, linked!);
  assert.deepEqual(eqCalls, [["dashboard_id", "dashboard-1"]]);
});

// --- Tests para flujo multiusuario (telegram_links) ---

function createMultiuserSupabaseStub(seed: {
  telegramLinks?: unknown[];
  dashboardMembers?: unknown[];
  usuarios?: unknown[];
}) {
  const builder = (table: string) => {
    let rows: unknown[];
    if (table === "telegram_links") rows = [...(seed.telegramLinks ?? [])];
    else if (table === "dashboard_members") rows = [...(seed.dashboardMembers ?? [])];
    else rows = [...(seed.usuarios ?? [])];

    const api: any = {
      select() { return api; },
      eq(column: string, value: unknown) {
        rows = (rows as any[]).filter((r: any) => r[column] === value);
        return api;
      },
      gt(column: string, value: unknown) {
        rows = (rows as any[]).filter((r: any) => r[column] > value);
        return api;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return api;
  };

  return {
    client: { from: (table: string) => builder(table) },
  };
}

test("resolver usa telegram_links cuando existe vínculo activo de editor", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{
      id: "tl-1",
      telegram_user_id: 111,
      telegram_username: "editor_user",
      dashboard_id: "dash-1",
      app_user_id: "app-user-editor",
      status: "active",
      linked_at: "2026-01-01T00:00:00.000Z",
    }],
    dashboardMembers: [{
      user_id: "app-user-editor",
      dashboard_id: "dash-1",
      role: "editor",
      status: "active",
      permissions: { delete_any: false, export_drive: true, invite_telegram: false },
    }],
    usuarios: [],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 111);

  assert.ok(linked, "debe resolver");
  assert.equal(linked!.userId, "app-user-editor");
  assert.equal(linked!.dashboardId, "dash-1");
  assert.equal(linked!.role, "editor");
  assert.deepEqual(linked!.permissions, { delete_any: false, export_drive: true, invite_telegram: false });
});

test("resolver rechaza vínculo pending_owner_confirm — no da acceso", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{
      id: "tl-pending",
      telegram_user_id: 222,
      telegram_username: "newuser",
      dashboard_id: "dash-1",
      app_user_id: "app-user-new",
      status: "pending_owner_confirm",
      linked_at: null,
    }],
    dashboardMembers: [],
    usuarios: [],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 222);
  assert.equal(linked, null, "pending no debe dar acceso");
});

test("resolver cae a usuarios legacy cuando no hay telegram_link activo", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [],
    dashboardMembers: [],
    usuarios: [{
      id: "u-legacy",
      user_id: null,
      dashboard_id: null,
      owner_user_id: "owner-legacy",
      chat_id: 333,
      username: "legacy_owner",
      reminders_enabled: true,
      link_token_expires_at: null,
    }],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 333);
  assert.ok(linked, "debe resolver via legacy");
  assert.equal(linked!.ownerUserId, "owner-legacy");
  assert.equal(linked!.userId, null);
});

test("viewer no puede editar — hasTelegramAccess true, canEditViaTelegram false", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{
      id: "tl-viewer",
      telegram_user_id: 444,
      telegram_username: "viewer_user",
      dashboard_id: "dash-1",
      app_user_id: "app-user-viewer",
      status: "active",
      linked_at: "2026-01-01T00:00:00.000Z",
    }],
    dashboardMembers: [{
      user_id: "app-user-viewer",
      dashboard_id: "dash-1",
      role: "viewer",
      status: "active",
      permissions: {},
    }],
    usuarios: [],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 444);
  assert.ok(linked);
  assert.equal(hasTelegramAccess(linked), true);
  assert.equal(canEditViaTelegram(linked), false);
  assert.equal(linked!.role, "viewer");
  assert.deepEqual(linked!.permissions, {});
});
