// P2-T14: RED→GREEN tests for email-settings and email-log endpoints.
// 12 tests covering all 5 new superadmin-only endpoints.

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";
import { tierEmailTest } from "../src/server/rateLimit.ts";
import { parseEmailSettingsRequest, parseTestSendRequest } from "../src/server/validation.ts";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const superadminSession: AppSession = {
  userId: "admin-1",
  email: "admin@example.com",
  role: "superadmin",
  status: "active",
};

const memberSession: AppSession = {
  userId: "user-1",
  email: "member@example.com",
  role: "member",
  status: "active",
};

// ---------------------------------------------------------------------------
// Supabase stub — minimal for email endpoints
// ---------------------------------------------------------------------------

function makeEmailSupabaseStub(opts: {
  emailSettingsRow?: any;
  emailLogRows?: any[];
} = {}) {
  const settingsRow = opts.emailSettingsRow ?? null;
  const logRows = opts.emailLogRows ?? [];

  return {
    from(table: string) {
      const api: any = {
        select(..._args: unknown[]) { return api; },
        eq(..._args: unknown[]) { return api; },
        is(..._args: unknown[]) { return api; },
        gte(..._args: unknown[]) { return api; },
        lte(..._args: unknown[]) { return api; },
        order(..._args: unknown[]) { return api; },
        limit(_n: number) {
          const rows = table === "email_log" ? [...logRows] : [];
          const p: any = Promise.resolve({ data: rows, error: null });
          p.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
          return p;
        },
        maybeSingle() {
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === "email_settings") {
            return Promise.resolve({ data: settingsRow, error: settingsRow ? null : { message: "no rows" } });
          }
          return Promise.resolve({ data: null, error: null });
        },
        upsert(_payload: unknown, _opts?: unknown) {
          return {
            select(_c?: string) {
              return {
                single() {
                  return Promise.resolve({ data: _payload, error: null });
                },
              };
            },
          };
        },
        insert(..._args: unknown[]) {
          return Promise.resolve({ error: null });
        },
        update(_p: unknown) {
          return {
            eq(..._a: unknown[]) {
              return Promise.resolve({ error: null });
            },
          };
        },
      };
      return api;
    },
    auth: {
      admin: { deleteUser: async () => ({ error: null }), signOut: async () => ({ error: null }) },
      getUser: async () => ({ data: { user: null } }),
    },
    rpc: async () => ({ data: null, error: null }),
  } as any;
}

// ---------------------------------------------------------------------------
// EmailDeps stubs
// ---------------------------------------------------------------------------

const stubSender = { fromEmail: "test@example.com", fromName: "Test Name" };
const stubSenders = [
  { id: 1, name: "Test Name", email: "test@example.com", active: true },
  { id: 2, name: "Other", email: "other@example.com", active: true },
];

function makeEmailDeps(overrides: Partial<{
  getActiveSender: (supa: any) => Promise<any>;
  setEmailSettings: (supa: any, patch: any) => Promise<any>;
  listVerifiedSenders: (apiKey: string) => Promise<any[]>;
  listEmailLog: (supa: any, filters: any) => Promise<any[]>;
  sendTestEmail: (to: string, sender: any) => Promise<{ ok: boolean; messageId?: string }>;
}> = {}) {
  return {
    brevoApiKey: "test-api-key",
    getActiveSender: overrides.getActiveSender ?? (async () => stubSender),
    setEmailSettings: overrides.setEmailSettings ?? (async () => stubSender),
    listVerifiedSenders: overrides.listVerifiedSenders ?? (async () => stubSenders),
    listEmailLog: overrides.listEmailLog ?? (async () => []),
    sendTestEmail: overrides.sendTestEmail ?? (async () => ({ ok: true, messageId: "brevo-msg-123" })),
    tierEmailTest,
    parseEmailSettingsRequest,
    parseTestSendRequest,
  };
}

// ---------------------------------------------------------------------------
// Server helper
// ---------------------------------------------------------------------------

async function withServer(
  sessionOrNull: AppSession | null,
  deps: Partial<AppDeps>,
  fn: (baseUrl: string) => Promise<void>,
) {
  const supabase = makeEmailSupabaseStub();
  const app = createApp({
    supabase: (deps.supabase as any) ?? supabase,
    genAI: { models: { async generateContent() { return { text: "{}" }; } } } as any,
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    resolveSession: async () => sessionOrNull,
    ...deps,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const addr = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${addr.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

// ---------------------------------------------------------------------------
// REQ-S1.1/S1.2 — GET /api/admin/email-settings
// ---------------------------------------------------------------------------

test("GET /api/admin/email-settings returns 200 with sender shape for superadmin", async () => {
  const emailDeps = makeEmailDeps({
    getActiveSender: async () => ({ fromEmail: "from@example.com", fromName: "Caja Chica" }),
  });

  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(typeof body.from_email, "string");
    assert.equal(typeof body.from_name, "string");
  });
});

test("GET /api/admin/email-settings returns 403 for non-superadmin", async () => {
  const emailDeps = makeEmailDeps();
  await withServer(memberSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// REQ-S1.3/S1.7 — GET /api/admin/email-settings/senders
// ---------------------------------------------------------------------------

test("GET /api/admin/email-settings/senders returns 200 with array for superadmin", async () => {
  const emailDeps = makeEmailDeps({
    listVerifiedSenders: async () => stubSenders,
  });
  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/senders`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body));
    assert.ok(body.length > 0);
    assert.equal(typeof body[0].email, "string");
    assert.equal(typeof body[0].name, "string");
    assert.equal(typeof body[0].active, "boolean");
  });
});

test("GET /api/admin/email-settings/senders returns 502 when Brevo throws", async () => {
  const emailDeps = makeEmailDeps({
    listVerifiedSenders: async () => { throw new Error("Brevo down"); },
  });
  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/senders`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 502);
    const body = await res.json() as any;
    assert.equal(body.error, "senders_unavailable");
  });
});

test("GET /api/admin/email-settings/senders returns 403 for non-superadmin (INV-3)", async () => {
  const emailDeps = makeEmailDeps();
  await withServer(memberSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/senders`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// REQ-S1.4/S1.5/S1.6 — PATCH /api/admin/email-settings
// ---------------------------------------------------------------------------

test("PATCH /api/admin/email-settings returns 200 for superadmin with verified sender", async () => {
  let setterCalled = false;
  const emailDeps = makeEmailDeps({
    listVerifiedSenders: async () => [{ id: 1, name: "Test", email: "verified@example.com", active: true }],
    setEmailSettings: async () => { setterCalled = true; return { fromEmail: "verified@example.com", fromName: "Test" }; },
  });
  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: "PATCH",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ from_email: "verified@example.com", from_name: "Test" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.from_email, "verified@example.com");
    assert.ok(setterCalled);
  });
});

test("PATCH /api/admin/email-settings returns 400 for unverified sender", async () => {
  const emailDeps = makeEmailDeps({
    listVerifiedSenders: async () => [{ id: 1, name: "Test", email: "other@example.com", active: true }],
  });
  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: "PATCH",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ from_email: "unverified@notbrevo.com", from_name: "Test" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json() as any;
    assert.equal(body.error, "sender_not_verified");
  });
});

test("PATCH /api/admin/email-settings returns 403 for non-superadmin", async () => {
  const emailDeps = makeEmailDeps();
  await withServer(memberSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings`, {
      method: "PATCH",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ from_email: "x@example.com", from_name: "X" }),
    });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// REQ-S3.1/S3.2/S3.4 — POST /api/admin/email-settings/test-send
// ---------------------------------------------------------------------------

test("POST /api/admin/email-settings/test-send returns 200 with ok + brevo_message_id for superadmin", async () => {
  const emailDeps = makeEmailDeps({
    getActiveSender: async () => stubSender,
    sendTestEmail: async () => ({ ok: true, messageId: "brevo-123" }),
  });
  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/test-send`, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ to: "recipient@example.com" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.equal(body.ok, true);
    assert.equal(body.brevo_message_id, "brevo-123");
  });
});

test("POST /api/admin/email-settings/test-send returns 400 for invalid email", async () => {
  const emailDeps = makeEmailDeps();
  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/test-send`, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ to: "not-an-email" }),
    });
    assert.equal(res.status, 400);
  });
});

test("POST /api/admin/email-settings/test-send returns 403 for non-superadmin", async () => {
  const emailDeps = makeEmailDeps();
  await withServer(memberSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-settings/test-send`, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: JSON.stringify({ to: "x@example.com" }),
    });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// REQ-S2.4/S2.5 — GET /api/admin/email-log
// ---------------------------------------------------------------------------

test("GET /api/admin/email-log returns 200 with array for superadmin", async () => {
  const logRows = [
    { id: "log-1", to_email: "a@b.com", subject: "Test", email_type: "app_invite", ok: true, brevo_message_id: "mid-1", error_body: null, sent_at: "2026-05-01T00:00:00.000Z" },
  ];
  const emailDeps = makeEmailDeps({
    listEmailLog: async () => logRows,
  });
  await withServer(superadminSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-log`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 200);
    const body = await res.json() as any;
    assert.ok(Array.isArray(body));
    assert.equal(body.length, 1);
    assert.equal(body[0].email_type, "app_invite");
  });
});

test("GET /api/admin/email-log returns 403 for non-superadmin", async () => {
  const emailDeps = makeEmailDeps();
  await withServer(memberSession, { adminEmailDeps: emailDeps } as any, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/admin/email-log`, {
      headers: { Authorization: "Bearer tok" },
    });
    assert.equal(res.status, 403);
  });
});
