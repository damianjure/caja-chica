// App-lock biométrico vía WebAuthn (platform authenticator). Frontend-only:
// la credencial vive en el dispositivo; el desbloqueo se da por el éxito de
// navigator.credentials.get() con userVerification. No reemplaza el login.

const GRACE_MS = 90_000;
const LAST_ACTIVE_KEY = "biolock:lastActive";

function credKey(userId: string): string {
  return `biolock:cred:${userId}`;
}

/** Lógica pura: ¿hay que pedir biométrico? Testeable sin DOM. */
export function shouldPromptUnlock(
  enabled: boolean,
  lastActiveAt: number | null,
  now: number,
  graceMs: number = GRACE_MS,
): boolean {
  if (!enabled) return false;
  if (lastActiveAt == null) return true;
  return now - lastActiveAt > graceMs;
}

function toB64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function isBiometricSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isLockEnabled(userId: string): boolean {
  return !!localStorage.getItem(credKey(userId));
}

export function markActive(): void {
  try { localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now())); } catch { /* ignore */ }
}

export function readLastActive(): number | null {
  const v = localStorage.getItem(LAST_ACTIVE_KEY);
  return v ? Number(v) : null;
}

export function needsUnlock(userId: string, now: number = Date.now()): boolean {
  return shouldPromptUnlock(isLockEnabled(userId), readLastActive(), now);
}

export async function enableLock(userId: string, email: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userIdBytes = new TextEncoder().encode(userId);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Caja Chica", id: location.hostname },
      user: { id: userIdBytes, name: email, displayName: email },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  localStorage.setItem(credKey(userId), toB64url(cred.rawId));
  markActive();
  return true;
}

export function disableLock(userId: string): void {
  localStorage.removeItem(credKey(userId));
}

export async function unlock(userId: string): Promise<boolean> {
  const stored = localStorage.getItem(credKey(userId));
  if (!stored) return true; // sin credencial → no bloquea
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type: "public-key", id: fromB64url(stored) }],
      userVerification: "required",
      rpId: location.hostname,
      timeout: 60_000,
    },
  });
  if (assertion) markActive();
  return !!assertion;
}
