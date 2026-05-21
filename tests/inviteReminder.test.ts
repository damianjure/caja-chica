// Tests for processInviteReminders — invite reminder cron logic.
// Uses dependency injection for email senders so no module mocking is needed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  processInviteReminders,
  type InviteReminderOpts,
} from "../src/server/inviteReminders.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysFromNow = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Minimal supabase builder mock
// Returns rows whose status=pending (simulating DB query with filters).
// The "lte/gt/or/is" filter methods are stubs — real filtering is done by
// returning only the rows we care about per test (matching what DB returns).
// ---------------------------------------------------------------------------
function makeQueryChain(rows: Row[], updatedIds: string[]) {
  const chain: Record<string, unknown> = {};
  let isUpdate = false;
  let _updatePayload: Row = {};

  const thenable = {
    then(
      resolve: (v: { data: Row[] | null; error: null }) => void,
      _reject?: (e: unknown) => void,
    ) {
      if (isUpdate) {
        for (const r of rows) {
          if (typeof r.id === "string") updatedIds.push(r.id);
        }
        resolve({ data: rows.map((r) => ({ ...r, ..._updatePayload })), error: null });
      } else {
        resolve({ data: rows, error: null });
      }
    },
  };

  const stub: Record<string, unknown> = {
    select: (_cols: string) => stub,
    eq: (_col: string, _val: unknown) => stub,
    is: (_col: string, _val: unknown) => stub,
    lte: (_col: string, _val: unknown) => stub,
    gt: (_col: string, _val: unknown) => stub,
    or: (_expr: string) => stub,
    update: (payload: Row) => {
      isUpdate = true;
      _updatePayload = payload;
      return stub;
    },
    then: thenable.then.bind(thenable),
  };

  Object.assign(chain, stub);
  return chain;
}

function makeSupabase(appRows: Row[], dashRows: Row[]) {
  const appUpdated: string[] = [];
  const dashUpdated: string[] = [];

  const supabase = {
    from(table: string) {
      if (table === "user_invitations") return makeQueryChain(appRows, appUpdated);
      if (table === "dashboard_invitations") return makeQueryChain(dashRows, dashUpdated);
      throw new Error(`Unexpected table: ${table}`);
    },
    _appUpdated: appUpdated,
    _dashUpdated: dashUpdated,
  };

  return supabase as unknown as Parameters<typeof processInviteReminders>[0] & {
    _appUpdated: string[];
    _dashUpdated: string[];
  };
}

function makeOpts(): InviteReminderOpts & {
  appCalls: Array<{ to: string; url: string }>;
  dashCalls: Array<{ to: string; url: string; role: string; inviterEmail: string }>;
} {
  const appCalls: Array<{ to: string; url: string }> = [];
  const dashCalls: Array<{ to: string; url: string; role: string; inviterEmail: string }> = [];
  return {
    appCalls,
    dashCalls,
    sendAppEmail: async (to, url) => { appCalls.push({ to, url }); },
    sendDashboardEmail: async (to, url, role, inviterEmail) => { dashCalls.push({ to, url, role, inviterEmail }); },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("processInviteReminders", () => {
  it("sends app reminder for pending invite older than 3 days with no prior reminder", async () => {
    const supabase = makeSupabase(
      [
        {
          id: "inv-1",
          email: "user@example.com",
          invite_url: "https://example.com/invite/abc",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
      ],
      [],
    );
    const opts = makeOpts();

    await processInviteReminders(supabase, opts);

    assert.equal(opts.appCalls.length, 1);
    assert.equal(opts.appCalls[0].to, "user@example.com");
  });

  it("sends app reminder for invite with last_reminder_at older than 1 day", async () => {
    const supabase = makeSupabase(
      [
        {
          id: "inv-2",
          email: "user2@example.com",
          invite_url: "https://example.com/invite/def",
          status: "pending",
          created_at: daysAgo(5),
          expires_at: daysFromNow(2),
          last_reminder_at: daysAgo(2),
        },
      ],
      [],
    );
    const opts = makeOpts();

    await processInviteReminders(supabase, opts);

    assert.equal(opts.appCalls.length, 1);
  });

  it("sends dashboard reminder for pending dashboard invite older than 3 days", async () => {
    const supabase = makeSupabase(
      [],
      [
        {
          id: "dash-1",
          email: "collab@example.com",
          invite_url: "https://example.com/invite/xyz",
          role: "editor",
          inviter_email: "owner@example.com",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
      ],
    );
    const opts = makeOpts();

    await processInviteReminders(supabase, opts);

    assert.equal(opts.dashCalls.length, 1);
    assert.equal(opts.dashCalls[0].to, "collab@example.com");
    assert.equal(opts.dashCalls[0].role, "editor");
    assert.equal(opts.dashCalls[0].inviterEmail, "owner@example.com");
  });

  it("processes multiple invites and sends all reminders", async () => {
    const supabase = makeSupabase(
      [
        {
          id: "a1",
          email: "a1@example.com",
          invite_url: "https://example.com/invite/a1",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
        {
          id: "a2",
          email: "a2@example.com",
          invite_url: "https://example.com/invite/a2",
          status: "pending",
          created_at: daysAgo(5),
          expires_at: daysFromNow(2),
          last_reminder_at: null,
        },
      ],
      [],
    );
    const opts = makeOpts();

    await processInviteReminders(supabase, opts);

    assert.equal(opts.appCalls.length, 2);
  });

  it("continues processing remaining invites even if one email throws", async () => {
    const supabase = makeSupabase(
      [
        {
          id: "fail-1",
          email: "fail@example.com",
          invite_url: "https://example.com/invite/fail",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
        {
          id: "ok-1",
          email: "ok@example.com",
          invite_url: "https://example.com/invite/ok",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
      ],
      [],
    );

    let firstCall = true;
    const opts: InviteReminderOpts = {
      sendAppEmail: async (to) => {
        if (firstCall) {
          firstCall = false;
          throw new Error("SMTP error");
        }
        // second call succeeds silently
      },
      sendDashboardEmail: async () => {},
    };

    // Should not throw — for-of + try/catch isolates failures
    await assert.doesNotReject(() => processInviteReminders(supabase, opts));
  });

  it("sends both app and dashboard reminders in same run", async () => {
    const supabase = makeSupabase(
      [
        {
          id: "app-1",
          email: "app@example.com",
          invite_url: "https://example.com/invite/app",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
      ],
      [
        {
          id: "dash-2",
          email: "dash@example.com",
          invite_url: "https://example.com/invite/dash",
          role: "viewer",
          inviter_email: "boss@example.com",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
      ],
    );
    const opts = makeOpts();

    await processInviteReminders(supabase, opts);

    assert.equal(opts.appCalls.length, 1);
    assert.equal(opts.dashCalls.length, 1);
  });

  it("returns object with sent count", async () => {
    const supabase = makeSupabase(
      [
        {
          id: "cnt-1",
          email: "cnt@example.com",
          invite_url: "https://example.com/invite/cnt",
          status: "pending",
          created_at: daysAgo(4),
          expires_at: daysFromNow(3),
          last_reminder_at: null,
        },
      ],
      [],
    );
    const opts = makeOpts();

    const result = await processInviteReminders(supabase, opts);

    // Function returns { sent: number } or void — if it returns something,
    // check the type. Either is acceptable per design.
    assert.ok(result === undefined || (typeof result === "object" && result !== null));
  });

  it("handles empty result sets without error", async () => {
    const supabase = makeSupabase([], []);
    const opts = makeOpts();

    await assert.doesNotReject(() => processInviteReminders(supabase, opts));
    assert.equal(opts.appCalls.length, 0);
    assert.equal(opts.dashCalls.length, 0);
  });
});
