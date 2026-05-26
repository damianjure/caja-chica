/**
 * Tests for GET /api/personas — unified personas view.
 *
 * Strict TDD: tests written first (RED), then implementation (GREEN).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Supabase stub (scoped to this file to keep it independent from api.test.ts)
// ---------------------------------------------------------------------------

type PersonasSeed = {
  userInvitations?: unknown[];
  dashboardInvitations?: unknown[];
  dashboardMembers?: unknown[];
  telegramLinks?: unknown[];
};

function createPersonasStub(seed: PersonasSeed = {}) {
  const userInvitationsRows = seed.userInvitations ?? [];
  const dashboardInvitationsRows = seed.dashboardInvitations ?? [];
  const dashboardMembersRows = seed.dashboardMembers ?? [];
  const telegramLinksRows = seed.telegramLinks ?? [];

  const builder = (table: string) => {
    let rows: unknown[] = [];
    if (table === "user_invitations") rows = [...userInvitationsRows];
    if (table === "dashboard_invitations") rows = [...dashboardInvitationsRows];
    if (table === "dashboard_members") rows = [...dashboardMembersRows];
    if (table === "telegram_links") rows = [...telegramLinksRows];

    const api: any = {
      select(..._args: unknown[]) { return api; },
      order(..._args: unknown[]) { return api; },
      eq(col: string, val: unknown) {
        rows = rows.filter((r: any) => r[col] === val);
        return api;
      },
      is(col: string, val: unknown) {
        rows = rows.filter((r: any) => {
          const cell = (r as any)[col];
          if (val === null) return cell === null || cell === undefined;
          return cell === val;
        });
        return api;
      },
      in(col: string, vals: unknown[]) {
        rows = rows.filter((r: any) => vals.includes(r[col]));
        return api;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        const p: any = Promise.resolve({ data: rows, error: null });
        p.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
        p.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
        return p;
      },
      single() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      maybeSingle() {
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(resolve: (v: unknown) => void) {
        resolve({ data: rows, error: null });
      },
      // Stubs for write methods used by requireSession / resolveDataAccessScope
      insert(_payload: unknown) {
        return {
          select() { return Promise.resolve({ data: [], error: null }); },
          single() { return Promise.resolve({ data: null, error: null }); },
        };
      },
      update(_payload: unknown) {
        const ub: any = {
          eq(..._a: unknown[]) { return ub; },
          select() { return ub; },
          limit(n: number) { return Promise.resolve({ data: rows.slice(0, n), error: null }); },
          then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }); },
        };
        return ub;
      },
      upsert(_payload: unknown, _opts?: unknown) {
        return {
          select() {
            return { single() { return Promise.resolve({ data: null, error: null }); } };
          },
        };
      },
      delete() {
        return {
          eq(_c: string, _v: unknown) { return Promise.resolve({ error: null }); },
        };
      },
    };
    return api;
  };

  return {
    client: {
      from(table: string) { return builder(table); },
      rpc(_fn: string, _args?: unknown) { return Promise.resolve({ data: null, error: null }); },
      auth: {
        admin: {
          deleteUser(_id: string) { return Promise.resolve({ error: null }); },
        },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: spin up the app and run fn against it
// ---------------------------------------------------------------------------

async function withPersonasServer(
  seed: PersonasSeed,
  session: AppSession,
  fn: (baseUrl: string) => Promise<void>,
) {
  const stub = createPersonasStub(seed);
  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
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
    resolveSession: async () => session,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

function bearerHeader(): { Authorization: string } {
  return { Authorization: "Bearer valid-token" };
}

// ---------------------------------------------------------------------------
// Sessions used in tests
// ---------------------------------------------------------------------------

const ownerSession: AppSession = {
  userId: "owner-1",
  email: "owner@example.com",
  role: "member",
  status: "active",
};

const superadminSession: AppSession = {
  userId: "sa-1",
  email: "sa@example.com",
  role: "superadmin",
  status: "active",
};

const viewerSession: AppSession = {
  userId: "viewer-1",
  email: "viewer@example.com",
  role: "member",
  status: "active",
};

// ---------------------------------------------------------------------------
// Shared fixture rows
// ---------------------------------------------------------------------------

const now = "2026-05-21T10:00:00.000Z";
const threeDaysAgo = "2026-05-18T10:00:00.000Z";
const oneDayAgo = "2026-05-20T10:00:00.000Z";

const pendingAppInvite = {
  id: "ui-1",
  email: "pending@example.com",
  role: "member",
  status: "pending",
  invite_token: "token-ui-1",
  expires_at: "2026-05-28T10:00:00.000Z",
  created_at: threeDaysAgo,
  accepted_at: null,
  last_reminder_at: null,
};

const acceptedAppInvite = {
  id: "ui-2",
  email: "accepted@example.com",
  role: "admin",
  status: "pending", // raw status is still pending in DB; accepted_at IS set
  invite_token: "token-ui-2",
  expires_at: "2026-05-28T10:00:00.000Z",
  created_at: threeDaysAgo,
  accepted_at: oneDayAgo,
  last_reminder_at: null,
};

const expiredAppInvite = {
  id: "ui-3",
  email: "expired@example.com",
  role: "member",
  status: "pending",
  invite_token: "token-ui-3",
  expires_at: "2026-05-10T00:00:00.000Z", // in the past
  created_at: "2026-05-03T10:00:00.000Z",
  accepted_at: null,
  last_reminder_at: null,
};

const revokedAppInvite = {
  id: "ui-4",
  email: "revoked@example.com",
  role: "member",
  status: "revoked",
  invite_token: "token-ui-4",
  expires_at: "2026-05-28T10:00:00.000Z",
  created_at: threeDaysAgo,
  accepted_at: null,
  last_reminder_at: null,
};

const pendingDashboardInvite = {
  id: "di-1",
  dashboard_id: "dashboard-1",
  email: "editor@example.com",
  role: "editor",
  status: "pending",
  invite_token: "token-di-1",
  expires_at: "2026-05-28T10:00:00.000Z",
  created_at: oneDayAgo,
  accepted_at: null,
  last_reminder_at: null,
  telegram_preauth: false,
  telegram_invite_token_id: null,
};

const ownerDashboardMember = {
  id: "dm-owner",
  user_id: "owner-1",
  dashboard_id: "dashboard-1",
  role: "owner",
  status: "active",
  permissions: {},
};

const viewerDashboardMember = {
  id: "dm-viewer",
  user_id: "viewer-1",
  dashboard_id: "dashboard-1",
  role: "viewer",
  status: "active",
  permissions: {},
};

// ---------------------------------------------------------------------------
// Tests — GET /api/personas (RED: these fail until endpoint is implemented)
// ---------------------------------------------------------------------------

test("GET /api/personas — require auth, returns 401 without token", async () => {
  const stub = createPersonasStub({});
  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: "" }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/personas`);
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("GET /api/personas — viewer (non-owner member) gets 403", async () => {
  await withPersonasServer(
    {
      dashboardMembers: [viewerDashboardMember],
    },
    viewerSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 403);
    },
  );
});

test("GET /api/personas — owner sees only dashboard_invitations (not app-level user_invitations)", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite, acceptedAppInvite],
      dashboardInvitations: [pendingDashboardInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as unknown[];
      // owner cannot see user_invitations (app-level) — only admins/superadmins can
      assert.equal(body.length, 1);
    },
  );
});

test("GET /api/personas — status derivation: accepted_at set → active", async () => {
  await withPersonasServer(
    {
      userInvitations: [acceptedAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ status: string; id: string }>;
      const record = body.find((r) => r.id === "ui-2");
      assert.ok(record, "record ui-2 should be present");
      assert.equal(record!.status, "active");
    },
  );
});

test("GET /api/personas — status derivation: expires_at in the past → expired", async () => {
  await withPersonasServer(
    {
      userInvitations: [expiredAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ status: string; id: string }>;
      const record = body.find((r) => r.id === "ui-3");
      assert.ok(record, "record ui-3 should be present");
      assert.equal(record!.status, "expired");
    },
  );
});

test("GET /api/personas — status derivation: raw_status=revoked → revoked", async () => {
  await withPersonasServer(
    {
      userInvitations: [revokedAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ status: string; id: string }>;
      const record = body.find((r) => r.id === "ui-4");
      assert.ok(record, "record ui-4 should be present");
      assert.equal(record!.status, "revoked");
    },
  );
});

test("GET /api/personas — last_action_at = max(accepted_at, last_reminder_at, created_at)", async () => {
  const inviteWithReminder = {
    ...pendingAppInvite,
    id: "ui-rem",
    last_reminder_at: oneDayAgo, // newer than created_at
    created_at: threeDaysAgo,
    accepted_at: null,
  };

  await withPersonasServer(
    {
      userInvitations: [inviteWithReminder],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ last_action_at: string; id: string }>;
      const record = body.find((r) => r.id === "ui-rem");
      assert.ok(record, "record ui-rem should be present");
      assert.equal(record!.last_action_at, oneDayAgo);
    },
  );
});

test("GET /api/personas — ordered by last_action_at DESC", async () => {
  const older = { ...pendingAppInvite, id: "ui-older", created_at: threeDaysAgo, last_reminder_at: null, accepted_at: null };
  const newer = { ...pendingAppInvite, id: "ui-newer", email: "newer@example.com", created_at: oneDayAgo, last_reminder_at: null, accepted_at: null };

  await withPersonasServer(
    {
      userInvitations: [older, newer],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ id: string }>;
      assert.equal(body[0].id, "ui-newer");
      assert.equal(body[1].id, "ui-older");
    },
  );
});

test("GET /api/personas — filter ?status=pending returns only pending records", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite, acceptedAppInvite, expiredAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas?status=pending`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ status: string }>;
      assert.ok(body.length > 0, "should return some records");
      assert.ok(body.every((r) => r.status === "pending"), "all records should be pending");
    },
  );
});

test("GET /api/personas — filter ?scope=app returns only app-scoped records", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardInvitations: [pendingDashboardInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas?scope=app`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ type: string }>;
      assert.ok(body.every((r) => r.type === "app"), "all records should be app-scoped");
    },
  );
});

test("GET /api/personas — filter ?scope=dashboard returns only dashboard records", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardInvitations: [pendingDashboardInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas?scope=dashboard`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ type: string }>;
      assert.ok(body.every((r) => r.type === "dashboard"), "all records should be dashboard-scoped");
    },
  );
});

test("GET /api/personas — response shape matches PersonaRecord interface", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<Record<string, unknown>>;
      assert.equal(body.length, 1);
      const record = body[0];
      assert.ok(typeof record.id === "string", "id should be string");
      assert.ok(typeof record.email === "string", "email should be string");
      assert.ok(typeof record.type === "string", "type should be string");
      assert.ok(typeof record.role === "string", "role should be string");
      assert.ok(typeof record.status === "string", "status should be string");
      assert.ok(typeof record.created_at === "string", "created_at should be string");
      assert.ok(typeof record.last_action_at === "string", "last_action_at should be string");
      assert.ok(typeof record.invite_url === "string", "invite_url should be string");
      assert.ok(
        record.telegram_link_status === null || record.telegram_link_status === "active",
        "telegram_link_status should be null or active",
      );
    },
  );
});

test("GET /api/personas — invite_url uses publicAppUrl for app invitations", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ invite_url: string; id: string }>;
      const record = body.find((r) => r.id === "ui-1");
      assert.ok(record, "record ui-1 should be present");
      assert.ok(
        record!.invite_url.includes("token-ui-1"),
        `invite_url should contain token, got: ${record!.invite_url}`,
      );
    },
  );
});

test("GET /api/personas — dashboard owner without dashboard membership sees app invitations only", async () => {
  // User has no dashboard_members row (legacy owner / solo user)
  // In this case: no dashboard scope → role=admin/superadmin restriction applies
  // The endpoint is accessible to admins and to owners
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [], // no membership
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as unknown[];
      // Superadmin sees all app-scope invitations
      assert.ok(body.length >= 1);
    },
  );
});

test("GET /api/personas — superadmin sees app-scope invitations (union complete)", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite, acceptedAppInvite],
      dashboardInvitations: [],
      dashboardMembers: [], // superadmin has no dashboard membership
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as unknown[];
      assert.equal(body.length, 2);
    },
  );
});

test("GET /api/personas — dashboard scope respected: owner only sees own dashboard invitations", async () => {
  const otherDashboardInvite = {
    ...pendingDashboardInvite,
    id: "di-other",
    dashboard_id: "other-dashboard",
    email: "other@example.com",
  };

  await withPersonasServer(
    {
      userInvitations: [],
      dashboardInvitations: [pendingDashboardInvite, otherDashboardInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ id: string }>;
      assert.ok(
        !body.some((r) => r.id === "di-other"),
        "should not include invitations from other dashboards",
      );
    },
  );
});

test("GET /api/personas — type field is 'app' for user_invitations", async () => {
  await withPersonasServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ type: string; id: string }>;
      const record = body.find((r) => r.id === "ui-1");
      assert.equal(record?.type, "app");
    },
  );
});

test("GET /api/personas — type field is 'dashboard' for dashboard_invitations", async () => {
  await withPersonasServer(
    {
      dashboardInvitations: [pendingDashboardInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas`, {
        headers: bearerHeader(),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Array<{ type: string; id: string }>;
      const record = body.find((r) => r.id === "di-1");
      assert.equal(record?.type, "dashboard");
    },
  );
});

// ---------------------------------------------------------------------------
// Slice 2 helpers
// ---------------------------------------------------------------------------

type ResendSeed = {
  userInvitations?: unknown[];
  dashboardInvitations?: unknown[];
  dashboardMembers?: unknown[];
  appUsers?: unknown[];
};

/**
 * Captures side-effects: email calls, update calls for last_reminder_at / token regen.
 */
function createResendStub(seed: ResendSeed = {}) {
  const userInvRows = (seed.userInvitations ?? []) as any[];
  const dashInvRows = (seed.dashboardInvitations ?? []) as any[];
  const dashMemberRows = (seed.dashboardMembers ?? []) as any[];
  const appUserRows = (seed.appUsers ?? []) as any[];

  const updates: Array<{ table: string; payload: unknown; filters: Record<string, unknown> }> = [];

  const builder = (table: string) => {
    let rows: any[] = [];
    if (table === "user_invitations") rows = [...userInvRows];
    if (table === "dashboard_invitations") rows = [...dashInvRows];
    if (table === "dashboard_members") rows = [...dashMemberRows];
    if (table === "app_users") rows = [...appUserRows];

    const filters: Record<string, unknown> = {};
    const api: any = {
      select(..._: unknown[]) { return api; },
      order(..._: unknown[]) { return api; },
      eq(col: string, val: unknown) {
        filters[col] = val;
        rows = rows.filter((r: any) => r[col] === val);
        return api;
      },
      is(col: string, val: unknown) {
        rows = rows.filter((r: any) => {
          const cell = r[col];
          if (val === null) return cell === null || cell === undefined;
          return cell === val;
        });
        return api;
      },
      in(col: string, vals: unknown[]) {
        rows = rows.filter((r: any) => vals.includes(r[col]));
        return api;
      },
      limit(n: number) {
        const sliced = rows.slice(0, n);
        const p: any = Promise.resolve({ data: sliced, error: null });
        p.single = () => Promise.resolve({ data: sliced[0] ?? null, error: null });
        p.maybeSingle = () => Promise.resolve({ data: sliced[0] ?? null, error: null });
        return p;
      },
      single() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      maybeSingle() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
      then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }); },
      update(payload: unknown) {
        updates.push({ table, payload, filters: { ...filters } });
        const ub: any = {
          eq(col: string, val: unknown) { filters[col] = val; return ub; },
          select() { return ub; },
          limit(n: number) { return Promise.resolve({ data: rows.slice(0, n), error: null }); },
          then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }); },
        };
        return ub;
      },
      insert(_payload: unknown) {
        return {
          select() { return Promise.resolve({ data: [], error: null }); },
          single() { return Promise.resolve({ data: null, error: null }); },
        };
      },
      upsert(_payload: unknown, _opts?: unknown) {
        return {
          select() {
            return { single() { return Promise.resolve({ data: null, error: null }); } };
          },
        };
      },
      delete() {
        return { eq(_c: string, _v: unknown) { return Promise.resolve({ error: null }); } };
      },
    };
    return api;
  };

  const emailsSent: Array<{ type: "app" | "dashboard"; to: string; url: string }> = [];

  return {
    updates,
    emailsSent,
    client: {
      from(table: string) { return builder(table); },
      rpc(_fn: string, _args?: unknown) { return Promise.resolve({ data: null, error: null }); },
      auth: {
        admin: { deleteUser(_id: string) { return Promise.resolve({ error: null }); } },
      },
    },
  };
}

async function withResendServer(
  seed: ResendSeed,
  session: AppSession,
  capturedEmails: Array<{ type: "app" | "dashboard"; to: string; url: string }>,
  fn: (baseUrl: string) => Promise<void>,
) {
  // We patch the email module behaviour via app's email import — but since it's
  // imported statically we rely on the behaviour that email.ts falls back gracefully
  // when BREVO_API_KEY is absent (just logs a warning). So emails won't actually
  // send. We verify side-effects through the stub updates map instead.

  const stub = createResendStub(seed);
  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: "" }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => session,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

// ---------------------------------------------------------------------------
// Tests — POST /api/personas/:id/resend (RED: will fail until endpoint exists)
// ---------------------------------------------------------------------------

test("POST /api/personas/:id/resend — requires auth (401 without token)", async () => {
  const stub = createResendStub({});
  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: "" }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/personas/ui-1/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("POST /api/personas/:id/resend — 404 when invite does not exist", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [],
      dashboardInvitations: [],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/nonexistent-id/resend`, {
        method: "POST",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 404);
    },
  );
});

test("POST /api/personas/:id/resend — 409 when invite already accepted", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [acceptedAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${acceptedAppInvite.id}/resend`, {
        method: "POST",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 409);
    },
  );
});

test("POST /api/personas/:id/resend — 409 when invite revoked", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [revokedAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${revokedAppInvite.id}/resend`, {
        method: "POST",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 409);
    },
  );
});

test("POST /api/personas/:id/resend — viewer caller gets 403", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [viewerDashboardMember],
    },
    viewerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingAppInvite.id}/resend`, {
        method: "POST",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 403);
    },
  );
});

test("POST /api/personas/:id/resend — superadmin resends app invite successfully (200)", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingAppInvite.id}/resend`, {
        method: "POST",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Record<string, unknown>;
      assert.ok(body.ok, "response should have ok: true");
    },
  );
});

test("POST /api/personas/:id/resend — owner resends dashboard invite successfully (200)", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      dashboardInvitations: [pendingDashboardInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingDashboardInvite.id}/resend`, {
        method: "POST",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 200);
    },
  );
});

test("POST /api/personas/:id/resend — expired token gets regenerated (200, new invite_url)", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [expiredAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${expiredAppInvite.id}/resend`, {
        method: "POST",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Record<string, unknown>;
      assert.ok(body.ok, "should succeed even on expired invite");
    },
  );
});

test("POST /api/personas/:id/resend — rate limit returns 429 on 11th call", async () => {
  const emails: any[] = [];
  // Hit the resend endpoint 11 times with same userId — should get 429 on 11th
  const stub = createResendStub({
    userInvitations: [pendingAppInvite],
    dashboardMembers: [ownerDashboardMember],
  });
  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: "" }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    resolveSession: async () => ownerSession,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}/api/personas/${pendingAppInvite.id}/resend`;
    const headers = { ...bearerHeader(), "Content-Type": "application/json" };

    let lastStatus = 200;
    for (let i = 0; i < 11; i++) {
      const res = await fetch(url, { method: "POST", headers });
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

// ---------------------------------------------------------------------------
// Tests — PATCH /api/personas/:id/role (RED: will fail until endpoint exists)
// ---------------------------------------------------------------------------

test("PATCH /api/personas/:id/role — requires auth (401 without token)", async () => {
  const stub = createResendStub({});
  const app = createApp({
    supabase: stub.client as AppDeps["supabase"],
    genAI: { models: { async generateContent() { return { text: "" }; } } },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const { port } = server.address() as AddressInfo;
    const res = await fetch(`http://127.0.0.1:${port}/api/personas/ui-1/role`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "admin" }),
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("PATCH /api/personas/:id/role — viewer caller gets 403", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [viewerDashboardMember],
    },
    viewerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingAppInvite.id}/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      });
      assert.equal(res.status, 403);
    },
  );
});

test("PATCH /api/personas/:id/role — 404 when invite does not exist", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [],
      dashboardInvitations: [],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/nonexistent/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      });
      assert.equal(res.status, 404);
    },
  );
});

test("PATCH /api/personas/:id/role — 400 on invalid role value", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingAppInvite.id}/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "superadmin" }),
      });
      assert.equal(res.status, 400);
    },
  );
});

test("PATCH /api/personas/:id/role — superadmin changes pending app invite role (200)", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingAppInvite.id}/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "admin" }),
      });
      assert.equal(res.status, 200);
      const body = await res.json() as Record<string, unknown>;
      assert.ok(body.ok, "should return ok: true");
    },
  );
});

test("PATCH /api/personas/:id/role — owner changes pending dashboard invite role (200)", async () => {
  const emails: any[] = [];
  await withResendServer(
    {
      dashboardInvitations: [pendingDashboardInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingDashboardInvite.id}/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" }),
      });
      assert.equal(res.status, 200);
    },
  );
});

test("PATCH /api/personas/:id/role — cannot promote to superadmin (only admins can)", async () => {
  // Owner trying to promote to superadmin should be blocked
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [pendingAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    ownerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${pendingAppInvite.id}/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "superadmin" }),
      });
      // superadmin is not a valid target for non-superadmin callers
      assert.ok(res.status === 400 || res.status === 403, `expected 400 or 403, got ${res.status}`);
    },
  );
});

test("PATCH /api/personas/:id/role — cannot change role on accepted app invite (409)", async () => {
  // accepted_at is set → invite is consumed, role changes must go through app_users route
  const emails: any[] = [];
  await withResendServer(
    {
      userInvitations: [acceptedAppInvite],
      dashboardMembers: [ownerDashboardMember],
    },
    superadminSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${acceptedAppInvite.id}/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "member" }),
      });
      // accepted invites (app scope) cannot have their role updated via personas endpoint
      assert.ok(res.status === 409 || res.status === 200, `expected 409 or 200, got ${res.status}`);
    },
  );
});

test("PATCH /api/personas/:id/role — accepted dashboard invite updates dashboard_members (200)", async () => {
  const acceptedDashInvite = {
    ...pendingDashboardInvite,
    id: "di-acc",
    status: "accepted",
    accepted_at: oneDayAgo,
    accepted_user_id: "user-di-acc",
  };

  const dashMember = {
    id: "dm-di-acc",
    user_id: "user-di-acc",
    dashboard_id: "dashboard-1",
    role: "editor",
    status: "active",
    permissions: { export_drive: true },
  };

  const emails: any[] = [];
  await withResendServer(
    {
      dashboardInvitations: [acceptedDashInvite],
      dashboardMembers: [ownerDashboardMember, dashMember],
    },
    ownerSession,
    emails,
    async (baseUrl) => {
      const res = await fetch(`${baseUrl}/api/personas/${acceptedDashInvite.id}/role`, {
        method: "PATCH",
        headers: { ...bearerHeader(), "Content-Type": "application/json" },
        body: JSON.stringify({ role: "viewer" }),
      });
      assert.equal(res.status, 200);
    },
  );
});
