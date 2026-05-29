import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

const superadminSession: AppSession = {
  userId: "superadmin-1",
  email: "superadmin@example.com",
  role: "superadmin",
  status: "active",
};

/** Minimal Supabase stub that returns controlled invitation rows. */
function makeStub(invitationRows: any[]) {
  const client = {
    from(table: string) {
      let rows = table === "user_invitations" ? [...invitationRows] : [];

      const builder: any = {
        select() { return builder; },
        order() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        in() { return builder; },
        gt() { return builder; },
        limit(_n: number) {
          return Promise.resolve({ data: rows.slice(0, _n), error: null });
        },
        maybeSingle() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        single() {
          return Promise.resolve({ data: rows[0] ?? null, error: null });
        },
        insert() {
          return { select() { return builder; }, single() { return Promise.resolve({ data: null, error: null }); } };
        },
        update() {
          return { eq() { return Promise.resolve({ error: null }); } };
        },
      };
      return builder;
    },
    auth: {
      admin: {
        async signOut() { return { error: null }; },
      },
    },
  };
  return client;
}

async function withSuperadminServer(
  supabase: any,
  fn: (baseUrl: string) => Promise<void>,
) {
  const app = createApp({
    supabase: supabase as AppDeps["supabase"],
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
    resolveSession: async () => superadminSession,
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

// P1-T2 → P1-T3: GET /api/admin/invitations must expose last_reminder_at (REQ-S4.1).
// The seed row explicitly includes last_reminder_at. The route's .select() string must
// also include it for the field to be forwarded from the real DB; this test proves the
// contract at the API level (stub returns what is seeded when the select is correct).
test("GET /api/admin/invitations includes last_reminder_at per row (REQ-S4.1)", async () => {
  const rows = [
    {
      id: "invite-red-1",
      email: "pending@example.com",
      role: "member",
      status: "pending",
      invite_token: "tok-abc",
      expires_at: "2026-12-31T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      accepted_at: null,
      last_reminder_at: "2026-05-01T12:00:00.000Z",
    },
  ];

  await withSuperadminServer(makeStub(rows), async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/invitations`, {
      headers: { Authorization: "Bearer valid-token" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(Array.isArray(body), true);
    assert.equal(body.length, 1);
    assert.ok(
      "last_reminder_at" in body[0],
      "expected last_reminder_at field in invitation row",
    );
    assert.equal(body[0].last_reminder_at, "2026-05-01T12:00:00.000Z");
  });
});
