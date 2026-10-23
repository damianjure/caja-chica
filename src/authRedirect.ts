export function buildGoogleAuthRedirect(url: URL) {
  return `${url.origin}${url.pathname}${url.search}`;
}

export function getInviteTokenFromUrl(url: URL) {
  const token = url.searchParams.get("invite")?.trim() || url.searchParams.get("token")?.trim() || "";
  return token || null;
}

const LOGIN_ERROR_PARAMS = ["error", "error_code", "error_description"] as const;

// Messages returned by the `before_user_created` auth hook
// (public.hook_authorize_google_invited_users). They are already written for the
// end user, so they are shown as-is; anything else gets a generic message.
const HOOK_MESSAGES = new Set([
  "Tu email no está autorizado. Pedile una invitación al administrador.",
  "Solo se permite acceso con Google.",
  "No se recibió un email válido.",
]);

const GENERIC_LOGIN_ERROR = "No se pudo iniciar sesión. Probá de nuevo en unos minutos.";

function hashParams(url: URL) {
  return new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
}

/**
 * Supabase redirects back with `error` / `error_code` / `error_description`
 * when sign-in fails (in the hash for the implicit flow, in the query for PKCE).
 * Returns the message to show on the login screen, or null when there is none.
 */
export function getLoginErrorFromUrl(url: URL): string | null {
  for (const params of [url.searchParams, hashParams(url)]) {
    if (!params.has("error") && !params.has("error_description")) continue;
    const description = params.get("error_description")?.trim() ?? "";
    return HOOK_MESSAGES.has(description) ? description : GENERIC_LOGIN_ERROR;
  }
  return null;
}

/** Same URL without the sign-in error params, so a reload does not show the error again. */
export function stripLoginErrorFromUrl(url: URL): string {
  const clean = new URL(url.href);
  const hash = hashParams(clean);
  for (const key of LOGIN_ERROR_PARAMS) {
    clean.searchParams.delete(key);
    hash.delete(key);
  }
  const hashString = hash.toString();
  clean.hash = hashString ? `#${hashString}` : "";
  return clean.href;
}
