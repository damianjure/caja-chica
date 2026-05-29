// brevoSenders.ts — proxy for Brevo verified senders list.
// 5-min in-process cache. Same BREVO_API_KEY as email.ts (no new secret).
// Single-instance invariant: Cloud Run max=1.

const BREVO_SENDERS_ENDPOINT = "https://api.brevo.com/v3/senders";
const CACHE_TTL_MS = 5 * 60_000; // 5 minutes

export interface BrevoSender {
  id: number;
  name: string;
  email: string;
  active: boolean;
}

// Module-level cache
const cache: { senders: BrevoSender[]; cachedAt: number } = {
  senders: [],
  cachedAt: 0,
};

export function invalidateSendersCache(): void {
  cache.cachedAt = 0;
}

export async function listVerifiedSenders(apiKey: string): Promise<BrevoSender[]> {
  const now = Date.now();
  if (cache.cachedAt > 0 && now - cache.cachedAt < CACHE_TTL_MS) {
    return cache.senders;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const res = await fetch(BREVO_SENDERS_ENDPOINT, {
      method: "GET",
      headers: {
        "api-key": apiKey,
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "<no body>");
      throw new Error(`[brevoSenders] Brevo returned ${res.status}: ${body}`);
    }

    const data = await res.json() as { senders?: unknown[] };
    const raw = Array.isArray(data.senders) ? data.senders : [];

    const senders: BrevoSender[] = raw
      .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
      .map((s) => ({
        id: typeof s.id === "number" ? s.id : 0,
        name: typeof s.name === "string" ? s.name : "",
        email: typeof s.email === "string" ? s.email : "",
        active: s.active === true,
      }));

    cache.senders = senders;
    cache.cachedAt = now;
    return senders;
  } catch (err) {
    // Re-throw: caller (route handler) converts to 502
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
