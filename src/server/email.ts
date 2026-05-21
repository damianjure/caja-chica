// Email delivery via Brevo (formerly Sendinblue) transactional API.
// Endpoint: POST https://api.brevo.com/v3/smtp/email
// Auth: header `api-key`
// Docs: https://developers.brevo.com/reference/sendtransacemail

const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

const FROM_EMAIL = process.env.FROM_EMAIL ?? "hola@damianjure.com";
const FROM_NAME = process.env.FROM_NAME ?? "Caja Chica";

function getApiKey(): string | null {
  return process.env.BREVO_API_KEY ?? null;
}

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
      h2.title { font-size: 22px; }
      p.lede { font-size: 15px; }
      .cta a { display: block; text-align: center; }
    }
    @media (prefers-color-scheme: dark) {
      body { background: oklch(16% 0.008 95); color: oklch(92% 0.005 95); }
      .card { background: oklch(20% 0.008 95); border-color: oklch(26% 0.008 95); }
      .wordmark { color: oklch(94% 0.005 95); }
      h2.title { color: oklch(96% 0.005 95); }
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
  const body = `
    <p class="eyebrow">Tu invitación</p>
    <h2 class="title">Bienvenida a Caja Chica</h2>
    <p class="lede">Registrá gastos e ingresos escribiendo como hablás. Sin formularios, sin planillas. La app entiende el contexto y te muestra el resumen al instante.</p>

    <div class="cta">
      <a href="${safeUrl}">Activar mi cuenta</a>
      <span class="hint">El enlace abre la app y completa el alta automáticamente.</span>
    </div>

    <div class="note">
      Importante: ingresá con la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.
    </div>

    <div class="section">
      <h3>Primeros pasos</h3>
      <ol class="steps">
        <li>Tocá el botón de arriba para activar tu cuenta.</li>
        <li>Elegí <strong>Entrar con Google</strong> y seleccioná esta dirección.</li>
        <li>Ya estás dentro. Probá escribir <em>"pagué 4500 de luz"</em> y mirá cómo lo registra.</li>
      </ol>
    </div>

    <hr class="rule" />

    <div class="section">
      <h3>Sumá Telegram (opcional)</h3>
      <ol class="steps">
        <li>El administrador del dashboard te genera un enlace desde <strong>Colaboración &rsaquo; Vincular Telegram</strong>.</li>
        <li>Abrí ese enlace en la app de Telegram.</li>
        <li>Cuando se confirme, usá <strong>/menu</strong> para registrar movimientos por chat.</li>
      </ol>
    </div>

    <hr class="rule" />

    <div class="section">
      <h3>Invitar gente a tu dashboard</h3>
      <ol class="steps">
        <li>Andá a <strong>Configuración &rsaquo; Colaboración</strong>.</li>
        <li>Ingresá el mail y elegí rol: <strong>Editor</strong> (carga y ve) o <strong>Viewer</strong> (solo ve).</li>
        <li>Compartí el enlace que genera el sistema.</li>
      </ol>
    </div>

    <p class="signoff">Si algo no anda, respondé este mail. Leo todas las respuestas.</p>
    <p class="signoff"><strong>Damián</strong>, creador de Caja Chica.</p>
  `;
  return baseTemplate(
    "Bienvenida a Caja Chica",
    "Activá tu cuenta y empezá a registrar movimientos en lenguaje natural.",
    body,
  );
}

export function dashboardInvitationHtml(inviteUrl: string, role: string, inviterEmail: string, telegramDeepLink?: string): string {
  const safeUrl = escapeHtml(inviteUrl);
  const safeInviter = escapeHtml(inviterEmail);
  const isEditor = role === "editor";
  const roleBadge = isEditor ? "Editor" : "Viewer";
  const rolePerk = isEditor
    ? "podés cargar movimientos y verlos en tiempo real."
    : "podés ver todos los movimientos del dashboard.";
  const body = `
    <p class="eyebrow">Invitación a dashboard</p>
    <h2 class="title">Sumate al dashboard de ${safeInviter}</h2>
    <p class="lede"><strong>${safeInviter}</strong> te invitó a colaborar en Caja Chica como <span class="badge">${roleBadge}</span>. Compartís los mismos datos: ${rolePerk}</p>

    <div class="cta">
      <a href="${safeUrl}">Unirme al dashboard</a>
      <span class="hint">Tocá el botón y entrá con Google.</span>
    </div>

    <div class="note">
      Importante: ingresá con la cuenta de Google asociada a este mail. Otra cuenta no va a poder acceder.
    </div>

    <div class="section">
      <h3>Primeros pasos</h3>
      <ol class="steps">
        <li>Tocá el botón de arriba para aceptar la invitación.</li>
        <li>Elegí <strong>Entrar con Google</strong> y seleccioná esta dirección.</li>
        <li>Listo. Ya ves el dashboard compartido.</li>
      </ol>
    </div>

    <hr class="rule" />

    ${telegramDeepLink ? `
    <hr class="rule" />

    <div class="section">
      <h3>Vincular Telegram</h3>
      <p class="body">Tu invitación incluye acceso directo al bot de Telegram. Podés vincular tu cuenta ahora.</p>
      <div class="cta">
        <a href="${escapeHtml(telegramDeepLink)}">Vincular mi Telegram</a>
        <span class="hint">Primero activá tu cuenta en la app, luego usá este enlace.</span>
      </div>
    </div>
    ` : `
    <div class="section">
      <h3>Telegram (opcional)</h3>
      <ol class="steps">
        <li>${safeInviter} te genera un enlace desde <strong>Colaboración &rsaquo; Vincular Telegram</strong>.</li>
        <li>Abrí ese enlace en la app de Telegram.</li>
        <li>Cuando se confirme, usá <strong>/menu</strong> para empezar.</li>
      </ol>
    </div>
    `}

    <p class="signoff">Cualquier duda, respondé este mail.</p>
  `;
  return baseTemplate(
    "Te invitaron a un dashboard en Caja Chica",
    `${inviterEmail} te invitó a colaborar en su dashboard de Caja Chica.`,
    body,
  );
}

function sanitizeHeader(value: string): string {
  // Strip CR/LF to prevent header injection if upstream value ever contains them.
  return value.replace(/[\r\n]+/g, " ").trim();
}

async function sendViaBrevo(to: string, subject: string, htmlContent: string): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[email] BREVO_API_KEY not set — skipping email to", to);
    return;
  }

  const payload = {
    sender: { name: sanitizeHeader(FROM_NAME), email: sanitizeHeader(FROM_EMAIL) },
    to: [{ email: sanitizeHeader(to) }],
    subject: sanitizeHeader(subject),
    htmlContent,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

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
      return;
    }

    console.log("[email] Sent to", to, "subject:", subject);
  } catch (err) {
    console.error("[email] Brevo request error", { to, err });
  } finally {
    clearTimeout(timeout);
  }
}

export async function sendAppInvitationEmail(to: string, inviteUrl: string): Promise<void> {
  await sendViaBrevo(to, "Te invitaron a Caja Chica", appInvitationHtml(inviteUrl));
}

export async function sendDashboardInvitationEmail(
  to: string,
  inviteUrl: string,
  role: string,
  inviterEmail: string,
  telegramDeepLink?: string,
): Promise<void> {
  await sendViaBrevo(
    to,
    `${inviterEmail} te invitó a su dashboard en Caja Chica`,
    dashboardInvitationHtml(inviteUrl, role, inviterEmail, telegramDeepLink),
  );
}
