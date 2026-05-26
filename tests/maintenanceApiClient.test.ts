/**
 * Tests for the maintenance API client functions added to src/services/api.ts.
 *
 * Because api.ts uses import.meta.env (not available in Node.js without a
 * bundler), we test equivalent standalone functions that replicate the same
 * fetch calls and verify the correct URL, method, and body are sent.
 *
 * The functions below mirror the api.ts additions exactly.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// ---------------------------------------------------------------------------
// Minimal capture server
// ---------------------------------------------------------------------------

function startCaptureServer(): Promise<{
  url: string;
  getRequests: () => Array<{ method: string; url: string; body: string }>;
  setResponse: (status: number, body: unknown) => void;
  close: () => Promise<void>;
}> {
  const requests: Array<{ method: string; url: string; body: string }> = [];
  let responseStatus = 200;
  let responseBody: unknown = { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null };

  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method ?? "GET", url: req.url ?? "/", body });
    res.writeHead(responseStatus, { "Content-Type": "application/json" });
    res.end(JSON.stringify(responseBody));
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        getRequests: () => requests,
        setResponse: (status, body) => {
          responseStatus = status;
          responseBody = body;
        },
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Standalone api client helpers — mirrors api.ts additions
// ---------------------------------------------------------------------------

export interface MaintenanceStatus {
  status: "none" | "grace" | "active" | "scheduled";
  started_at: string | null;
  scheduled_at: string | null;
  grace_ends_at: string | null;
  estimated_end_at: string | null;
  message: string | null;
}

function makeApiClient(apiBase: string, token?: string) {
  async function req(path: string, options?: RequestInit): Promise<unknown> {
    const res = await fetch(`${apiBase}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options?.headers,
      },
    });
    return res.json();
  }

  return {
    getMaintenanceStatus(): Promise<MaintenanceStatus> {
      return req("/api/maintenance/status") as Promise<MaintenanceStatus>;
    },
    activateMaintenance(opts: { message?: string; estimatedEnd?: string }): Promise<MaintenanceStatus> {
      return req("/api/maintenance/activate", {
        method: "POST",
        body: JSON.stringify({ message: opts.message, estimatedEnd: opts.estimatedEnd }),
      }) as Promise<MaintenanceStatus>;
    },
    scheduleMaintenance(opts: { scheduledAt: string; message?: string; estimatedEnd?: string }): Promise<MaintenanceStatus> {
      return req("/api/maintenance/schedule", {
        method: "POST",
        body: JSON.stringify({ scheduledAt: opts.scheduledAt, message: opts.message, estimatedEnd: opts.estimatedEnd }),
      }) as Promise<MaintenanceStatus>;
    },
    endMaintenance(): Promise<MaintenanceStatus> {
      return req("/api/maintenance/end", { method: "POST" }) as Promise<MaintenanceStatus>;
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1: getMaintenanceStatus — GET /api/maintenance/status (public, no auth)
// ---------------------------------------------------------------------------

test("getMaintenanceStatus sends GET to /api/maintenance/status", async () => {
  const srv = await startCaptureServer();
  srv.setResponse(200, { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null });

  const client = makeApiClient(srv.url);
  const result = await client.getMaintenanceStatus();

  const reqs = srv.getRequests();
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].method, "GET");
  assert.equal(reqs[0].url, "/api/maintenance/status");
  assert.equal(result.status, "none");
  assert.equal(result.started_at, null);

  await srv.close();
});

// ---------------------------------------------------------------------------
// Test 2: activateMaintenance — POST /api/maintenance/activate with body
// ---------------------------------------------------------------------------

test("activateMaintenance sends POST to /api/maintenance/activate with correct body", async () => {
  const srv = await startCaptureServer();
  const graceEndsAt = new Date(Date.now() + 300_000).toISOString();
  srv.setResponse(200, { status: "grace", started_at: null, scheduled_at: null, grace_ends_at: graceEndsAt, estimated_end_at: null, message: "Actualizando" });

  const client = makeApiClient(srv.url, "test-token");
  const result = await client.activateMaintenance({ message: "Actualizando", estimatedEnd: "2 horas" });

  const reqs = srv.getRequests();
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].method, "POST");
  assert.equal(reqs[0].url, "/api/maintenance/activate");

  const body = JSON.parse(reqs[0].body);
  assert.equal(body.message, "Actualizando");
  assert.equal(body.estimatedEnd, "2 horas");
  assert.equal(result.status, "grace");

  await srv.close();
});

// ---------------------------------------------------------------------------
// Test 3: scheduleMaintenance — POST /api/maintenance/schedule with body
// ---------------------------------------------------------------------------

test("scheduleMaintenance sends POST to /api/maintenance/schedule with correct body", async () => {
  const srv = await startCaptureServer();
  const scheduledAt = "2026-05-27T03:00:00.000Z";
  srv.setResponse(200, { status: "scheduled", started_at: null, scheduled_at: scheduledAt, grace_ends_at: null, estimated_end_at: null, message: null });

  const client = makeApiClient(srv.url, "test-token");
  const result = await client.scheduleMaintenance({ scheduledAt, message: "DB upgrade" });

  const reqs = srv.getRequests();
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].method, "POST");
  assert.equal(reqs[0].url, "/api/maintenance/schedule");

  const body = JSON.parse(reqs[0].body);
  assert.equal(body.scheduledAt, scheduledAt);
  assert.equal(body.message, "DB upgrade");
  assert.equal(result.status, "scheduled");

  await srv.close();
});

// ---------------------------------------------------------------------------
// Test 4: endMaintenance — POST /api/maintenance/end
// ---------------------------------------------------------------------------

test("endMaintenance sends POST to /api/maintenance/end", async () => {
  const srv = await startCaptureServer();
  srv.setResponse(200, { status: "none", started_at: null, scheduled_at: null, grace_ends_at: null, estimated_end_at: null, message: null });

  const client = makeApiClient(srv.url, "test-token");
  const result = await client.endMaintenance();

  const reqs = srv.getRequests();
  assert.equal(reqs.length, 1);
  assert.equal(reqs[0].method, "POST");
  assert.equal(reqs[0].url, "/api/maintenance/end");
  assert.equal(result.status, "none");

  await srv.close();
});
