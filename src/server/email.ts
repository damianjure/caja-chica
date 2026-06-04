// Email delivery via Brevo (formerly Sendinblue) transactional API.
// Endpoint: POST https://api.brevo.com/v3/smtp/email
// Auth: header `api-key`
// Docs: https://developers.brevo.com/reference/sendtransacemail

import type { SupabaseLike } from "./app.ts";
import { getActiveSender } from "./emailSettings.ts";
import { writeEmailLog } from "./emailLog.ts";

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

// Module-level env constants (kept for back-compat and as fallback baseline).
const FROM_EMAIL = process.env.FROM_EMAIL ?? "hola@damianjure.com";
const FROM_NAME = process.env.FROM_NAME ?? "Caja Chica";
const PUBLIC_APP_URL = (process.env.PUBLIC_APP_URL ?? "https://caja-chica-bot.web.app").replace(/\/$/, "");
const EMAIL_LOGO_URL = `${PUBLIC_APP_URL}/logo-caja-chica-login.png`;

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
      gap: 12px;
    }
    .logo-shell {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      overflow: hidden;
      background: oklch(18% 0.05 148);
      box-shadow: 0 8px 18px rgba(14, 40, 26, 0.10);
      flex: 0 0 auto;
    }
    .logo-shell img {
      display: block;
      width: 44px;
      height: 44px;
      border: 0;
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
    .telegram-block {
      margin: 18px 0 24px;
      padding: 16px 18px;
      border-radius: 12px;
      background: oklch(97% 0.018 148);
      border: 1px solid oklch(88% 0.05 148);
      color: oklch(30% 0.05 148);
      max-width: 56ch;
    }
    .telegram-block h3 {
      margin: 0 0 8px;
      font-size: 16px;
      line-height: 1.3;
      letter-spacing: -0.2px;
      color: oklch(24% 0.08 148);
    }
    .telegram-block p {
      margin: 0;
      font-size: 14px;
      line-height: 1.55;
    }
    .telegram-block .telegram-kicker {
      margin: 0 0 8px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: oklch(42% 0.1 148);
    }
    .telegram-block ul {
      margin: 10px 0 0;
      padding: 0;
      list-style: none;
    }
    .telegram-block li {
      display: inline-block;
      margin: 0 6px 6px 0;
      padding: 5px 9px;
      border-radius: 999px;
      background: oklch(100% 0 0 / 72%);
      border: 1px solid oklch(88% 0.04 148);
      font-size: 12.5px;
      color: oklch(30% 0.06 148);
    }
    .role-summary {
      margin: 4px 0 20px;
      padding: 12px 14px;
      border-radius: 10px;
      background: oklch(96.5% 0.02 148);
      border: 1px solid oklch(88% 0.045 148);
      color: oklch(32% 0.06 148);
      font-size: 14px;
      line-height: 1.55;
      max-width: 56ch;
    }
    .role-summary strong { color: oklch(24% 0.08 148); }
    .caps {
      margin: 16px 0 22px;
      border: 1px solid oklch(92% 0.005 95);
      border-radius: 12px;
      padding: 16px 18px;
      background: oklch(98.5% 0.003 95);
    }
    .caps h3 {
      margin: 0 0 12px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
      color: oklch(45% 0.01 95);
    }
    .caps ul { list-style: none; margin: 0; padding: 0; }
    .caps li {
      position: relative;
      padding: 0 0 9px 26px;
      font-size: 14px;
      line-height: 1.45;
      color: oklch(30% 0.01 95);
    }
    .caps li:last-child { padding-bottom: 0; }
    .caps li::before {
      content: "✓";
      position: absolute;
      left: 0;
      top: 0;
      color: oklch(55% 0.12 148);
      font-weight: 800;
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
      .telegram-block { background: oklch(22% 0.035 148); border-color: oklch(34% 0.07 148); color: oklch(82% 0.05 148); }
      .telegram-block h3 { color: oklch(92% 0.08 148); }
      .telegram-block .telegram-kicker { color: oklch(78% 0.12 148); }
      .telegram-block li { background: oklch(18% 0.02 148); border-color: oklch(34% 0.05 148); color: oklch(84% 0.05 148); }
      .role-summary { background: oklch(24% 0.04 148); border-color: oklch(34% 0.06 148); color: oklch(82% 0.06 148); }
      .role-summary strong { color: oklch(92% 0.08 148); }
      .caps { background: oklch(24% 0.008 95); border-color: oklch(30% 0.008 95); }
      .caps h3 { color: oklch(65% 0.01 95); }
      .caps li { color: oklch(82% 0.005 95); }
      .rule { border-top-color: oklch(28% 0.008 95); }
      .signoff { color: oklch(84% 0.005 95); }
      .signoff strong { color: oklch(94% 0.005 95); }
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
        <span class="logo-shell"><img src="${escapeHtml(EMAIL_LOGO_URL)}" width="44" height="44" alt="Caja Chica" /></span>
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

// Checklist block (design B) — capabilities rendered as a ✓ list.
function capsBlock(title: string, items: string[]): string {
  const lis = items.map((i) => `<li>${escapeHtml(i)}</li>`).join("");
  return `<div class="caps"><h3>${escapeHtml(title)}</h3><ul>${lis}</ul></div>`;
}

function roleSummary(label: string, copy: string): string {
  return `<p class="role-summary"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(copy)}</p>`;
}

function telegramBlock(deepLink?: string): string {
  const link = deepLink
    ? `<br><a class="link" href="${escapeHtml(deepLink)}">Conectar Telegram después del primer login →</a>`
    : "";

  return `<div class="telegram-block">
    <p class="telegram-kicker">Diferencial Caja Chica</p>
    <h3>También podés usarlo desde Telegram</h3>
    <p>Registrá gastos sin abrir la app: escribí, mandá una foto del ticket o usá audio. Caja Chica lo interpreta y lo guarda en el dashboard compartido.</p>
    <ul>
      <li>“pagué 4500 de luz”</li>
      <li>foto de un ticket</li>
      <li>nota de voz rápida</li>
    </ul>
    ${link}
  </div>`;
}

// Brand signoff (decision 2026-05: personal body voice + brand closing).
const BRAND_SIGNOFF = `
    <p class="signoff">Cualquier duda, respondé este email.</p>
    <p class="signoff"><strong>El equipo de Caja Chica</strong></p>`;

export function appInvitationHtml(inviteUrl: string, inviterName?: string): string {
  const safeUrl = escapeHtml(inviteUrl);
  const safeName = inviterName?.trim() ? escapeHtml(inviterName.trim()) : null;
  // Owner flavor: this invite gives the person their own dashboard (they become owner).
  // Body voice is personal (dynamic inviter — no hardcoded name); signoff is brand voice.
  const fromLine = safeName
    ? `<p class="from"><strong>${safeName}</strong> · Caja Chica</p>`
    : `<p class="from"><strong>Caja Chica</strong></p>`;
  const title = safeName
    ? `${safeName} te dio tu propio dashboard.`
    : `Tu dashboard en Caja Chica está listo.`;

  const ownerSummary = roleSummary(
    "Dueño",
    "administrás el dashboard, cargás movimientos, exportás informes e invitás a otras personas.",
  );

  const caps = capsBlock("Como dueño vas a poder", [
    "Cargar, editar y borrar movimientos",
    "Crear empresas y categorías",
    "Generar y exportar informes",
    "Usar Telegram para cargar por texto, foto o voz",
    "Invitar gente como editor o viewer",
  ]);

  const team = `<div class="note"><strong>Cuando sumes gente, elegís el acceso:</strong><br>` +
    `• <strong>Puede editar</strong>: carga movimientos y ayuda a ordenar empresas/categorías.<br>` +
    `• <strong>Puede ver</strong>: mira saldos, movimientos e informes. No modifica datos.</div>`;

  const body = `
    ${fromLine}
    <h1 class="title">${title}</h1>
    <p class="lede">Caja Chica es una app para registrar gastos e ingresos escribiendo como hablás. Tipo: <em>"pagué 4500 de luz"</em>.</p>

    ${ownerSummary}
    ${caps}
    ${telegramBlock()}

    <div class="cta">
      <a href="${safeUrl}">Entrar con Google</a>
    </div>

    <p class="fine">Usá la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.</p>

    ${team}
    ${BRAND_SIGNOFF}
  `;
  return baseTemplate(
    "Te invitaron a Caja Chica",
    "Entrá con Google y empezá a registrar movimientos escribiendo como hablás.",
    body,
  );
}

export function dashboardInvitationHtml(
  inviteUrl: string,
  role: string,
  inviterEmail: string,
  telegramDeepLink?: string,
  inviterDisplayName?: string | null,
): string {
  const safeUrl = escapeHtml(inviteUrl);
  const safeInviter = escapeHtml(inviterEmail);
  const inviterName = inviterDisplayName?.trim() || inviterEmail.split("@")[0] || "Alguien";
  const safeInviterName = escapeHtml(inviterName);
  const isEditor = role === "editor";
  const roleBadge = isEditor ? "Puede editar" : "Puede ver";

  const summary = isEditor
    ? roleSummary("Puede editar", "podés cargar movimientos y ver saldos e informes. No cambiás accesos salvo que el dueño te dé permisos extra.")
    : roleSummary("Puede ver", "tenés acceso de solo lectura para consultar movimientos, saldos e informes. No modificás datos.");

  // Design B: capabilities as a ✓ checklist, tailored to the role.
  const caps = isEditor
    ? capsBlock("Tu acceso incluye", [
        "Ver movimientos y saldos en tiempo real",
        "Cargar movimientos por texto, foto o voz",
        "Crear empresas y categorías",
      ])
    : capsBlock("Tu acceso incluye", [
        "Ver movimientos del dashboard",
        "Consultar saldos por empresa",
        "Ver y descargar informes",
      ]);

  // Body voice personal (dynamic inviter from email); signoff brand voice.
  const body = `
    <p class="from"><strong>${safeInviterName}</strong> · vía Caja Chica</p>
    <h1 class="title">${safeInviterName} te sumó al dashboard.</h1>
    <p class="lede">Compartimos los mismos movimientos. Entrás con acceso <span class="badge">${roleBadge}</span>.</p>

    ${summary}
    ${caps}
    ${telegramBlock(telegramDeepLink)}

    <div class="cta">
      <a href="${safeUrl}">Entrar con Google</a>
    </div>

    <p class="fine">Usá la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.</p>

    ${BRAND_SIGNOFF}
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
  inviterName?: string,
): Promise<void> {
  await sendViaBrevo(to, "Te invitaron a Caja Chica", appInvitationHtml(inviteUrl, inviterName), {
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
  inviterDisplayName?: string | null,
): Promise<void> {
  const inviterName = inviterDisplayName?.trim() || inviterEmail.split("@")[0] || inviterEmail;
  await sendViaBrevo(
    to,
    `${inviterName} te invitó a su dashboard en Caja Chica`,
    dashboardInvitationHtml(inviteUrl, role, inviterEmail, telegramDeepLink, inviterDisplayName),
    { emailType: emailType ?? "dashboard_invite" },
  );
}
