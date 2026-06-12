import test from "node:test";
import assert from "node:assert/strict";

import { getAiHealth, WARN_FALLBACKS_24H } from "../src/server/aiEvents.ts";

const NOW = new Date("2026-06-12T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3600 * 1000).toISOString();

// Fake supabase: ai_events query resolves to the seeded rows (already filtered
// by the test to what's relevant); getAiHealth does its own date math.
function fakeSupabase(rows: Array<{ created_at: string; outcome: string }> | { error: { message: string } }) {
  const b: any = {
    select: () => b,
    gte: () => b,
    order: () => b,
    limit: () => Promise.resolve("error" in (rows as any) ? { data: null, error: (rows as any).error } : { data: rows, error: null }),
  };
  return { from: () => b } as any;
}

test("getAiHealth: cuenta fallbacks y caídas por ventana", async () => {
  const rows = [
    { created_at: hoursAgo(1), outcome: "fallback_used" },
    { created_at: hoursAgo(2), outcome: "fallback_used" },
    { created_at: hoursAgo(48), outcome: "fallback_used" }, // fuera de 24h, dentro de 7d
    { created_at: hoursAgo(3), outcome: "both_exhausted" },
  ];
  const h = await getAiHealth(fakeSupabase(rows), NOW);
  assert.equal(h.last24h.fallback_used, 2);
  assert.equal(h.last24h.both_exhausted, 1);
  assert.equal(h.last7d.fallback_used, 3);
  assert.equal(h.last7d.both_exhausted, 1);
});

test("getAiHealth: status critical si hubo caída dura en 24h", async () => {
  const h = await getAiHealth(fakeSupabase([{ created_at: hoursAgo(1), outcome: "both_exhausted" }]), NOW);
  assert.equal(h.status, "critical");
});

test("getAiHealth: status warn con muchos fallbacks en 24h, sin caídas", async () => {
  const rows = Array.from({ length: WARN_FALLBACKS_24H }, () => ({ created_at: hoursAgo(1), outcome: "fallback_used" }));
  const h = await getAiHealth(fakeSupabase(rows), NOW);
  assert.equal(h.status, "warn");
});

test("getAiHealth: status ok sin eventos", async () => {
  const h = await getAiHealth(fakeSupabase([]), NOW);
  assert.equal(h.status, "ok");
  assert.equal(h.last7d.fallback_used, 0);
});

test("getAiHealth: tabla faltante (pre-migración) → ok con ceros", async () => {
  const h = await getAiHealth(fakeSupabase({ error: { message: 'relation "ai_events" does not exist' } }), NOW);
  assert.equal(h.status, "ok");
  assert.equal(h.last24h.both_exhausted, 0);
});
