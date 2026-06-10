/**
 * Review 2026-06-09: supabase-js does NOT throw on insert errors — it returns
 * an { error } envelope. The audit helpers must surface those failures in the
 * logs (never silently) while staying best-effort (no throw → the parent
 * mutation already succeeded).
 */

import test from "node:test";
import assert from "node:assert/strict";

import { insertAuditLog, createEmpresaDeleteBackup } from "../src/server/audit.ts";

function stubSupabase(error: { message: string } | null) {
  return {
    from(_table: string) {
      return {
        insert(_payload: unknown) {
          return { select: () => Promise.resolve({ data: null, error }) };
        },
      };
    },
  } as any;
}

const session = { userId: "u1", email: "a@b.com", role: "member", status: "active" } as any;
const scope = { dashboardId: "d1", membershipRole: "owner", memberPermissions: {} } as any;

test("insertAuditLog: logs to console.error on error envelope, does not throw", async (t) => {
  const spy = t.mock.method(console, "error", () => {});
  await assert.doesNotReject(() =>
    insertAuditLog(stubSupabase({ message: "rls denied" }), { action: "x" }),
  );
  assert.ok(spy.mock.calls.length >= 1, "audit insert failure must be logged");
});

test("insertAuditLog: silent on missing-schema-artifact error envelope", async (t) => {
  const spy = t.mock.method(console, "error", () => {});
  await insertAuditLog(stubSupabase({ message: 'relation "audit_logs" does not exist' }), { action: "x" });
  assert.equal(spy.mock.calls.length, 0, "missing schema artifact stays silent");
});

test("insertAuditLog: no log when insert succeeds", async (t) => {
  const spy = t.mock.method(console, "error", () => {});
  await insertAuditLog(stubSupabase(null), { action: "x" });
  assert.equal(spy.mock.calls.length, 0);
});

test("createEmpresaDeleteBackup: logs to console.error on error envelope, does not throw", async (t) => {
  const spy = t.mock.method(console, "error", () => {});
  await assert.doesNotReject(() =>
    createEmpresaDeleteBackup(stubSupabase({ message: "constraint violation" }), {
      session,
      scope,
      empresa: { id: "e1" },
      movimientosSnapshot: [],
      source: "web",
    }),
  );
  assert.ok(spy.mock.calls.length >= 1, "backup insert failure must be logged");
});
