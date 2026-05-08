import { Resend } from "resend";

let _client: Resend | null = null;

function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

const FROM = process.env.FROM_EMAIL ?? "Boteado <onboarding@resend.dev>";

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function baseTemplate(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .wrapper { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .header { background: #18181b; padding: 32px 40px; }
    .header h1 { margin: 0; font-size: 22px; color: #ffffff; letter-spacing: -0.3px; }
    .header p { margin: 6px 0 0; font-size: 14px; color: #a1a1aa; }
    .body { padding: 36px 40px; color: #27272a; }
    .body p { font-size: 15px; line-height: 1.6; margin: 0 0 16px; }
    .cta { display: block; margin: 28px 0; text-align: center; }
    .cta a { background: #18181b; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; display: inline-block; }
    .steps { background: #f9f9fa; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px 24px; margin: 20px 0; }
    .steps h3 { margin: 0 0 12px; font-size: 14px; text-transform: uppercase; letter-spacing: .05em; color: #71717a; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { font-size: 14px; line-height: 1.6; color: #3f3f46; margin-bottom: 8px; }
    .steps li:last-child { margin-bottom: 0; }
    .note { background: #fefce8; border: 1px solid #fde047; border-radius: 6px; padding: 12px 16px; font-size: 13px; color: #713f12; margin: 16px 0; }
    .divider { border: none; border-top: 1px solid #e4e4e7; margin: 28px 0; }
    .footer { padding: 20px 40px 32px; }
    .footer p { margin: 0; font-size: 13px; color: #71717a; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Boteado</h1>
      <p>Tu gestor de movimientos financieros</p>
    </div>
    <div class="body">
      ${body}
    </div>
    <div class="footer">
      <p>Si no esperabas este mail, podés ignorarlo con confianza. Fue enviado porque alguien usó tu dirección para invitarte a Boteado.</p>
    </div>
  </div>
</body>
</html>`;
}

function appInvitationHtml(inviteUrl: string): string {
  const safeUrl = escapeHtml(inviteUrl);
  const body = `
    <p>¡Hola! Te damos la bienvenida a <strong>Boteado</strong>, la app para registrar y consultar tus movimientos financieros en lenguaje natural.</p>

    <div class="cta"><a href="${safeUrl}">Activar mi cuenta →</a></div>

    <div class="note">
      ⚠️ <strong>Importante:</strong> usá exactamente la cuenta de Google asociada a este mail. Si entrás con otra cuenta, no vas a poder acceder.
    </div>

    <div class="steps">
      <h3>Primeros pasos</h3>
      <ol>
        <li>Hacé clic en el botón de arriba para activar tu cuenta.</li>
        <li>En la app, elegí <strong>"Entrar con Google"</strong> y seleccioná esta cuenta.</li>
        <li>Ya estás dentro: podés empezar a registrar gastos e ingresos en lenguaje natural, ver resúmenes, filtrar movimientos y exportar informes.</li>
      </ol>
    </div>

    <hr class="divider" />

    <div class="steps">
      <h3>Conectar el bot de Telegram (opcional, muy útil)</h3>
      <ol>
        <li>El administrador de tu dashboard te va a generar un enlace de invitación desde el panel <strong>Colaboración → Vincular Telegram</strong>.</li>
        <li>Cuando te mande ese enlace, ábrilo directamente en Telegram.</li>
        <li>El bot va a pedirle confirmación al administrador. Una vez que la apruebe, ya podés usar <strong>/menu</strong> para ver todas las opciones.</li>
      </ol>
    </div>

    <hr class="divider" />

    <div class="steps">
      <h3>¿Querés invitar a alguien a tu dashboard?</h3>
      <ol>
        <li>Andá a <strong>Configuración → Colaboración</strong> dentro de la app.</li>
        <li>Ingresá el mail de la persona y elegí el rol: <strong>Editor</strong> (puede cargar y ver datos) o <strong>Viewer</strong> (solo puede ver).</li>
        <li>Copiá el enlace que genera el sistema y mandáselo por el medio que prefieras.</li>
      </ol>
    </div>

    <p>Cualquier duda, respondé este mail.</p>
    <p>Gracias por usar Boteado. 🙌</p>
  `;
  return baseTemplate("Bienvenida a Boteado", body);
}

function dashboardInvitationHtml(inviteUrl: string, role: string, inviterEmail: string): string {
  const safeUrl = escapeHtml(inviteUrl);
  const safeInviter = escapeHtml(inviterEmail);
  const roleLabel = role === "editor" ? "Editor (puede cargar y ver datos)" : "Viewer (solo puede ver)";
  const body = `
    <p>¡Hola! <strong>${safeInviter}</strong> te invitó a colaborar en su dashboard de <strong>Boteado</strong> como <em>${roleLabel}</em>.</p>
    <p>Van a compartir los mismos datos: podés ver (y cargar, si sos editor) los movimientos financieros del dashboard.</p>

    <div class="cta"><a href="${safeUrl}">Unirme al dashboard →</a></div>

    <div class="note">
      ⚠️ <strong>Importante:</strong> usá exactamente la cuenta de Google asociada a este mail. Si entrás con otra cuenta, no vas a poder acceder.
    </div>

    <div class="steps">
      <h3>Primeros pasos</h3>
      <ol>
        <li>Hacé clic en el botón de arriba para aceptar la invitación.</li>
        <li>En la app, elegí <strong>"Entrar con Google"</strong> y seleccioná esta cuenta.</li>
        <li>Ya estás dentro del dashboard compartido.</li>
      </ol>
    </div>

    <hr class="divider" />

    <div class="steps">
      <h3>Conectar el bot de Telegram (opcional)</h3>
      <ol>
        <li>${safeInviter} puede generarte un enlace de invitación desde <strong>Colaboración → Vincular Telegram</strong>.</li>
        <li>Abrí ese enlace en Telegram y esperá la confirmación.</li>
        <li>Una vez confirmado, usá <strong>/menu</strong> para ver las opciones disponibles.</li>
      </ol>
    </div>

    <p>Gracias por usar Boteado. 🙌</p>
  `;
  return baseTemplate("Te invitaron a un dashboard en Boteado", body);
}

export async function sendAppInvitationEmail(to: string, inviteUrl: string): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping invitation email to", to);
    return;
  }
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: "Te invitaron a Boteado",
    html: appInvitationHtml(inviteUrl),
  });
  if (error) console.error("[email] Failed to send app invitation to", to, error);
  else console.log("[email] App invitation sent to", to);
}

export async function sendDashboardInvitationEmail(
  to: string,
  inviteUrl: string,
  role: string,
  inviterEmail: string,
): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[email] RESEND_API_KEY not set — skipping dashboard invitation email to", to);
    return;
  }
  const { error } = await client.emails.send({
    from: FROM,
    to,
    subject: `${inviterEmail} te invitó a su dashboard en Boteado`, // subject is plain text, no escape needed
    html: dashboardInvitationHtml(inviteUrl, role, inviterEmail),
  });
  if (error) console.error("[email] Failed to send dashboard invitation to", to, error);
  else console.log("[email] Dashboard invitation sent to", to);
}
