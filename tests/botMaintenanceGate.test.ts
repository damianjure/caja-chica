import test from "node:test";
import assert from "node:assert/strict";

// ---------------------------------------------------------------------------
// We mock isWriteBlocked from the maintenance module before importing the
// gate so that tests control the returned value.
// ---------------------------------------------------------------------------

import { maintenanceCache } from "../src/server/maintenance.ts";
import { assertBotWritable } from "../src/bot/maintenance-gate.ts";

function makeCtx(replySpy: { called: boolean; message: string | null }) {
  return {
    reply: async (msg: string) => {
      replySpy.called = true;
      replySpy.message = msg;
    },
  } as any;
}

// ---------------------------------------------------------------------------
// 1. Returns true and does NOT reply when status is 'none'
// ---------------------------------------------------------------------------

test("assertBotWritable returns true and does not reply when status is none", async () => {
  maintenanceCache.state = { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();

  const spy = { called: false, message: null as string | null };
  const ctx = makeCtx(spy);

  const result = await assertBotWritable(ctx);

  assert.equal(result, true, "should return true");
  assert.equal(spy.called, false, "should not reply");
});

// ---------------------------------------------------------------------------
// 2. Returns false and replies maintenance message when status is 'active'
// ---------------------------------------------------------------------------

test("assertBotWritable returns false and replies when status is active", async () => {
  maintenanceCache.state = { status: "active", started_at: new Date().toISOString(), scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();

  const spy = { called: false, message: null as string | null };
  const ctx = makeCtx(spy);

  const result = await assertBotWritable(ctx);

  assert.equal(result, false, "should return false");
  assert.equal(spy.called, true, "should reply");
  assert.ok(spy.message?.includes("mantenimiento"), "reply should mention maintenance");
});

// ---------------------------------------------------------------------------
// 3. Returns false and replies when status is 'grace' (new writes blocked per spec)
// ---------------------------------------------------------------------------

test("assertBotWritable returns false and replies when status is grace", async () => {
  maintenanceCache.state = { status: "grace", started_at: null, scheduled_at: null, grace_ends_at: new Date(Date.now() + 60_000).toISOString(), estimated_end_at: null, message: null };
  maintenanceCache.cachedAt = Date.now();

  const spy = { called: false, message: null as string | null };
  const ctx = makeCtx(spy);

  const result = await assertBotWritable(ctx);

  assert.equal(result, false, "should return false during grace");
  assert.equal(spy.called, true, "should reply during grace");
});

// ---------------------------------------------------------------------------
// 4. Read-only command (buscar) does NOT import assertBotWritable
//    We verify this by checking the source text of movements.ts — the
//    /buscar handler is read-only and must not contain the gate call.
// ---------------------------------------------------------------------------

test("read-only /buscar command does not call assertBotWritable", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(
    new URL("../src/bot/commands/movements.ts", import.meta.url),
    "utf-8",
  );

  // Find the buscar command block; verify assertBotWritable not present near it
  const buscarIdx = source.indexOf('command("buscar"');
  assert.ok(buscarIdx !== -1, "buscar command must exist in movements.ts");

  // Extract a 400-char window around /buscar to check for gate call
  const window = source.slice(buscarIdx, buscarIdx + 400);
  assert.ok(
    !window.includes("assertBotWritable"),
    "read-only /buscar should NOT call assertBotWritable",
  );
});
