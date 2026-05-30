/**
 * TDD tests for bot welcome message (src/bot/welcome.ts)
 *
 * Covers:
 * - buildWelcomeMessage: pure copy builder
 *   - greeting with/without firstName
 *   - singular dashboard ("El dashboard al que tenés acceso es el de X")
 *   - plural dashboards (bullet list)
 *   - role labels (editor/viewer/owner) via DASHBOARD_ROLE_LABELS
 *   - empty dashboards → intro + outro, no access block
 * - fetchUserDashboards: I/O helper over dashboard_members + dashboards
 */

import test from "node:test";
import assert from "node:assert/strict";
import { buildWelcomeMessage, fetchUserDashboards } from "../src/bot/welcome.ts";

// ─────────────────────────────────────────────
// buildWelcomeMessage
// ─────────────────────────────────────────────

test("buildWelcomeMessage — greeting includes firstName when present", () => {
  const msg = buildWelcomeMessage([{ name: "Casa", role: "editor" }], "Juan");
  assert.ok(msg.startsWith("¡Hola Juan!"), `got: ${msg}`);
});

test("buildWelcomeMessage — greeting has no trailing space when firstName absent", () => {
  const msg = buildWelcomeMessage([{ name: "Casa", role: "editor" }]);
  assert.ok(msg.startsWith("¡Hola!"), `got: ${msg}`);
  assert.ok(!msg.startsWith("¡Hola !"), "should not have a dangling space before !");
});

test("buildWelcomeMessage — blank firstName treated as absent", () => {
  const msg = buildWelcomeMessage([{ name: "Casa", role: "editor" }], "   ");
  assert.ok(msg.startsWith("¡Hola!"), `got: ${msg}`);
});

test("buildWelcomeMessage — always includes the intro blurb and /menu outro", () => {
  const msg = buildWelcomeMessage([{ name: "Casa", role: "editor" }], "Juan");
  assert.ok(msg.includes("bienvenida al bot de Caja Chica"));
  assert.ok(msg.includes("ingresar, ver y generar informes"));
  assert.ok(msg.includes("/menu"));
});

test("buildWelcomeMessage — singular dashboard uses singular phrasing + role label", () => {
  const msg = buildWelcomeMessage([{ name: "Casa", role: "editor" }], "Juan");
  assert.ok(msg.includes("El dashboard al que tenés acceso es el de Casa"), `got: ${msg}`);
  assert.ok(msg.includes("Puede editar"), `got: ${msg}`);
  // no bullet list in singular
  assert.ok(!msg.includes("• "), "singular should not render a bullet list");
});

test("buildWelcomeMessage — viewer role label", () => {
  const msg = buildWelcomeMessage([{ name: "Trabajo", role: "viewer" }]);
  assert.ok(msg.includes("Puede ver"), `got: ${msg}`);
});

test("buildWelcomeMessage — owner role label", () => {
  const msg = buildWelcomeMessage([{ name: "Trabajo", role: "owner" }]);
  assert.ok(msg.includes("Dueño"), `got: ${msg}`);
});

test("buildWelcomeMessage — multiple dashboards use plural phrasing + bullet list", () => {
  const msg = buildWelcomeMessage(
    [
      { name: "Casa", role: "editor" },
      { name: "Trabajo", role: "viewer" },
    ],
    "Juan",
  );
  assert.ok(msg.includes("Los dashboards a los que tenés acceso"), `got: ${msg}`);
  assert.ok(msg.includes("• Casa — Puede editar"), `got: ${msg}`);
  assert.ok(msg.includes("• Trabajo — Puede ver"), `got: ${msg}`);
  // plural should not use the singular sentence
  assert.ok(!msg.includes("El dashboard al que tenés acceso es el de"), "plural should not use singular phrasing");
});

test("buildWelcomeMessage — empty dashboards still greets, omits access block", () => {
  const msg = buildWelcomeMessage([], "Juan");
  assert.ok(msg.startsWith("¡Hola Juan!"));
  assert.ok(msg.includes("/menu"));
  assert.ok(!msg.includes("📋"), "no access block when there are no dashboards");
  assert.ok(!msg.includes("dashboard al que tenés acceso"), "no singular access line");
});

// ─────────────────────────────────────────────
// fetchUserDashboards
// ─────────────────────────────────────────────

function makeSupabase(opts: {
  members?: { role: string; dashboard_id: string; status: string }[];
  membersError?: unknown;
  dashboards?: { id: string; name: string }[];
}) {
  return {
    from(table: string) {
      if (table === "dashboard_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: opts.members ?? [], error: opts.membersError ?? null }),
            }),
          }),
        };
      }
      if (table === "dashboards") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: opts.dashboards ?? [], error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

test("fetchUserDashboards — maps memberships to {name, role}, sorted by name", async () => {
  const supabase = makeSupabase({
    members: [
      { role: "viewer", dashboard_id: "d2", status: "active" },
      { role: "editor", dashboard_id: "d1", status: "active" },
    ],
    dashboards: [
      { id: "d1", name: "Casa" },
      { id: "d2", name: "Trabajo" },
    ],
  });
  const result = await fetchUserDashboards(supabase as any, "user-1");
  assert.deepEqual(result, [
    { name: "Casa", role: "editor" },
    { name: "Trabajo", role: "viewer" },
  ]);
});

test("fetchUserDashboards — no memberships → empty array", async () => {
  const supabase = makeSupabase({ members: [] });
  const result = await fetchUserDashboards(supabase as any, "user-1");
  assert.deepEqual(result, []);
});

test("fetchUserDashboards — supabase error → empty array (degrade gracefully)", async () => {
  const supabase = makeSupabase({ membersError: { message: "boom" } });
  const result = await fetchUserDashboards(supabase as any, "user-1");
  assert.deepEqual(result, []);
});

test("fetchUserDashboards — missing dashboard name falls back to placeholder", async () => {
  const supabase = makeSupabase({
    members: [{ role: "editor", dashboard_id: "d1", status: "active" }],
    dashboards: [],
  });
  const result = await fetchUserDashboards(supabase as any, "user-1");
  assert.equal(result.length, 1);
  assert.equal(result[0].role, "editor");
  assert.ok(result[0].name.length > 0);
});
