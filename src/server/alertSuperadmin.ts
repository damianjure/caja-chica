// Operational alerting: email the superadmin(s) when an actionable warning fires.
//
// Design constraints (deliberate — see CLAUDE.md decisions):
// - NO global console.warn hook. Alerts are wired explicitly at chosen call sites.
//   This structurally prevents recursion (the email subsystem's own warnings never
//   trigger an alert, because we never wire alertSuperadmin into the email path).
// - Throttled per `code` (default 6h) so a repeating warning can't flood the inbox
//   or burn Brevo quota. In-memory dedup is safe under the single-instance invariant
//   (Cloud Run max-instances=1).
// - Fire-and-forget: never blocks the caller, never throws.

import type { SupabaseLike } from "./app.ts";
import { sendViaBrevo } from "./email.ts";

const ALERT_THROTTLE_MS = 6 * 60 * 60 * 1000; // 6h per code
const lastSentByCode = new Map<string, number>();

let _supabase: SupabaseLike | null = null;

export function configureAlerts(deps: { supabase: SupabaseLike }): void {
  _supabase = deps.supabase;
}

export interface AlertInput {
  /** Stable key used for throttling, e.g. "list-cap:GET /api/empresas". */
  code: string;
  /** Short human title for the subject line. */
  title: string;
  /** What happened (technical). */
  problem: string;
  /** Why it matters (optional). */
  impact?: string;
  /** Extra key/value context (file, endpoint, counts…). */
  context?: Record<string, string | number | undefined>;
  /** Ordered remediation steps. */
  steps: string[];
}

/** Fire-and-forget operational alert. Safe to call from anywhere; never throws. */
export function alertSuperadmin(input: AlertInput): void {
  void dispatchAlert(input).catch((err) => {
    console.error("[alert] dispatch failed:", err);
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildAlertHtml(input: AlertInput): string {
  const rows = Object.entries(input.context ?? {})
    .filter(([, v]) => v !== undefined)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b675f;font-family:monospace;font-size:13px">${escapeHtml(k)}</td><td style="padding:4px 0;font-family:monospace;font-size:13px;color:#222">${escapeHtml(String(v))}</td></tr>`,
    )
    .join("");
  const contextBlock = rows
    ? `<table style="border-collapse:collapse;margin:12px 0">${rows}</table>`
    : "";
  const steps = input.steps
    .map((s) => `<li style="margin:0 0 6px;font-size:14px;line-height:1.5;color:#222">${escapeHtml(s)}</li>`)
    .join("");
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f6f5f2;color:#222">
  <div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e6e3dc;border-radius:12px;overflow:hidden">
    <div style="background:#7a1f1f;color:#fff;padding:16px 24px;font-size:15px;font-weight:700">⚠️ Alerta operativa — Caja Chica</div>
    <div style="padding:24px">
      <h1 style="margin:0 0 4px;font-size:20px;color:#1c1b18">${escapeHtml(input.title)}</h1>
      <p style="margin:0 0 16px;font-size:12px;color:#8a8880;font-family:monospace">code: ${escapeHtml(input.code)}</p>
      <h2 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b675f">Problema</h2>
      <p style="margin:0;font-size:14px;line-height:1.6;color:#222">${escapeHtml(input.problem)}</p>
      ${input.impact ? `<h2 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b675f">Impacto</h2><p style="margin:0;font-size:14px;line-height:1.6;color:#222">${escapeHtml(input.impact)}</p>` : ""}
      ${contextBlock ? `<h2 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b675f">Contexto</h2>${contextBlock}` : ""}
      <h2 style="margin:18px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;color:#6b675f">Pasos para resolver</h2>
      <ol style="margin:0;padding-left:20px">${steps}</ol>
      <p style="margin:24px 0 0;font-size:12px;color:#8a8880">Esta alerta se reenvía como máximo una vez cada 6h por tipo. Generada automáticamente por el backend.</p>
    </div>
  </div>
</body></html>`;
}

async function dispatchAlert(input: AlertInput): Promise<void> {
  const now = Date.now();
  const last = lastSentByCode.get(input.code) ?? 0;
  if (now - last < ALERT_THROTTLE_MS) return; // throttled
  if (!_supabase) return; // alerts not configured yet (e.g. startup) — best-effort

  const { data, error } = await _supabase
    .from("app_users")
    .select("email")
    .eq("role", "superadmin")
    .eq("status", "active");
  if (error) {
    console.error("[alert] superadmin lookup failed:", error);
    return;
  }
  const recipients = (data as Array<{ email: string }> | null ?? [])
    .map((r) => r.email)
    .filter(Boolean);
  if (recipients.length === 0) {
    console.warn("[alert] no superadmin recipients — alert not sent:", input.code);
    return;
  }

  // Mark BEFORE awaiting the sends so concurrent fires within the window are deduped.
  lastSentByCode.set(input.code, now);

  const html = buildAlertHtml(input);
  for (const to of recipients) {
    await sendViaBrevo(to, `⚠️ [Caja Chica] ${input.title}`, html, { emailType: "reminder" });
  }
}
