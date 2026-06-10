/**
 * Tests for invitation fixes:
 * - Fix A: syncPendingDashboardInvitations backfills telegram_invite_tokens.target_user_id
 * - Fix B: POST /api/admin/invitations 409 when accepted invite exists
 * - Fix C: POST /api/dashboard/invitations skips user_invitations upsert when pending app invite exists
 * - Fix D: POST /api/personas/:id/resend regenerates telegram token when telegram_preauth=true
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AddressInfo } from "node:net";

import { syncPendingDashboardInvitations } from "../src/server/invitations.ts";
import { createApp, type AppDeps, type AppSession } from "../src/server/app.ts";

// ---------------------------------------------------------------------------
// Fix A: syncPendingDashboardInvitations backfills target_user_id
// ---------------------------------------------------------------------------

function makeInvitationsSupabase(opts: {
  dashboardInvitations?: any[];
  updateCapture?: Array<{ table: string; payload: any; filters: Record<string, unknown> }>;
  updateError?: Error | null;
}) {
  const { dashboardInvitations = [], updateCapture = [], updateError = null } = opts;

  const makeApi = (table: string) => {
    let rows = table === "dashboard_invitations" ? [...dashboardInvitations] : [];

    const api: any = {
      select(..._: unknown[]) { rows = table === "dashboard_invitations" ? [...dashboardInvitations] : []; return api; },
      eq(col: string, val: unknown) { rows = rows.filter((r: any) => r[col] === val); return api; },
      is(col: string, val: unknown) {
        rows = rows.filter((r: any) => {
          const cell = r[col];
          if (val === null) return cell === null || cell === undefined;
          return cell === val;
        });
        return api;
      },
      limit(n: number) {
        const sliced = rows.slice(0, n);
        const p: any = Promise.resolve({ data: sliced, error: null });
        p.single = () => Promise.resolve({ data: sliced[0] ?? null, error: null });
        return p;
      },
      upsert(payload: unknown, _opts?: unknown) {
        return {
          select() { return { single() { return Promise.resolve({ data: { id: "new-member" }, error: null }); } }; },
          single() { return Promise.resolve({ data: { id: "new-member" }, error: null }); },
        };
      },
      update(payload: any) {
        let filters: Record<string, unknown> = {};
        const ub: any = {
          eq(col: string, val: unknown) { filters[col] = val; return ub; },
          is(col: string, val: unknown) { filters[col] = val; return ub; },
          then(resolve: (v: unknown) => void) {
            updateCapture.push({ table, payload, filters });
            resolve({ data: null, error: updateError });
          },
        };
        return ub;
      },
    };
    return api;
  };

  return {
    from(table: string) { return makeApi(table); },
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
  };
}

const joinerSession: AppSession = {
  userId: "joiner-user-id",
  email: "joiner@example.com",
  role: "member",
  status: "active",
};

test("Fix A: syncPendingDashboardInvitations backfills target_user_id when telegram_invite_token_id is set", async () => {
  const updates: Array<{ table: string; payload: any; filters: Record<string, unknown> }> = [];

  const supabase = makeInvitationsSupabase({
    dashboardInvitations: [
      {
        id: "di-1",
        email: joinerSession.email,
        status: "pending",
        dashboard_id: "dash-1",
        role: "editor",
        invited_by_user_id: "owner-id",
        telegram_invite_token_id: "tit-123",
      },
    ],
    updateCapture: updates,
  }) as any;

  await syncPendingDashboardInvitations(supabase, joinerSession);

  // Should have updated telegram_invite_tokens
  const tokenUpdate = updates.find((u) => u.table === "telegram_invite_tokens");
  assert.ok(tokenUpdate, "should UPDATE telegram_invite_tokens");
  assert.equal(tokenUpdate.payload.target_user_id, joinerSession.userId);
  assert.equal(tokenUpdate.filters["id"], "tit-123");
});

test("Fix A: syncPendingDashboardInvitations does NOT update telegram_invite_tokens when token_id is null", async () => {
  const updates: Array<{ table: string; payload: any; filters: Record<string, unknown> }> = [];

  const supabase = makeInvitationsSupabase({
    dashboardInvitations: [
      {
        id: "di-2",
        email: joinerSession.email,
        status: "pending",
        dashboard_id: "dash-1",
        role: "viewer",
        invited_by_user_id: "owner-id",
        telegram_invite_token_id: null,
      },
    ],
    updateCapture: updates,
  }) as any;

  await syncPendingDashboardInvitations(supabase, joinerSession);

  const tokenUpdate = updates.find((u) => u.table === "telegram_invite_tokens");
  assert.equal(tokenUpdate, undefined, "should NOT update telegram_invite_tokens when token_id is null");
});

test("Fix A: syncPendingDashboardInvitations does not throw when token UPDATE fails", async () => {
  const supabase = makeInvitationsSupabase({
    dashboardInvitations: [
      {
        id: "di-3",
        email: joinerSession.email,
        status: "pending",
        dashboard_id: "dash-1",
        role: "editor",
        invited_by_user_id: "owner-id",
        telegram_invite_token_id: "tit-fail",
      },
    ],
    updateError: new Error("DB update failed"),
  }) as any;

  // Must not throw
  await assert.doesNotReject(
    () => syncPendingDashboardInvitations(supabase, joinerSession),
    "syncPendingDashboardInvitations must not throw on token update failure",
  );
});

// ---------------------------------------------------------------------------
// Fix B: POST /api/admin/invitations 409 when accepted invite exists
// Fix C: POST /api/dashboard/invitations skips user_invitations upsert when pending app invite exists
// Fix D: resend regenerates telegram token when telegram_preauth=true
// ---------------------------------------------------------------------------

const superadminSession: AppSession = {
  userId: "superadmin-1",
  email: "superadmin@example.com",
  role: "superadmin",
  status: "active",
};

const ownerSession: AppSession = {
  userId: "owner-1",
  email: "owner@example.com",
  role: "member",
  status: "active",
};

const ownerMember = {
  id: "dm-owner-1",
  dashboard_id: "dash-1",
  user_id: "owner-1",
  role: "owner",
  status: "active",
  invited_by_user_id: null,
};

function makeHttpStub(opts: {
  userInvitations?: any[];
  dashboardInvitations?: any[];
  dashboardMembers?: any[];
  appUsers?: any[];
  telegramInviteTokens?: any[];
  captureInserts?: Record<string, unknown[]>;
  captureUpserts?: Record<string, unknown[]>;
}) {
  const {
    userInvitations = [],
    dashboardInvitations = [],
    dashboardMembers = [],
    appUsers = [],
    telegramInviteTokens = [],
    captureInserts = {},
    captureUpserts = {},
  } = opts;

  const makeApi = (table: string) => {
    const getRows = () => {
      if (table === "user_invitations") return [...userInvitations];
      if (table === "dashboard_invitations") return [...dashboardInvitations];
      if (table === "dashboard_members") return [...dashboardMembers];
      if (table === "app_users") return [...appUsers];
      if (table === "telegram_invite_tokens") return [...telegramInviteTokens];
      return [] as any[];
    };

    let rows: any[] = getRows();

    const api: any = {
      select(..._: unknown[]) { rows = getRows(); return api; },
      order(..._: unknown[]) { return api; },
      eq(col: string, val: unknown) { rows = rows.filter((r: any) => r[col] === val); return api; },
      is(col: string, val: unknown) {
        rows = rows.filter((r: any) => {
          const cell = r[col];
          if (val === null) return cell === null || cell === undefined;
          return cell === val;
        });
        return api;
      },
      not(col: string, op: string, _v: unknown) {
        if (op === "is") rows = rows.filter((r: any) => r[col] !== null && r[col] !== undefined);
        return api;
      },
      neq(col: string, val: unknown) { rows = rows.filter((r: any) => r[col] !== val); return api; },
      gt(col: string, val: unknown) { rows = rows.filter((r: any) => r[col] != null && r[col] > val); return api; },
      in(col: string, vals: unknown[]) { rows = rows.filter((r: any) => vals.includes(r[col])); return api; },
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
      insert(payload: unknown) {
        if (!captureInserts[table]) captureInserts[table] = [];
        captureInserts[table].push(payload);
        const newRow = { id: `ins-${table}-${captureInserts[table].length}`, ...(payload as object) };
        return {
          select() {
            return {
              single() { return Promise.resolve({ data: newRow, error: null }); },
            };
          },
          single() { return Promise.resolve({ data: newRow, error: null }); },
        };
      },
      upsert(payload: unknown, _opts?: unknown) {
        if (!captureUpserts[table]) captureUpserts[table] = [];
        captureUpserts[table].push(payload);
        const existing = rows[0] ?? {};
        const newRow = { id: `ups-${table}-${captureUpserts[table].length}`, ...existing, ...(payload as object) };
        return {
          select() {
            return {
              single() { return Promise.resolve({ data: newRow, error: null }); },
            };
          },
          single() { return Promise.resolve({ data: newRow, error: null }); },
        };
      },
      update(payload: any) {
        const filters: Record<string, unknown> = {};
        const ub: any = {
          eq(col: string, val: unknown) { filters[col] = val; return ub; },
          is(col: string, val: unknown) { filters[col] = val; return ub; },
          select() { return ub; },
          single() { return Promise.resolve({ data: rows[0] ?? null, error: null }); },
          then(resolve: (v: unknown) => void) { resolve({ data: null, error: null }); },
        };
        return ub;
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
    from(table: string) { return makeApi(table); },
    rpc(_fn: string, _args?: unknown) { return Promise.resolve({ data: null, error: null }); },
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
  };
}

async function withServer(
  session: AppSession,
  stub: ReturnType<typeof makeHttpStub>,
  fn: (baseUrl: string) => Promise<void>,
  opts: { telegramBotUsername?: string } = {},
) {
  const app = createApp({
    supabase: stub as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    telegramBotUsername: opts.telegramBotUsername ?? "testbot",
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

const H = { Authorization: "Bearer valid-token", "Content-Type": "application/json" };

// -- Fix B tests --

test("Fix B: POST /api/admin/invitations returns 409 already_accepted when accepted invite exists", async () => {
  const captureUpserts: Record<string, unknown[]> = {};
  const stub = makeHttpStub({
    userInvitations: [
      {
        id: "inv-1",
        email: "user@example.com",
        status: "accepted",
        expires_at: null,
      },
    ],
    captureUpserts,
  });

  await withServer(superadminSession, stub, async (base) => {
    const res = await fetch(`${base}/api/admin/invitations`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ email: "user@example.com", role: "member" }),
    });
    assert.equal(res.status, 409);
    const body = await res.json() as any;
    assert.equal(body.error, "already_accepted");
    // Must NOT have upserted
    assert.equal((captureUpserts["user_invitations"] ?? []).length, 0);
  });
});

test("Fix B: POST /api/admin/invitations allows re-invite after revoked invite", async () => {
  const stub = makeHttpStub({
    userInvitations: [
      {
        id: "inv-2",
        email: "user@example.com",
        status: "revoked",
        expires_at: "2025-01-01T00:00:00.000Z",
      },
    ],
  });

  await withServer(superadminSession, stub, async (base) => {
    const res = await fetch(`${base}/api/admin/invitations`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ email: "user@example.com", role: "member" }),
    });
    assert.equal(res.status, 201);
  });
});

test("Fix B: POST /api/admin/invitations allows re-invite after expired invite", async () => {
  const stub = makeHttpStub({
    userInvitations: [
      {
        id: "inv-3",
        email: "user@example.com",
        status: "pending",
        expires_at: "2020-01-01T00:00:00.000Z", // already expired
      },
    ],
  });

  await withServer(superadminSession, stub, async (base) => {
    const res = await fetch(`${base}/api/admin/invitations`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ email: "user@example.com", role: "member" }),
    });
    assert.equal(res.status, 201);
  });
});

// -- Fix C tests --

test("Fix C: POST /api/dashboard/invitations skips user_invitations upsert when pending app invite already exists", async () => {
  const captureUpserts: Record<string, unknown[]> = {};
  const stub = makeHttpStub({
    dashboardMembers: [ownerMember],
    appUsers: [], // new user has no account yet
    userInvitations: [
      {
        id: "ui-existing",
        email: "newuser@example.com",
        status: "pending",
        role: "admin", // higher role — must NOT be downgraded
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
    captureUpserts,
  });

  await withServer(ownerSession, stub, async (base) => {
    const res = await fetch(`${base}/api/dashboard/invitations`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ email: "newuser@example.com", role: "editor" }),
    });
    assert.equal(res.status, 201);
    // user_invitations must NOT have been upserted
    assert.equal(
      (captureUpserts["user_invitations"] ?? []).length,
      0,
      "should NOT upsert user_invitations when a pending one already exists",
    );
    // dashboard_invitations SHOULD have been upserted
    assert.ok(
      (captureUpserts["dashboard_invitations"] ?? []).length > 0,
      "should still upsert dashboard_invitations",
    );
  });
});

test("Fix C: POST /api/dashboard/invitations inserts user_invitations when no pending app invite exists", async () => {
  const captureUpserts: Record<string, unknown[]> = {};
  const stub = makeHttpStub({
    dashboardMembers: [ownerMember],
    appUsers: [],
    userInvitations: [], // none
    captureUpserts,
  });

  await withServer(ownerSession, stub, async (base) => {
    const res = await fetch(`${base}/api/dashboard/invitations`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ email: "brandnew@example.com", role: "editor" }),
    });
    assert.equal(res.status, 201);
    assert.ok(
      (captureUpserts["user_invitations"] ?? []).length > 0,
      "should upsert user_invitations when none exists",
    );
  });
});

// -- Fix D tests --

test("Fix D: resend of dashboard invitation with telegram_preauth=true creates new telegram_invite_tokens row", async () => {
  const captureInserts: Record<string, unknown[]> = {};
  const stub = makeHttpStub({
    dashboardMembers: [ownerMember],
    dashboardInvitations: [
      {
        id: "di-resend-1",
        dashboard_id: "dash-1",
        email: "invitee@example.com",
        role: "editor",
        status: "pending",
        invite_token: "old-invite-token",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        accepted_user_id: null,
        last_reminder_at: null,
        invited_by_user_id: "owner-1",
        telegram_preauth: true,
        telegram_invite_token_id: "old-tit-id",
      },
    ],
    appUsers: [],
    captureInserts,
  });

  let emailCalled = false;
  let emailArgs: any = null;

  const app = createApp({
    supabase: stub as AppDeps["supabase"],
    genAI: {
      models: {
        async generateContent() { return { text: '{"intent":"REGISTRAR","items":[]}' }; },
      },
    },
    allowedOrigins: ["http://localhost:5173"],
    botActive: false,
    publicAppUrl: "https://app.example.com",
    telegramBotUsername: "testbot",
    resolveSession: async () => ownerSession,
    // Inject email spy via sendEmail override if supported, else assert via insert
  });

  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;

    const res = await fetch(`${base}/api/personas/di-resend-1/resend`, {
      method: "POST",
      headers: H,
    });
    assert.equal(res.status, 200);

    // A new telegram_invite_tokens row should have been inserted
    const tokenInserts = captureInserts["telegram_invite_tokens"] ?? [];
    assert.ok(tokenInserts.length > 0, "should INSERT a new telegram_invite_tokens row on resend");
    const tokenRow = tokenInserts[0] as any;
    assert.equal(tokenRow.pre_authorized, true);
    assert.ok(tokenRow.token, "new token must be set");
    assert.equal(tokenRow.dashboard_id, "dash-1");
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
});

test("Fix D: resend without telegram_preauth does NOT insert telegram_invite_tokens", async () => {
  const captureInserts: Record<string, unknown[]> = {};
  const stub = makeHttpStub({
    dashboardMembers: [ownerMember],
    dashboardInvitations: [
      {
        id: "di-resend-2",
        dashboard_id: "dash-1",
        email: "invitee2@example.com",
        role: "editor",
        status: "pending",
        invite_token: "old-invite-token-2",
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        accepted_at: null,
        accepted_user_id: null,
        last_reminder_at: null,
        invited_by_user_id: "owner-1",
        telegram_preauth: false,
        telegram_invite_token_id: null,
      },
    ],
    appUsers: [],
    captureInserts,
  });

  await withServer(ownerSession, stub, async (base) => {
    const res = await fetch(`${base}/api/personas/di-resend-2/resend`, {
      method: "POST",
      headers: H,
    });
    assert.equal(res.status, 200);
    assert.equal(
      (captureInserts["telegram_invite_tokens"] ?? []).length,
      0,
      "should NOT insert telegram_invite_tokens when telegram_preauth is false",
    );
  });
});

// ---------------------------------------------------------------------------
// Fix E (review 2026-06-09): expired pending invitations must NOT auto-accept
// ---------------------------------------------------------------------------

test("Fix E: syncPendingDashboardInvitations skips expired pending invitations", async () => {
  const updates: Array<{ table: string; payload: any; filters: Record<string, unknown> }> = [];

  const supabase = makeInvitationsSupabase({
    dashboardInvitations: [
      {
        id: "di-expired",
        email: joinerSession.email,
        status: "pending",
        dashboard_id: "dash-1",
        role: "editor",
        invited_by_user_id: "owner-id",
        telegram_invite_token_id: null,
        expires_at: "2020-01-01T00:00:00.000Z",
      },
    ],
    updateCapture: updates,
  }) as any;

  await syncPendingDashboardInvitations(supabase, joinerSession);

  assert.equal(updates.length, 0, "expired invitation must not be accepted nor updated");
});

test("Fix E: syncPendingDashboardInvitations still accepts invitations without expires_at", async () => {
  const updates: Array<{ table: string; payload: any; filters: Record<string, unknown> }> = [];

  const supabase = makeInvitationsSupabase({
    dashboardInvitations: [
      {
        id: "di-no-expiry",
        email: joinerSession.email,
        status: "pending",
        dashboard_id: "dash-1",
        role: "viewer",
        invited_by_user_id: "owner-id",
        telegram_invite_token_id: null,
        expires_at: null,
      },
    ],
    updateCapture: updates,
  }) as any;

  await syncPendingDashboardInvitations(supabase, joinerSession);

  const acceptUpdate = updates.find((u) => u.table === "dashboard_invitations");
  assert.ok(acceptUpdate, "invitation without expiry must still be accepted");
  assert.equal(acceptUpdate.payload.status, "accepted");
});
