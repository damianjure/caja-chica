import test from "node:test";
import assert from "node:assert/strict";

// Mock supabase returning one active superadmin.
function mockSupabase(emails: string[]) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ data: emails.map((email) => ({ email })), error: null }),
        }),
      }),
    }),
  } as any;
}

test("alertSuperadmin: emails active superadmins and throttles repeats by code", async () => {
  process.env.BREVO_API_KEY = "test-key";
  const { configureAlerts, alertSuperadmin } = await import("../src/server/alertSuperadmin.ts");
  configureAlerts({ supabase: mockSupabase(["admin@x.com"]) });

  const calls: Array<{ body: string }> = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: any, init: any) => {
    calls.push({ body: init.body as string });
    return new Response(JSON.stringify({ messageId: "<id>" }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }) as any;

  try {
    const code = `test:throttle-${Date.now()}`;
    alertSuperadmin({ code, title: "Algo pasó", problem: "detalle", steps: ["arreglar"] });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls.length, 1, "first alert should send");
    const payload = JSON.parse(calls[0].body);
    assert.match(payload.subject, /\[Caja Chica\]/);
    assert.equal(payload.to[0].email, "admin@x.com");

    // Same code within the 6h window → throttled.
    alertSuperadmin({ code, title: "Algo pasó", problem: "detalle", steps: ["arreglar"] });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls.length, 1, "repeat within window must be throttled");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("alertSuperadmin: no recipients → no send, no throw", async () => {
  process.env.BREVO_API_KEY = "test-key";
  const { configureAlerts, alertSuperadmin } = await import("../src/server/alertSuperadmin.ts");
  configureAlerts({ supabase: mockSupabase([]) });

  const calls: number[] = [];
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls.push(1);
    return new Response("{}", { status: 201, headers: { "content-type": "application/json" } });
  }) as any;

  try {
    alertSuperadmin({ code: `test:none-${Date.now()}`, title: "X", problem: "p", steps: ["s"] });
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(calls.length, 0, "no superadmin → no email sent");
  } finally {
    globalThis.fetch = origFetch;
  }
});
