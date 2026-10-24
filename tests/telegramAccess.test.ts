import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTelegramDataScope,
  buildTelegramWriteOwnership,
  canDeleteMovementViaTelegram,
  canEditViaTelegram,
  canEditMovementViaTelegram,
  hasTelegramAccess,
  resolveTelegramIdentityByChatId,
} from "../src/server/telegramAccess.ts";

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

test("resolver: el owner se resuelve por telegram_links con rol owner", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{
      id: "tl-owner",
      telegram_user_id: 444,
      telegram_username: "owner_user",
      dashboard_id: "dash-1",
      app_user_id: "owner-1",
      status: "active",
      linked_at: "2026-01-01T00:00:00.000Z",
    }],
    dashboardMembers: [{ user_id: "owner-1", dashboard_id: "dash-1", role: "owner", status: "active", permissions: {} }],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 444);
  assert.ok(linked);
  assert.equal(linked!.userId, "owner-1");
  assert.equal(linked!.dashboardId, "dash-1");
  assert.equal(linked!.role, "owner");
  assert.equal(hasTelegramAccess(linked), true);
  assert.equal(canEditViaTelegram(linked), true);

  const eqCalls: Array<[string, string]> = [];
  const query = { eq(column: string, value: string) { eqCalls.push([column, value]); return query; } };
  applyTelegramDataScope(query, linked!);
  assert.deepEqual(eqCalls, [["dashboard_id", "dash-1"]]);
});

test("resolver: un chat que solo existe en la tabla legacy usuarios ya no tiene acceso", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [],
    dashboardMembers: [{ user_id: "owner-legacy", dashboard_id: "dash-1", role: "owner", status: "active" }],
    usuarios: [{
      id: "u-legacy",
      user_id: "owner-legacy",
      dashboard_id: "dash-1",
      owner_user_id: "owner-legacy",
      chat_id: 333,
      username: "legacy_owner",
      reminders_enabled: true,
      link_token_expires_at: null,
    }],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 333);
  assert.equal(linked, null, "el flujo legacy está retirado: sin telegram_links activo no hay acceso");
});

test("resolver: revocar el vínculo del owner le quita el acceso aunque siga en usuarios", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{ id: "tl-owner", telegram_user_id: 555, dashboard_id: "dash-1", app_user_id: "owner-1", status: "revoked" }],
    dashboardMembers: [{ user_id: "owner-1", dashboard_id: "dash-1", role: "owner", status: "active" }],
    usuarios: [{ id: "u-1", user_id: "owner-1", dashboard_id: "dash-1", owner_user_id: "owner-1", chat_id: 555 }],
  });

  assert.equal(await resolveTelegramIdentityByChatId(supabase.client, 555), null);
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

test("editor Telegram solo puede editar/borrar movimientos propios sin toggles any", () => {
  const linked = {
    id: "tl-editor",
    userId: "editor-1",
    dashboardId: "dash-1",
    ownerUserId: null,
    role: "editor" as const,
    permissions: {},
    username: "editor",
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  };

  assert.equal(
    canEditMovementViaTelegram({ owner_user_id: "editor-1", created_by_user_id: "editor-1" }, linked),
    true,
  );
  assert.equal(
    canDeleteMovementViaTelegram({ owner_user_id: "editor-1", created_by_user_id: "editor-1" }, linked),
    true,
  );
  assert.equal(
    canEditMovementViaTelegram({ owner_user_id: "other-1", created_by_user_id: "other-1" }, linked),
    false,
  );
  assert.equal(
    canDeleteMovementViaTelegram({ owner_user_id: "other-1", created_by_user_id: "other-1" }, linked),
    false,
  );
});

test("editor Telegram respeta edit_any/delete_any para movimientos ajenos", () => {
  const linked = {
    id: "tl-editor-any",
    userId: "editor-1",
    dashboardId: "dash-1",
    ownerUserId: null,
    role: "editor" as const,
    permissions: { edit_any: true, delete_any: true },
    username: "editor",
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  };
  const otherMovement = { owner_user_id: "other-1", created_by_user_id: "other-1" };

  assert.equal(canEditMovementViaTelegram(otherMovement, linked), true);
  assert.equal(canDeleteMovementViaTelegram(otherMovement, linked), true);
});

test("buildTelegramWriteOwnership graba al actor como owner_user_id, no al dueño del dashboard", () => {
  // En un dashboard compartido, owner_user_id debe ser quien carga (actor),
  // alineado con buildWriteOwnership del path web. created_by_user_id ya traquea el creador
  // y dashboard_id da el scope; ownerUserId del dueño NO debe pisar al actor.
  const linked = {
    id: "tl-editor",
    userId: "editor-1",
    dashboardId: "dash-1",
    ownerUserId: "dashboard-owner-9",
    role: "editor" as const,
    permissions: {},
    username: "editor",
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  };

  assert.deepEqual(buildTelegramWriteOwnership(linked), {
    owner_user_id: "editor-1",
    dashboard_id: "dash-1",
    created_by_user_id: "editor-1",
  });
});

test("owner Telegram puede editar/borrar movimientos del dashboard", () => {
  const linked = {
    id: "tl-owner",
    userId: "owner-1",
    dashboardId: "dash-1",
    ownerUserId: null,
    role: "owner" as const,
    permissions: {},
    username: "owner",
    remindersEnabled: true,
    linkTokenExpiresAt: null,
  };
  const otherMovement = { owner_user_id: "editor-1", created_by_user_id: "editor-1" };

  assert.equal(canEditMovementViaTelegram(otherMovement, linked), true);
  assert.equal(canDeleteMovementViaTelegram(otherMovement, linked), true);
});
