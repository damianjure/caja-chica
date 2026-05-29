// Email delivery via Brevo (formerly Sendinblue) transactional API.
// Endpoint: POST https://api.brevo.com/v3/smtp/email
// Auth: header `api-key`
// Docs: https://developers.brevo.com/reference/sendtransacemail

import type { SupabaseLike } from "./app.ts";
import { getActiveSender } from "./emailSettings.ts";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// Module-level env constants (kept for back-compat and as fallback baseline).
const FROM_EMAIL = process.env.FROM_EMAIL ?? "hola@damianjure.com";
const FROM_NAME = process.env.FROM_NAME ?? "Caja Chica";

function getApiKey(): string | null {
  return process.env.BREVO_API_KEY ?? null;
}

// ---------------------------------------------------------------------------
// configureEmail — one-time injector called at startup in server.ts.
// Injects the supabase client so sendViaBrevo can resolve the active sender
// and write email_log without threading supabase through every call site.
// ---------------------------------------------------------------------------

export type EmailType = "app_invite" | "dashboard_invite" | "test" | "reminder";

interface EmailDeps {
  supabase: SupabaseLike;
}

let _injectedDeps: EmailDeps | null = null;

export function configureEmail(deps: EmailDeps): void {
  _injectedDeps = deps;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function baseTemplate(title: string, preheader: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${title}</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      margin: 0;
      padding: 0;
      background: oklch(98% 0.005 95);
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: oklch(22% 0.01 95);
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .preheader {
      display: none !important;
      visibility: hidden;
      opacity: 0;
      color: transparent;
      height: 0;
      width: 0;
      overflow: hidden;
      mso-hide: all;
    }
    .wrapper {
      max-width: 560px;
      margin: 48px auto;
      padding: 0 20px;
    }
    .card {
      background: oklch(100% 0 0);
      border: 1px solid oklch(93% 0.005 95);
      border-radius: 16px;
      overflow: hidden;
    }
    .brandbar {
      padding: 28px 36px 0;
      display: flex;
      align-items: center;
    }
    .mark {
      display: inline-block;
      width: 36px;
      height: 36px;
      line-height: 36px;
      text-align: center;
      background: oklch(62% 0.14 148);
      color: oklch(100% 0 0);
      border-radius: 10px;
      font-weight: 700;
      font-size: 16px;
      letter-spacing: -0.5px;
      margin-right: 12px;
    }
    .wordmark {
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.2px;
      color: oklch(22% 0.01 95);
    }
    .content { padding: 32px 36px 8px; }
    .eyebrow {
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: oklch(55% 0.08 148);
      margin: 0 0 12px;
    }
    h2.title {
      margin: 0 0 20px;
      font-size: 26px;
      line-height: 1.2;
      font-weight: 700;
      letter-spacing: -0.6px;
      color: oklch(18% 0.01 95);
    }
    p.lede {
      font-size: 16px;
      line-height: 1.6;
      color: oklch(32% 0.01 95);
      margin: 0 0 24px;
      max-width: 56ch;
    }
    p.body {
      font-size: 15px;
      line-height: 1.65;
      color: oklch(32% 0.01 95);
      margin: 0 0 16px;
      max-width: 60ch;
    }
    .cta {
      margin: 28px 0 12px;
    }
    .cta a {
      display: inline-block;
      background: oklch(22% 0.01 95);
      color: oklch(100% 0 0);
      text-decoration: none;
      padding: 14px 26px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      letter-spacing: -0.1px;
    }
    .cta .hint {
      display: block;
      margin-top: 10px;
      font-size: 13px;
      color: oklch(52% 0.01 95);
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 999px;
      background: oklch(94% 0.04 148);
      color: oklch(38% 0.1 148);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .note {
      margin: 8px 0 24px;
      padding: 14px 16px;
      border-radius: 10px;
      background: oklch(97% 0.025 90);
      border: 1px solid oklch(90% 0.05 90);
      font-size: 13px;
      line-height: 1.55;
      color: oklch(32% 0.04 80);
    }
    .section { margin: 32px 0 8px; }
    .section h3 {
      margin: 0 0 14px;
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: oklch(45% 0.01 95);
    }
    ol.steps {
      list-style: none;
      counter-reset: step;
      margin: 0;
      padding: 0;
    }
    ol.steps li {
      counter-increment: step;
      position: relative;
      padding: 0 0 14px 36px;
      font-size: 14.5px;
      line-height: 1.6;
      color: oklch(28% 0.01 95);
    }
    ol.steps li:last-child { padding-bottom: 0; }
    ol.steps li::before {
      content: counter(step);
      position: absolute;
      left: 0;
      top: 1px;
      width: 24px;
      height: 24px;
      line-height: 24px;
      text-align: center;
      background: oklch(95% 0.005 95);
      color: oklch(35% 0.01 95);
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
    }
    .rule {
      border: none;
      border-top: 1px solid oklch(93% 0.005 95);
      margin: 36px 0 8px;
    }
    .signoff {
      font-size: 15px;
      color: oklch(28% 0.01 95);
      margin: 28px 0 4px;
    }
    .signoff strong { font-weight: 600; }
    .from {
      font-size: 13px;
      color: oklch(48% 0.01 95);
      margin: 0 0 24px;
    }
    .from strong { color: oklch(22% 0.01 95); font-weight: 600; }
    .from-footer {
      font-size: 12.5px;
      color: oklch(58% 0.01 95);
      margin: 24px 0 0;
      font-style: italic;
    }
    h1.title {
      margin: 0 0 20px;
      font-size: 24px;
      line-height: 1.25;
      font-weight: 600;
      letter-spacing: -0.5px;
      color: oklch(18% 0.01 95);
    }
    .fine {
      font-size: 13.5px;
      color: oklch(48% 0.01 95);
      line-height: 1.6;
      margin: 0 0 20px;
      max-width: 56ch;
    }
    .aside {
      font-size: 14px;
      color: oklch(42% 0.01 95);
      line-height: 1.55;
      margin: 24px 0 16px;
      padding: 12px 14px;
      background: oklch(96% 0.005 95);
      border-radius: 8px;
      max-width: 56ch;
    }
    .link {
      color: oklch(38% 0.1 148);
      text-decoration: none;
      font-weight: 600;
    }
    .link:hover { text-decoration: underline; }
    .padbottom { padding-bottom: 32px; }
    .footer {
      padding: 20px 36px 0;
      text-align: center;
    }
    .footer p {
      margin: 0;
      font-size: 12.5px;
      line-height: 1.55;
      color: oklch(58% 0.01 95);
    }
    @media (max-width: 480px) {
      .wrapper { margin: 16px auto; padding: 0 12px; }
      .brandbar { padding: 22px 22px 0; }
      .content { padding: 24px 22px 4px; }
      .footer { padding: 16px 22px 0; }
      h1.title, h2.title { font-size: 22px; }
      p.lede { font-size: 15px; }
      .cta a { display: block; text-align: center; }
    }
    @media (prefers-color-scheme: dark) {
      body { background: oklch(16% 0.008 95); color: oklch(92% 0.005 95); }
      .card { background: oklch(20% 0.008 95); border-color: oklch(26% 0.008 95); }
      .wordmark { color: oklch(94% 0.005 95); }
      h1.title, h2.title { color: oklch(96% 0.005 95); }
      p.lede, p.body { color: oklch(78% 0.005 95); }
      .cta a { background: oklch(94% 0.005 95); color: oklch(18% 0.01 95); }
      .cta .hint { color: oklch(62% 0.01 95); }
      .note { background: oklch(26% 0.02 90); border-color: oklch(32% 0.04 90); color: oklch(85% 0.02 90); }
      .section h3 { color: oklch(65% 0.01 95); }
      ol.steps li { color: oklch(82% 0.005 95); }
      ol.steps li::before { background: oklch(26% 0.008 95); color: oklch(82% 0.005 95); }
      .rule { border-top-color: oklch(28% 0.008 95); }
      .footer p { color: oklch(58% 0.01 95); }
      .badge { background: oklch(30% 0.06 148); color: oklch(88% 0.08 148); }
      .from { color: oklch(60% 0.01 95); }
      .from strong { color: oklch(94% 0.005 95); }
      .from-footer { color: oklch(60% 0.01 95); }
      .fine { color: oklch(60% 0.01 95); }
      .aside { background: oklch(24% 0.008 95); color: oklch(72% 0.01 95); }
      .link { color: oklch(75% 0.12 148); }
    }
  </style>
</head>
<body>
  <span class="preheader">${escapeHtml(preheader)}</span>
  <div class="wrapper">
    <div class="card">
      <div class="brandbar">
        <span class="mark">C</span>
        <span class="wordmark">Caja Chica</span>
      </div>
      <div class="content padbottom">
        ${body}
      </div>
    </div>
    <div class="footer">
      <p>Recibís este mail porque alguien usó tu dirección para invitarte a Caja Chica. Si no esperabas la invitación, ignoralo.</p>
    </div>
  </div>
</body>
</html>`;
}

export function appInvitationHtml(inviteUrl: string): string {
  const safeUrl = escapeHtml(inviteUrl);
  // Single-CTA welcome email (research-driven, 2026-05-21 redesign).
  // No feature dump, no nested step boxes — one activation action only.
  const body = `
    <p class="from"><strong>Damián</strong> · Caja Chica</p>
    <h1 class="title">Te invité a Caja Chica.</h1>
    <p class="lede">Es una app para registrar gastos e ingresos escribiendo como hablás. Tipo: <em>"pagué 4500 de luz"</em>.</p>

    <div class="cta">
      <a href="${safeUrl}">Entrar con Google</a>
    </div>

    <p class="fine">Usá la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.</p>

    <p class="signoff">Cualquier cosa, respondé este mail. Lo leo yo.</p>
    <p class="signoff"><strong>Damián</strong></p>
  `;
  return baseTemplate(
    "Te invité a Caja Chica",
    "Entrá con Google y empezá a registrar movimientos escribiendo como hablás.",
    body,
  );
}

export function dashboardInvitationHtml(inviteUrl: string, role: string, inviterEmail: string, telegramDeepLink?: string): string {
  const safeUrl = escapeHtml(inviteUrl);
  const safeInviter = escapeHtml(inviterEmail);
  const inviterName = inviterEmail.split("@")[0] ?? "Alguien";
  const safeInviterName = escapeHtml(inviterName);
  const isEditor = role === "editor";
  const roleBadge = isEditor ? "Puede editar" : "Puede ver";
  const rolePerk = isEditor
    ? "podés ver y cargar movimientos en tiempo real."
    : "podés ver todos los movimientos del dashboard.";

  // Single-CTA dashboard invite (research-driven, 2026-05-21 redesign).
  // Telegram, if pre-authorized, becomes a small secondary line — not a full section.
  const body = `
    <p class="from"><strong>${safeInviterName}</strong> · vía Caja Chica</p>
    <h1 class="title">${safeInviterName} te sumó al dashboard.</h1>
    <p class="lede">Compartimos los mismos movimientos. Entrás con acceso <span class="badge">${roleBadge}</span> así ${rolePerk}</p>

    <div class="cta">
      <a href="${safeUrl}">Entrar con Google</a>
    </div>

    <p class="fine">Usá la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.</p>

    ${telegramDeepLink ? `
    <p class="aside">¿Preferís cargar gastos por Telegram? <a class="link" href="${escapeHtml(telegramDeepLink)}">Sumarlo después del primer login →</a></p>
    ` : ``}

    <p class="signoff">Cualquier cosa, respondé este mail.</p>
    <p class="signoff"><strong>${safeInviterName}</strong></p>
    <p class="from-footer">Te escribe ${safeInviter}. Caja Chica solo le presta el sobre.</p>
  `;
  return baseTemplate(
    `${inviterName} te sumó al dashboard`,
    `${inviterName} te invitó a su dashboard de Caja Chica con acceso ${roleBadge}.`,
    body,
  );
}

function sanitizeHeader(value: string): string {
  // Strip CR/LF to prevent header injection if upstream value ever contains them.
  return value.replace(/[\r\n]+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// sendViaBrevo — the single Brevo transport seam.
// Returns { ok, messageId? } so test-send can echo messageId.
// Existing callers (sendAppInvitationEmail, sendDashboardInvitationEmail) ignore the return value.
// ---------------------------------------------------------------------------

export interface SendResult {
  ok: boolean;
  messageId?: string;
}

export interface SendViaBrevoOpts {
  fromEmail?: string;
  fromName?: string;
  emailType?: EmailType;
  invitationId?: string | null;
}

export async function sendViaBrevo(
  to: string,
  subject: string,
  htmlContent: string,
  opts?: SendViaBrevoOpts,
): Promise<SendResult> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[email] BREVO_API_KEY not set — skipping email to", to);
    return { ok: false };
  }

  // Resolve sender: opts override → active sender from DB → env constants.
  let senderEmail = FROM_EMAIL;
  let senderName = FROM_NAME;

  if (opts?.fromEmail && opts?.fromName) {
    senderEmail = opts.fromEmail;
    senderName = opts.fromName;
  } else if (_injectedDeps) {
    const active = await getActiveSender(_injectedDeps.supabase);
    senderEmail = active.fromEmail;
    senderName = active.fromName;
  }

  const payload = {
    sender: { name: sanitizeHeader(senderName), email: sanitizeHeader(senderEmail) },
    to: [{ email: sanitizeHeader(to) }],
    subject: sanitizeHeader(subject),
    htmlContent,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  let result: SendResult = { ok: false };

  try {
    const res = await fetch(BREVO_ENDPOINT, {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "<no body>");
      console.error("[email] Brevo send failed", { to, status: res.status, body: errorBody });
      result = { ok: false };

      // Fire-and-forget log: failure (INVARIANT #2 — must not throw)
      if (_injectedDeps) {
        const { writeEmailLog } = await import("./emailLog.ts");
        void writeEmailLog({
          supabase: _injectedDeps.supabase,
          toEmail: to,
          subject,
          emailType: opts?.emailType ?? "app_invite",
          ok: false,
          errorBody,
          invitationId: opts?.invitationId ?? null,
        });
      }

      return result;
    }

    const resBody = await res.json().catch(() => ({})) as Record<string, unknown>;
    const messageId = typeof resBody.messageId === "string" ? resBody.messageId : undefined;
    console.log("[email] Sent to", to, "subject:", subject);
    result = { ok: true, messageId };

    // Fire-and-forget log: success (INVARIANT #2 — must not throw)
    if (_injectedDeps) {
      const { writeEmailLog } = await import("./emailLog.ts");
      void writeEmailLog({
        supabase: _injectedDeps.supabase,
        toEmail: to,
        subject,
        emailType: opts?.emailType ?? "app_invite",
        ok: true,
        messageId,
        invitationId: opts?.invitationId ?? null,
      });
    }

    return result;
  } catch (err) {
    console.error("[email] Brevo request error", { to, err });
    result = { ok: false };

    if (_injectedDeps) {
      const { writeEmailLog } = await import("./emailLog.ts");
      void writeEmailLog({
        supabase: _injectedDeps.supabase,
        toEmail: to,
        subject,
        emailType: opts?.emailType ?? "app_invite",
        ok: false,
        errorBody: err instanceof Error ? err.message : String(err),
        invitationId: opts?.invitationId ?? null,
      });
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Public senders — stable signatures (back-compat with existing callers).
// ---------------------------------------------------------------------------

export async function sendAppInvitationEmail(
  to: string,
  inviteUrl: string,
  emailType?: EmailType,
): Promise<void> {
  await sendViaBrevo(to, "Te invitaron a Caja Chica", appInvitationHtml(inviteUrl), {
    emailType: emailType ?? "app_invite",
  });
}

export async function sendDashboardInvitationEmail(
  to: string,
  inviteUrl: string,
  role: string,
  inviterEmail: string,
  telegramDeepLink?: string,
  emailType?: EmailType,
): Promise<void> {
  await sendViaBrevo(
    to,
    `${inviterEmail} te invitó a su dashboard en Caja Chica`,
    dashboardInvitationHtml(inviteUrl, role, inviterEmail, telegramDeepLink),
    { emailType: emailType ?? "dashboard_invite" },
  );
}
