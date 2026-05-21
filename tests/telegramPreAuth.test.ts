/**
 * Tests for Slice 3: Telegram pre-auth flag + is_dashboard_joiner.
 *
 * Strict TDD: tests written first (RED), then implementation (GREEN).
 *
 * Covers:
 * - POST /api/dashboard/invitations with telegram_preauth=true
 * - POST /api/dashboard/invitations without telegram_preauth (backward compat)
 * - is_dashboard_joiner in GET /api/me
 * - ensureOnboardingSeed joiner bypass
 * - syncPendingDashboardInvitations propagates invited_by_user_id
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Stub builder
// ---------------------------------------------------------------------------

type TelegramPreAuthSeed = {
  appUsers?: unknown[];
  dashboardInvitations?: unknown[];
  dashboardMembers?: unknown[];
  telegramInviteTokens?: unknown[];
};

function createPreAuthStub(seed: TelegramPreAuthSeed = {}) {
  const appUsersRows = (seed.appUsers ?? []) as any[];
  let dashboardInvitationsRows = (seed.dashboardInvitations ?? []) as any[];
  let dashboardMembersRows = (seed.dashboardMembers ?? []) as any[];
  const telegramInviteTokensRows = (seed.telegramInviteTokens ?? []) as any[];

  // Track inserted/upserted rows for assertions
  const inserted: Record<string, unknown[]> = {};

  const builder = (table: string) => {
    const getRows = () => {
      if (table === "app_users") return [...appUsersRows];
      if (table === "dashboard_invitations") return [...dashboardInvitationsRows];
      if (table === "dashboard_members") return [...dashboardMembersRows];
      if (table === "telegram_invite_tokens") return [...telegramInviteTokensRows];
      return [] as any[];
    };

    let rows: any[] = getRows();

    const api: any = {
      select(..._args: unknown[]) { rows = getRows(); return api; },
      order(..._args: unknown[]) { return api; },
      eq(col: string, val: unknown) {
        rows = rows.filter((r: any) => r[col] === val);
        return api;
      },
      neq(col: string, val: unknown) {
        rows = rows.filter((r: any) => r[col] !== val);
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
      not(col: string, op: string, _val: unknown) {
        if (op === "is") {
          rows = rows.filter((r: any) => r[col] !== null && r[col] !== undefined);
        }
        return api;
      },
      limit(n: number) {
        const sliced = rows.slice(0, n);
        const p: any = Promise.resolve({ data: sliced, error: null });
        p.single = () => Promise.resolve({ data: sliced[0] ?? null, error: null });
        p.maybeSingle = () => Promise.resolve({ data: sliced[0] ?? null, error: null });
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
      insert(payload: unknown) {
        if (!inserted[table]) inserted[table] = [];
        inserted[table].push(payload);
        const newRow = { id: `gen-${table}-${inserted[table].length}`, ...(payload as object) };
        if (table === "dashboard_members") dashboardMembersRows = [...dashboardMembersRows, newRow];
        return {
          select() {
            return {
              single() { return Promise.resolve({ data: newRow, error: null }); },
            };
          },
          single() { return Promise.resolve({ data: newRow, error: null }); },
        };
      },
      update(payload: unknown) {
        const ub: any = {
          eq(..._a: unknown[]) { return ub; },
          select() { return ub; },
          limit(n: number) { return Promise.resolve({ data: rows.slice(0, n), error: null }); },
          then(resolve: (v: unknown) => void) { resolve({ data: rows, error: null }); },
        };
        return ub;
      },
      upsert(payload: unknown, _opts?: unknown) {
        if (!inserted[table]) inserted[table] = [];
        inserted[table].push(payload);
        const newRow = { id: `upserted-${table}-${inserted[table].length}`, ...(payload as object) };
        // Simulate that dashboard_invitations upsert returns the inserted row
        if (table === "dashboard_invitations") {
          dashboardInvitationsRows = [...dashboardInvitationsRows, newRow];
        }
        if (table === "dashboard_members") {
          dashboardMembersRows = [...dashboardMembersRows, newRow];
        }
        return {
          select() {
            return {
              single() { return Promise.resolve({ data: newRow, error: null }); },
            };
          },
          single() { return Promise.resolve({ data: newRow, error: null }); },
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
    getInserted: (table: string) => inserted[table] ?? [],
  };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function withPreAuthServer(
  seed: TelegramPreAuthSeed,
  session: AppSession,
  fn: (baseUrl: string, stub: ReturnType<typeof createPreAuthStub>) => Promise<void>,
) {
  const stub = createPreAuthStub(seed);

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
    telegramBotUsername: "testbot",
    resolveSession: async () => session,
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    await fn(`http://127.0.0.1:${port}`, stub);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

function bearer(): { Authorization: string } {
  return { Authorization: "Bearer valid-token" };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ownerSession: AppSession = {
  userId: "owner-1",
  email: "owner@example.com",
  role: "member",
  status: "active",
};

const joinerSession: AppSession = {
  userId: "joiner-1",
  email: "joiner@example.com",
  role: "member",
  status: "active",
};

// Owner has dashboard membership, no invited_by_user_id
const ownerMember = {
  id: "dm-owner-1",
  dashboard_id: "dash-1",
  user_id: "owner-1",
  role: "owner",
  status: "active",
  invited_by_user_id: null,
};

// Joiner has dashboard membership WITH invited_by_user_id
const joinerMember = {
  id: "dm-joiner-1",
  dashboard_id: "dash-1",
  user_id: "joiner-1",
  role: "editor",
  status: "active",
  invited_by_user_id: "owner-1",
};

const ownerAppUser = {
  user_id: "owner-1",
  email: "owner@example.com",
  display_name: null,
  notification_hour: 21,
  onboarding_state: "completed",
};

const joinerAppUser = {
  user_id: "joiner-1",
  email: "joiner@example.com",
  display_name: null,
  notification_hour: 21,
  onboarding_state: "pending",
};

// ---------------------------------------------------------------------------
// Section A: POST /api/dashboard/invitations — telegram_preauth
// ---------------------------------------------------------------------------

test("POST /api/dashboard/invitations — no telegram_preauth → does NOT insert telegram_invite_tokens", async () => {
  await withPreAuthServer(
    { appUsers: [], dashboardMembers: [ownerMember] },
    ownerSession,
    async (base, stub) => {
      const res = await fetch(`${base}/api/dashboard/invitations`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: "newuser@example.com", role: "editor" }),
      });
      assert.equal(res.status, 201);
      const inserted = stub.getInserted("telegram_invite_tokens");
      assert.equal(inserted.length, 0, "should NOT insert telegram_invite_tokens when preauth absent");
    },
  );
});

test("POST /api/dashboard/invitations — telegram_preauth=true inserts telegram_invite_tokens with pre_authorized=true", async () => {
  await withPreAuthServer(
    { appUsers: [], dashboardMembers: [ownerMember] },
    ownerSession,
    async (base, stub) => {
      const res = await fetch(`${base}/api/dashboard/invitations`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: "newuser@example.com", role: "editor", telegram_preauth: true }),
      });
      assert.equal(res.status, 201);
      const inserted = stub.getInserted("telegram_invite_tokens");
      assert.equal(inserted.length, 1, "should insert exactly one telegram_invite_tokens row");
      const tokenRow = inserted[0] as any;
      assert.equal(tokenRow.pre_authorized, true);
      assert.ok(tokenRow.token, "token must be set");
      assert.equal(tokenRow.dashboard_id, "dash-1");
      // TTL ~24h
      const expiresAt = new Date(tokenRow.expires_at);
      const diffHours = (expiresAt.getTime() - Date.now()) / 3_600_000;
      assert.ok(diffHours > 23 && diffHours < 25, `TTL should be ~24h, got ${diffHours.toFixed(2)}h`);
    },
  );
});

test("POST /api/dashboard/invitations — telegram_preauth=true sets telegram_preauth=true in dashboard_invitations row", async () => {
  await withPreAuthServer(
    { appUsers: [], dashboardMembers: [ownerMember] },
    ownerSession,
    async (base, stub) => {
      const res = await fetch(`${base}/api/dashboard/invitations`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: "newuser@example.com", role: "editor", telegram_preauth: true }),
      });
      assert.equal(res.status, 201);
      const inserted = stub.getInserted("dashboard_invitations");
      assert.ok(inserted.length > 0, "should upsert dashboard_invitations");
      const row = inserted[0] as any;
      assert.equal(row.telegram_preauth, true, "telegram_preauth field must be true");
      assert.ok(row.telegram_invite_token_id, "telegram_invite_token_id must be set");
    },
  );
});

test("POST /api/dashboard/invitations — telegram_preauth=true response includes deep_link with bot username", async () => {
  await withPreAuthServer(
    { appUsers: [], dashboardMembers: [ownerMember] },
    ownerSession,
    async (base) => {
      const res = await fetch(`${base}/api/dashboard/invitations`, {
        method: "POST",
        headers: { ...bearer(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: "newuser@example.com", role: "editor", telegram_preauth: true }),
      });
      assert.equal(res.status, 201);
      const body = await res.json() as any;
      assert.ok(body.telegram_deep_link, "response should include telegram_deep_link");
      assert.ok(
        body.telegram_deep_link.startsWith("https://t.me/testbot?start="),
        `deep link format wrong: ${body.telegram_deep_link}`,
      );
    },
  );
});

// ---------------------------------------------------------------------------
// Section B: GET /api/me — is_dashboard_joiner
// ---------------------------------------------------------------------------

test("GET /api/me — is_dashboard_joiner=false when no dashboard_members row with invited_by_user_id", async () => {
  await withPreAuthServer(
    {
      appUsers: [ownerAppUser],
      dashboardMembers: [ownerMember], // invited_by_user_id is null
    },
    ownerSession,
    async (base) => {
      const res = await fetch(`${base}/api/me`, { headers: bearer() });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.is_dashboard_joiner, false);
    },
  );
});

test("GET /api/me — is_dashboard_joiner=true when dashboard_members has invited_by_user_id set", async () => {
  await withPreAuthServer(
    {
      appUsers: [{ ...joinerAppUser, onboarding_state: "completed" }],
      dashboardMembers: [joinerMember], // invited_by_user_id = "owner-1"
    },
    joinerSession,
    async (base) => {
      const res = await fetch(`${base}/api/me`, { headers: bearer() });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      assert.equal(body.is_dashboard_joiner, true);
    },
  );
});

test("GET /api/me — joiner with onboarding_state=pending returns onboarding_state=completed (seed bypassed)", async () => {
  await withPreAuthServer(
    {
      appUsers: [joinerAppUser], // onboarding_state: "pending"
      dashboardMembers: [joinerMember],
    },
    joinerSession,
    async (base) => {
      const res = await fetch(`${base}/api/me`, { headers: bearer() });
      assert.equal(res.status, 200);
      const body = await res.json() as any;
      // Joiner should get completed, NOT seeded (seed should be bypassed)
      assert.equal(body.onboarding_state, "completed");
      assert.equal(body.is_dashboard_joiner, true);
    },
  );
});

// ---------------------------------------------------------------------------
// Section C: syncPendingDashboardInvitations — invited_by_user_id propagation
// ---------------------------------------------------------------------------

test("syncPendingDashboardInvitations upserts invited_by_user_id into dashboard_members", async () => {
  const pendingDashboardInvite = {
    id: "di-pending-1",
    dashboard_id: "dash-1",
    email: "joiner@example.com",
    role: "editor",
    status: "pending",
    invited_by_user_id: "owner-1",
  };

  await withPreAuthServer(
    {
      appUsers: [{ ...joinerAppUser, onboarding_state: "completed" }],
      dashboardInvitations: [pendingDashboardInvite],
      dashboardMembers: [],
    },
    joinerSession,
    async (base, stub) => {
      // GET /api/me triggers syncPendingDashboardInvitations
      await fetch(`${base}/api/me`, { headers: bearer() });
      const upserted = stub.getInserted("dashboard_members");
      const memberRow = upserted.find((r: any) => r.dashboard_id === "dash-1") as any;
      assert.ok(memberRow, "should upsert a dashboard_members row");
      assert.equal(memberRow.invited_by_user_id, "owner-1", "invited_by_user_id should be propagated from dashboard_invitations");
    },
  );
});
