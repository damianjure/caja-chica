/**
 * session.ts — in-memory multi-step session store for WhatsApp guided flows.
 *
 * WhatsApp has no inline-keyboard state: each message is a separate webhook, so
 * a guided flow (informes, recurrente) needs server-side state keyed by chatKey.
 * Mirrors the bot's pendingReportSessions Map pattern; the single-instance
 * invariant (Cloud Run max-instances=1) keeps it correct. Passed via router deps
 * so tests/harness get a fresh store.
 */

const DEFAULT_TTL_MS = 15 * 60_000;

export interface WaSession {
  flow: string;
  step: string;
  data: Record<string, unknown>;
  expiresAt: number;
}

export class WaSessionStore {
  private readonly map = new Map<string, WaSession>();

  get(chatKey: string, now: number = Date.now()): WaSession | null {
    const s = this.map.get(chatKey);
    if (!s) return null;
    if (now > s.expiresAt) {
      this.map.delete(chatKey);
      return null;
    }
    return s;
  }

  start(chatKey: string, flow: string, step: string, ttlMs: number = DEFAULT_TTL_MS, now: number = Date.now()): WaSession {
    const s: WaSession = { flow, step, data: {}, expiresAt: now + ttlMs };
    this.map.set(chatKey, s);
    return s;
  }

  set(chatKey: string, session: WaSession): void {
    this.map.set(chatKey, session);
  }

  clear(chatKey: string): void {
    this.map.delete(chatKey);
  }
}
