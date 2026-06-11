import test from "node:test";
import assert from "node:assert/strict";

import {
  createWhatsAppInviteToken,
  acceptWhatsAppInvite,
  confirmWhatsAppLink,
  revokeWhatsAppLink,
} from "../src/server/whatsappInvite.ts";

// Op-aware Supabase fake: select rows come from `selects[table]`, insert .select()
// from `inserted[table]`, update .select() from `updated[table]`. Captures writes.
function fakeDb(config: {
  selects?: Record<string, any[]>;
  inserted?: Record<string, any[]>;
  updated?: Record<string, any[]>;
} = {}) {
  const captured = { inserts: [] as any[], updates: [] as any[] };
  function builder(table: string) {
    let op: "select" | "insert" | "update" = "select";
    const resolve = () => {
      const data = op === "insert" ? (config.inserted?.[table] ?? [{ id: "new-id" }])
        : op === "update" ? (config.updated?.[table] ?? [])
        : (config.selects?.[table] ?? []);
      return { data, error: null };
    };
    const b: any = {
      select: () => b,
      insert: (payload: any) => { op = "insert"; captured.inserts.push({ table, payload }); return b; },
      update: (payload: any) => { op = "update"; captured.updates.push({ table, payload }); return b; },
      eq: () => b, neq: () => b, is: () => b, gt: () => b, order: () => b,
      limit: () => Promise.resolve(resolve()),
      then: (r: (v: any) => void) => r(resolve()),
    };
    return b;
  }
  return { supabase: { from: builder } as any, captured };
}

const TOKEN_ROW = { id: "t1", dashboard_id: "d1", target_user_id: "u1", expires_at: "2999-01-01T00:00:00.000Z", status: "pending" };

test("createWhatsAppInviteToken: expira pendientes + inserta el nuevo", async () => {
  const { supabase, captured } = fakeDb();
  const out = await createWhatsAppInviteToken(supabase, {
    dashboardId: "d1", targetUserId: "u1", createdByUserId: "owner", token: "abc", expiresAt: "2030-01-01",
  });
  assert.equal(out.token, "abc");
  assert.ok(captured.updates.some((u) => u.payload.status === "expired"));
  assert.ok(captured.inserts.some((i) => i.payload.token === "abc" && i.payload.status === "pending"));
});

test("acceptWhatsAppInvite: token válido + sin link previo → linked + pending_owner_confirm", async () => {
  const { supabase, captured } = fakeDb({
    selects: { whatsapp_invite_tokens: [TOKEN_ROW], whatsapp_links: [] },
    inserted: { whatsapp_links: [{ id: "link-9" }] },
  });
  const r = await acceptWhatsAppInvite(supabase, { token: "abc", phone: "549351", name: "Dami" });
  assert.equal(r.status, "linked");
  assert.equal(r.status === "linked" && r.dashboardId, "d1");
  const insert = captured.inserts.find((i) => i.table === "whatsapp_links");
  assert.equal(insert.payload.status, "pending_owner_confirm");
  assert.equal(insert.payload.whatsapp_phone, "549351");
  assert.ok(captured.updates.some((u) => u.table === "whatsapp_invite_tokens" && u.payload.status === "claimed"));
});

test("acceptWhatsAppInvite: token inexistente → invalid_token", async () => {
  const { supabase } = fakeDb({ selects: { whatsapp_invite_tokens: [] } });
  const r = await acceptWhatsAppInvite(supabase, { token: "nope", phone: "5" });
  assert.equal(r.status, "invalid_token");
});

test("acceptWhatsAppInvite: token vencido → expired", async () => {
  const { supabase } = fakeDb({
    selects: { whatsapp_invite_tokens: [{ ...TOKEN_ROW, expires_at: "2000-01-01T00:00:00.000Z" }] },
  });
  const r = await acceptWhatsAppInvite(supabase, { token: "abc", phone: "5", now: new Date("2026-06-11") });
  assert.equal(r.status, "expired");
});

test("acceptWhatsAppInvite: número ya vinculado → pivot_blocked", async () => {
  const { supabase, captured } = fakeDb({
    selects: { whatsapp_invite_tokens: [TOKEN_ROW], whatsapp_links: [{ id: "old", dashboard_id: "dX", status: "active" }] },
  });
  const r = await acceptWhatsAppInvite(supabase, { token: "abc", phone: "549351" });
  assert.equal(r.status, "pivot_blocked");
  assert.equal(captured.inserts.filter((i) => i.table === "whatsapp_links").length, 0);
});

test("confirmWhatsAppLink: encuentra pending → confirmed true", async () => {
  const { supabase } = fakeDb({ updated: { whatsapp_links: [{ id: "link-9" }] } });
  const r = await confirmWhatsAppLink(supabase, { linkId: "link-9", dashboardId: "d1" });
  assert.equal(r.confirmed, true);
});

test("confirmWhatsAppLink: nada que confirmar → confirmed false", async () => {
  const { supabase } = fakeDb({ updated: { whatsapp_links: [] } });
  const r = await confirmWhatsAppLink(supabase, { linkId: "x", dashboardId: "d1" });
  assert.equal(r.confirmed, false);
});

test("revokeWhatsAppLink: revoca un link existente", async () => {
  const { supabase, captured } = fakeDb({ updated: { whatsapp_links: [{ id: "link-9" }] } });
  const r = await revokeWhatsAppLink(supabase, { linkId: "link-9", dashboardId: "d1" });
  assert.equal(r.revoked, true);
  assert.ok(captured.updates.some((u) => u.payload.status === "revoked"));
});
