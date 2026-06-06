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

// ---------------------------------------------------------------------------
// Visual layer (Stripo-derived): Imprima font, table-based layout, VML button
// for Outlook, mobile-responsive media queries, sectioned rounded cards.
// Only the *look* comes from Stripo — all dynamic logic stays ours.
// ---------------------------------------------------------------------------

const EMAIL_FONT = "Imprima, Arial, sans-serif";
const TEXT_COLOR = "#2D3142";
const CARD_BG = "#EFEFEF";
const BLOCK_BG = "#fafafa";
const BTN_BG = "#0b5394";

// Body paragraph with the Imprima base style.
// `cls` drives the dark-mode override: "cc-text" (default) or "cc-muted".
function p(html: string, opts?: { size?: number; lh?: number; extra?: string; cls?: string }): string {
  const size = opts?.size ?? 18;
  const lh = opts?.lh ?? 27;
  const extra = opts?.extra ?? "";
  const cls = opts?.cls ?? "cc-text";
  return `<p class="${cls}" style="Margin:0;mso-line-height-rule:exactly;font-family:${EMAIL_FONT};line-height:${lh}px;letter-spacing:0;font-weight:normal;color:${TEXT_COLOR};font-size:${size}px;${extra}">${html}</p>`;
}

function spacer(): string {
  return p("<br>");
}

// A rounded #fafafa section block — gives the "separación de secciones" look.
function block(inner: string): string {
  return `<table cellpadding="0" cellspacing="0" width="100%" bgcolor="${BLOCK_BG}" class="cc-block" role="presentation" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;border-collapse:separate;background-color:${BLOCK_BG};border-radius:10px;margin:0 0 16px">
    <tr><td align="left" class="es-m-text" style="padding:15px;Margin:0">${inner}</td></tr>
  </table><table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="border-spacing:0px"><tr><td style="padding:0;Margin:0;height:16px;line-height:16px;font-size:0">&nbsp;</td></tr></table>`;
}

// Outlook-safe CTA button (VML for mso, anchor for everyone else).
function ctaButton(url: string, label: string): string {
  const u = escapeHtml(url);
  return `<table cellpadding="0" cellspacing="0" width="100%" role="presentation" style="border-spacing:0px"><tr><td align="center" style="padding:8px 0 24px;Margin:0">
<!--[if mso]><a href="${u}" target="_blank" hidden>
  <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${u}" style="height:48px;v-text-anchor:middle;width:293px" arcsize="50%" stroke="f" fillcolor="${BTN_BG}">
    <w:anchorlock></w:anchorlock>
    <center style="color:#ffffff;font-family:${EMAIL_FONT};font-size:18px;font-weight:700;mso-text-raise:1px">${escapeHtml(label)}</center>
  </v:roundrect></a>
<![endif]--><!--[if !mso]><!-- --><span class="cc-btn-border" style="border-style:solid;border-color:${BTN_BG};background:${BTN_BG};border-width:0;display:inline-block;border-radius:30px;width:auto;text-align:center;mso-border-alt:10px"><a href="${u}" target="_blank" class="es-button cc-btn" style="mso-style-priority:100 !important;text-decoration:none !important;mso-line-height-rule:exactly;color:#FFFFFF;font-size:22px;font-weight:bold;padding:15px 40px;display:inline-block;background:${BTN_BG};border-radius:30px;font-family:${EMAIL_FONT};font-style:normal;line-height:26px;width:auto;text-align:center;letter-spacing:0"><span style="display:inline-block;background:#FFFFFF;border-radius:4px;padding:3px;margin-right:10px;vertical-align:middle;line-height:0"><img src="https://developers.google.com/identity/images/g-logo.png" alt="" width="18" height="18" style="display:block;border:0" /></span><span style="vertical-align:middle">${escapeHtml(label)}</span></a></span><!--<![endif]-->
</td></tr></table>`;
}

function baseTemplate(title: string, preheader: string, body: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html dir="ltr" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" lang="es">
<head>
  <meta charset="UTF-8" />
  <meta content="width=device-width, initial-scale=1" name="viewport" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta content="telephone=no" name="format-detection" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>${escapeHtml(title)}</title>
  <!--[if (mso 16)]><style type="text/css">a {text-decoration: none;}</style><![endif]-->
  <!--[if gte mso 9]><style>sup { font-size: 100% !important; }</style><![endif]-->
  <!--[if gte mso 9]>
  <noscript><xml><o:OfficeDocumentSettings><o:AllowPNG></o:AllowPNG><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
  <![endif]-->
  <!--[if !mso]><!-- -->
  <link href="https://fonts.googleapis.com/css2?family=Imprima&display=swap" rel="stylesheet" />
  <!--<![endif]-->
  <!--[if mso]><xml><w:WordDocument xmlns:w="urn:schemas-microsoft-com:office:word"><w:DontUseAdvancedTypographyReadingMail/></w:WordDocument></xml><![endif]-->
  <style type="text/css">
    #outlook a { padding: 0; }
    a.es-button { mso-style-priority: 100 !important; text-decoration: none !important; }
    a[x-apple-data-detectors], #MessageViewBody a {
      color: inherit !important; text-decoration: none !important; font-size: inherit !important;
      font-family: inherit !important; font-weight: inherit !important; line-height: inherit !important;
    }
    .preheader {
      display: none !important; visibility: hidden; opacity: 0; color: transparent;
      height: 0; width: 0; max-height: 0; max-width: 0; overflow: hidden; mso-hide: all;
      font-size: 1px; line-height: 1px;
    }
    @media only screen and (max-width: 600px) {
      p, a { line-height: 150% !important; }
      h1, h1 a { line-height: 120% !important; }
      h3, h3 a { line-height: 120% !important; }
      h1 { font-size: 30px !important; text-align: left; }
      h3 { font-size: 20px !important; text-align: left; }
      .es-content-body p, .es-content-body a { font-size: 16px !important; }
      a.es-button, button.es-button { display: block !important; font-size: 18px !important; padding: 14px 20px !important; line-height: 120% !important; }
      .es-content table, .es-footer table, .es-content, .es-footer { width: 100% !important; max-width: 600px !important; }
      .adapt-img { width: 100% !important; height: auto !important; }
    }
    @media (prefers-color-scheme: dark) {
      body, .es-wrapper-color { background-color: #1c1c1e !important; }
      .cc-card { background-color: #26262a !important; }
      .cc-block { background-color: #2f2f34 !important; }
      .cc-text, .cc-title, .cc-h3 { color: #ECECEC !important; }
      .cc-muted { color: #A9A7A0 !important; }
      .cc-footer-card { background-color: #1c1c1e !important; }
    }
  </style>
</head>
<body class="body" style="width:100%;height:100%;font-family:${EMAIL_FONT};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;padding:0;Margin:0;background-color:#FFFFFF">
  <div class="preheader" style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;">${escapeHtml(preheader)}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <div dir="ltr" class="es-wrapper-color" lang="es" style="background-color:#FFFFFF">
    <!--[if gte mso 9]><v:background xmlns:v="urn:schemas-microsoft-com:vml" fill="t"><v:fill type="tile" color="#ffffff"></v:fill></v:background><![endif]-->
    <table width="100%" cellspacing="0" cellpadding="0" class="es-wrapper" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;padding:0;Margin:0;width:100%;height:100%;background-repeat:repeat;background-position:center top">
      <tr><td valign="top" style="padding:0;Margin:0">

        <!-- Logo strip -->
        <table cellpadding="0" cellspacing="0" align="center" class="es-content" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;width:100%;table-layout:fixed !important">
          <tr><td align="center" style="padding:0;Margin:0">
            <table align="center" cellpadding="0" cellspacing="0" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;width:600px" role="none">
              <tr><td align="left" style="padding:24px 40px 16px;Margin:0;font-size:0px">
                <a target="_blank" href="${escapeHtml(PUBLIC_APP_URL)}" style="mso-line-height-rule:exactly;text-decoration:none">
                  <img src="${escapeHtml(EMAIL_LOGO_URL)}" alt="Caja Chica" width="100" title="Caja Chica" class="adapt-img" style="display:block;border:0;outline:none;text-decoration:none;margin:0" />
                </a>
              </td></tr>
            </table>
          </td></tr>
        </table>

        <!-- Main card -->
        <table cellpadding="0" cellspacing="0" align="center" class="es-content" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;width:100%;table-layout:fixed !important">
          <tr><td align="center" style="padding:0;Margin:0">
            <table bgcolor="${CARD_BG}" align="center" cellpadding="0" cellspacing="0" class="es-content-body cc-card" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;background-color:${CARD_BG};border-radius:20px;width:600px">
              <tr><td align="left" style="padding:30px 40px 40px;Margin:0">
                ${body}
              </td></tr>
            </table>
          </td></tr>
        </table>

        <!-- Footer -->
        <table cellpadding="0" cellspacing="0" align="center" class="es-footer" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;width:100%;table-layout:fixed !important;background-color:transparent">
          <tr><td align="center" style="padding:0;Margin:0">
            <table bgcolor="#ffffff" align="center" cellpadding="0" cellspacing="0" class="es-footer-body cc-footer-card" role="none" style="mso-table-lspace:0pt;mso-table-rspace:0pt;border-spacing:0px;background-color:#FFFFFF;width:600px">
              <tr><td align="left" style="padding:20px 40px;Margin:0">
                ${p("Recibís este mail porque alguien usó tu dirección para invitarte a Caja Chica. Si no esperabas la invitación, ignoralo.", { size: 14, lh: 22, extra: "color:#8A8880", cls: "cc-muted" })}
              </td></tr>
            </table>
          </td></tr>
        </table>

      </td></tr>
    </table>
  </div>
</body>
</html>`;
}

// Checklist block — capabilities rendered as a bulleted list inside a section.
function capsBlock(title: string, items: string[]): string {
  const lis = items
    .map(
      (i) =>
        `<li class="cc-text" style="color:#2D3142;margin:0 0 12px;font-size:18px"><p style="Margin:0;mso-line-height-rule:exactly;font-family:${EMAIL_FONT};line-height:27px;letter-spacing:0;font-weight:normal;color:#2D3142;font-size:18px" class="cc-text">${escapeHtml(i)}</p></li>`,
    )
    .join("");
  const heading = `<h3 class="cc-h3" style="Margin:0 0 6px;font-family:${EMAIL_FONT};mso-line-height-rule:exactly;letter-spacing:0;font-size:24px;font-style:normal;font-weight:bold;line-height:29px;color:${TEXT_COLOR}">${escapeHtml(title)}</h3>`;
  const list = `<ul style="font-family:${EMAIL_FONT};padding:0 0 0 24px;margin:12px 0 0">${lis}</ul>`;
  return block(`${heading}${list}`);
}

function roleSummary(label: string, copy: string): string {
  return p(`<strong style="font-weight:bolder !important">${escapeHtml(label)}:</strong> ${escapeHtml(copy)}`);
}

// readOnly=true tailors the Telegram block to a viewer: only consulting, no loading.
function telegramBlock(deepLink?: string, readOnly = false): string {
  const link = deepLink
    ? p(
        `<a href="${escapeHtml(deepLink)}" style="color:${BTN_BG};text-decoration:underline;font-weight:bold">Conectar Telegram después del primer login →</a>`,
        { extra: "margin-top:12px" },
      )
    : "";
  const kicker = p(
    `<strong style="font-weight:bolder !important;text-transform:uppercase;letter-spacing:0.06em">Diferencial Caja Chica</strong>`,
    { size: 13, lh: 18, extra: "color:#7630a8" },
  );
  const headingText = readOnly
    ? "También podés consultarlo desde Telegram"
    : "También podés usarlo desde Telegram";
  const heading = `<h3 class="cc-h3" style="Margin:0 0 6px;font-family:${EMAIL_FONT};mso-line-height-rule:exactly;letter-spacing:0;font-size:24px;font-style:normal;font-weight:bold;line-height:29px;color:${TEXT_COLOR}">${headingText}</h3>`;
  const intro = readOnly
    ? p(
        "Consultá saldos, movimientos e informes sin abrir la app. Preguntale al bot y te responde al toque.",
      )
    : p(
        "Registrá gastos sin abrir la app: escribí, mandá una foto del ticket o usá audio. Caja Chica lo interpreta y lo guarda en el dashboard compartido.",
      );
  const items = readOnly
    ? ["saldos al día", "buscar un movimiento", "pedir un informe"]
    : ["“pagué 4500 de luz”", "foto de un ticket", "nota de voz rápida"];
  const lis = items
    .map(
      (it, idx) =>
        `<li class="cc-text" style="color:#2D3142;margin:${idx === items.length - 1 ? "0" : "0 0 8px"};font-size:18px">${p(it)}</li>`,
    )
    .join("");
  const examples = `<ul style="font-family:${EMAIL_FONT};padding:0 0 0 24px;margin:10px 0 0">${lis}</ul>`;
  return block(`${kicker}${heading}${intro}${examples}${link}`);
}

// Small uppercase label above the title (replaces the old `.from` pill).
function eyebrow(text: string): string {
  return p(
    `<strong style="font-weight:bolder !important;text-transform:uppercase;letter-spacing:0.08em">${text}</strong>`,
    { size: 13, lh: 18, extra: "color:#7a7870;margin:0 0 4px" },
  );
}

// Rounded role pill (e.g. "Puede editar", "Puede invitar").
function badge(text: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#d9e6f4;color:${BTN_BG};font-size:15px;font-weight:bold">${escapeHtml(text)}</span>`;
}

// A row of pills with spacing between them.
function pillRow(labels: string[]): string {
  const pills = labels
    .map((l) => `<span style="display:inline-block;margin:0 8px 8px 0">${badge(l)}</span>`)
    .join("");
  return `<div style="margin:2px 0 0">${pills}</div>`;
}

// Hero section: eyebrow + big title + optional pills + lede, in a #fafafa block.
function heroBlock(eyebrowHtml: string, title: string, ledeHtml: string, pillsHtml = ""): string {
  const h1 = `<h1 class="cc-title" style="Margin:0 0 6px;font-family:${EMAIL_FONT};mso-line-height-rule:exactly;letter-spacing:0;font-size:36px;font-style:normal;font-weight:bold;line-height:43px;color:${TEXT_COLOR}">${escapeHtml(title)}</h1>`;
  return block(`${eyebrowHtml}${h1}${pillsHtml}${spacer()}${p(ledeHtml)}`);
}

// Brand signoff (decision 2026-05: personal body voice + brand closing).
const BRAND_SIGNOFF = `
    ${p("Cualquier duda, respondé este email.")}
    ${p('<strong style="font-weight:bolder !important">El equipo de Caja Chica</strong>')}`;

export function appInvitationHtml(inviteUrl: string, inviterName?: string): string {
  const safeName = inviterName?.trim() ? escapeHtml(inviterName.trim()) : null;
  // Owner flavor: this invite gives the person their own dashboard (they become owner).
  // Body voice is personal (dynamic inviter — no hardcoded name); signoff is brand voice.
  const fromLine = safeName
    ? eyebrow(`Invitación de ${safeName}`)
    : eyebrow("Invitación");
  const title = `Tu dashboard está listo.`;

  const ownerSummary = roleSummary(
    "Dueño",
    "administrás el dashboard, cargás movimientos, exportás informes e invitás a otras personas.",
  );

  const caps = capsBlock("Como dueño vas a poder", [
    "Cargar, editar y borrar movimientos",
    "Crear empresas y categorías",
    "Generar y exportar informes",
    "Usar Telegram para cargar por texto, foto o voz",
    "Invitar gente con acceso Puede editar o Puede ver",
  ]);

  const team = block(
    p('<strong style="font-weight:bolder !important">Cuando sumes gente, elegís el acceso:</strong>') +
      p(
        '• <strong style="font-weight:bolder !important">Puede editar</strong>: carga movimientos y ayuda a ordenar empresas/categorías.<br>' +
          '• <strong style="font-weight:bolder !important">Puede ver</strong>: mira saldos, movimientos e informes. No modifica datos.',
      ),
  );

  const body = `
    ${heroBlock(fromLine, title, 'Caja Chica es una app para registrar gastos e ingresos escribiendo como hablás. Tipo: <em>"pagué 4500 de luz"</em>.', pillRow(["Puede editar", "Puede invitar"]))}
    ${ownerSummary}
    ${spacer()}
    ${caps}
    ${telegramBlock()}
    ${ctaButton(inviteUrl, "Entrar con Google")}
    ${p("Usá la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.", { size: 14, lh: 22, extra: "color:#6f6a62", cls: "cc-muted" })}
    ${spacer()}
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
    ${heroBlock(eyebrow(`Invitación de ${safeInviterName}`), "Te sumaron al dashboard.", `Compartimos los mismos movimientos. Entrás con acceso ${badge(roleBadge)}`)}
    ${summary}
    ${spacer()}
    ${caps}
    ${telegramBlock(telegramDeepLink, !isEditor)}
    ${ctaButton(inviteUrl, "Entrar con Google")}
    ${p("Usá la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.", { size: 14, lh: 22, extra: "color:#6f6a62", cls: "cc-muted" })}
    ${spacer()}
    ${BRAND_SIGNOFF}
    ${p(`Te escribe ${safeInviter}. Caja Chica solo le presta el sobre.`, { size: 13, lh: 20, extra: "color:#8A8880;font-style:italic;margin-top:16px", cls: "cc-muted" })}
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
