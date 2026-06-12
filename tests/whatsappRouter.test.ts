import test from "node:test";
import assert from "node:assert/strict";

import { handleWhatsAppMessage, WHATSAPP_NOT_LINKED, WHATSAPP_HELP } from "../src/channels/whatsapp/router.ts";
import { resolveWhatsAppIdentityByPhone, canWhatsAppDo } from "../src/server/whatsappAccess.ts";
import { FakeChannel, fakeIncoming } from "../src/channels/fake.ts";
import { WaSessionStore } from "../src/channels/whatsapp/session.ts";

// Supabase fake that answers per-table queries by a tiny script.
function fakeSupabase(tables: Record<string, unknown[]>) {
  function builder(rows: unknown[]) {
    const b: any = {
      select: () => b,
      insert: () => b,
      update: () => b,
      eq: () => b,
      neq: () => b,
      gt: () => b,
      is: () => b,
      order: () => b,
      limit: () => Promise.resolve({ data: rows, error: null }),
      range: () => Promise.resolve({ data: rows, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: rows, error: null }),
    };
    return b;
  }
  return { from: (t: string) => builder(tables[t] ?? []) } as any;
}

function fakeGenAI(text: string) {
  return { models: { async generateContent() { return { text }; } } } as any;
}

const waIncoming = (partial: Parameters<typeof fakeIncoming>[0] = {}) =>
  fakeIncoming({ ...partial, identity: { channel: "whatsapp", chatKey: "wa:549351", userKey: "549351", ...partial.identity } });

// --- whatsappAccess ---

test("resolveWhatsAppIdentityByPhone: link activo + miembro → record", async () => {
  const supabase = fakeSupabase({
    whatsapp_links: [{ id: "l1", app_user_id: "u1", dashboard_id: "d1", whatsapp_name: "Dami", status: "active" }],
    dashboard_members: [{ role: "editor", status: "active", permissions: { export_drive: true } }],
  });
  const rec = await resolveWhatsAppIdentityByPhone(supabase, "549351");
  assert.ok(rec);
  assert.equal(rec!.userId, "u1");
  assert.equal(rec!.dashboardId, "d1");
  assert.equal(rec!.role, "editor");
});

test("resolveWhatsAppIdentityByPhone: sin link → null", async () => {
  const rec = await resolveWhatsAppIdentityByPhone(fakeSupabase({ whatsapp_links: [] }), "000");
  assert.equal(rec, null);
});

test("canWhatsAppDo: viewer puede read, no write", () => {
  const viewer = { userId: "u", dashboardId: "d", ownerUserId: null, role: "viewer" as const, permissions: {}, username: null, remindersEnabled: true, linkTokenExpiresAt: null };
  assert.equal(canWhatsAppDo(viewer, "read"), true);
  assert.equal(canWhatsAppDo(viewer, "write_movimiento"), false);
});

// --- router ---

test("handleWhatsAppMessage: número no vinculado → mensaje de vinculación", async () => {
  const ch = new FakeChannel(waIncoming({ text: "hola" }));
  await handleWhatsAppMessage(ch, { supabase: fakeSupabase({ whatsapp_links: [] }), genAI: fakeGenAI("{}"), sessions: new WaSessionStore() });
  assert.equal(ch.ofKind("text")[0].text, WHATSAPP_NOT_LINKED);
});

test("handleWhatsAppMessage: /preguntar vinculado → corre el ask flow", async () => {
  const supabase = fakeSupabase({
    whatsapp_links: [{ id: "l1", app_user_id: "u1", dashboard_id: "d1", status: "active" }],
    dashboard_members: [{ role: "owner", status: "active", permissions: {} }],
    movimientos: [],
    recurrentes: [],
  });
  const ch = new FakeChannel(waIncoming({ command: "preguntar", text: "cuánto gasté" }));
  await handleWhatsAppMessage(ch, { supabase, genAI: fakeGenAI('{"answer": "Gastaste $8.000."}'), sessions: new WaSessionStore() });
  assert.ok(ch.outbound.some((o) => o.kind === "typing"));
  const last = ch.last();
  assert.equal(last && last.kind === "text" ? last.text : "", "Gastaste $8.000.");
});

test("handleWhatsAppMessage: /preguntar sin texto → pide la consulta", async () => {
  const supabase = fakeSupabase({
    whatsapp_links: [{ id: "l1", app_user_id: "u1", dashboard_id: "d1", status: "active" }],
    dashboard_members: [{ role: "owner", status: "active", permissions: {} }],
  });
  const ch = new FakeChannel(waIncoming({ command: "preguntar", text: "" }));
  await handleWhatsAppMessage(ch, { supabase, genAI: fakeGenAI("{}"), sessions: new WaSessionStore() });
  assert.match(ch.ofKind("text")[0].text, /Escribí tu consulta/);
});

test("handleWhatsAppMessage: /vincular <token> redime el invite (sin estar vinculado)", async () => {
  // No whatsapp_links yet; token is valid; anti-pivot select returns empty.
  const supabase = fakeSupabase({
    whatsapp_invite_tokens: [{ id: "t1", dashboard_id: "d1", target_user_id: "u1", expires_at: "2999-01-01T00:00:00.000Z", status: "pending" }],
    whatsapp_links: [],
  });
  const ch = new FakeChannel(waIncoming({ command: "vincular", text: "abc123" }));
  await handleWhatsAppMessage(ch, { supabase, genAI: fakeGenAI("{}"), sessions: new WaSessionStore() });
  assert.match(ch.ofKind("text")[0].text, /confirme/i);
});

test("handleWhatsAppMessage: /vincular sin código → pide el código", async () => {
  const ch = new FakeChannel(waIncoming({ command: "vincular", text: "" }));
  await handleWhatsAppMessage(ch, { supabase: fakeSupabase({}), genAI: fakeGenAI("{}"), sessions: new WaSessionStore() });
  assert.match(ch.ofKind("text")[0].text, /código/i);
});

test("handleWhatsAppMessage: comando desconocido / texto libre → ayuda", async () => {
  const supabase = fakeSupabase({
    whatsapp_links: [{ id: "l1", app_user_id: "u1", dashboard_id: "d1", status: "active" }],
    dashboard_members: [{ role: "owner", status: "active", permissions: {} }],
  });
  const ch = new FakeChannel(waIncoming({ text: "pagué 4500 de luz" }));
  await handleWhatsAppMessage(ch, { supabase, genAI: fakeGenAI("{}"), sessions: new WaSessionStore() });
  assert.equal(ch.ofKind("text")[0].text, WHATSAPP_HELP);
});
