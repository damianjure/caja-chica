import express, { type Request, type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike } from "../contracts.ts";

export interface DriveDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  canConnectDrive: (scope: DataAccessScope) => boolean;
  canExportDrive: (scope: DataAccessScope) => boolean;
  resolveDriveOwnerUserId: (session: AppSession, scope: DataAccessScope) => Promise<string | null>;
  pendingDriveOAuthStates: Map<string, { userId: string; expiresAt: number }>;
  driveEnabled: boolean;
  randomBytes: (size: number) => Buffer;
  publicAppUrl?: string;
  googleDriveClientId?: string;
  googleDriveClientSecret?: string;
  googleDriveRedirectUri?: string;
  tokenEncryptionKey?: string;
  getDriveAuthUrl: (clientId: string, clientSecret: string, redirectUri: string, state: string) => string;
  exchangeCodeForTokens: (clientId: string, clientSecret: string, redirectUri: string, code: string) => Promise<{ refreshToken: string }>;
  encryptToken: (token: string, key: string) => string;
}

export function createDriveRouter(deps: DriveDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canConnectDrive,
    canExportDrive,
    resolveDriveOwnerUserId,
    pendingDriveOAuthStates,
    driveEnabled,
    randomBytes,
    publicAppUrl,
    googleDriveClientId,
    googleDriveClientSecret,
    googleDriveRedirectUri,
    tokenEncryptionKey,
    getDriveAuthUrl,
    exchangeCodeForTokens,
    encryptToken,
  } = deps;

  router.get("/api/drive/status", requireSession, async (req, res) => {
    if (!driveEnabled) return res.json({ connected: false, enabled: false });
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canExportDrive(scope)) return res.json({ connected: false, enabled: false });
      const driveOwnerUserId = await resolveDriveOwnerUserId(session, scope);
      if (!driveOwnerUserId) return res.json({ connected: false, enabled: true });
      const { data, error } = await supabase
        .from("drive_connections")
        .select("id")
        .eq("owner_user_id", driveOwnerUserId)
        .limit(1);
      if (error) throw error;
      res.json({ connected: (data?.length ?? 0) > 0, enabled: true });
    } catch {
      res.status(500).json({ error: "failed_to_check" });
    }
  });

  router.get("/api/drive/auth-url", requireSession, async (req, res) => {
    if (!driveEnabled) return res.status(503).json({ error: "drive_not_configured" });
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canConnectDrive(scope)) return res.status(403).json({ error: "forbidden" });
      const state = randomBytes(16).toString("hex");
      pendingDriveOAuthStates.set(state, { userId: session.userId, expiresAt: Date.now() + 5 * 60_000 });
      const url = getDriveAuthUrl(
        googleDriveClientId!,
        googleDriveClientSecret!,
        googleDriveRedirectUri!,
        state,
      );
      res.json({ url });
    } catch {
      res.status(500).json({ error: "failed_to_generate_url" });
    }
  });

  router.get("/api/drive/callback", async (req, res) => {
    if (!driveEnabled) return res.status(503).send("Drive not configured");
    const { code, state } = req.query as { code?: string; state?: string };
    // WARNING-18: if publicAppUrl is missing, redirect goes to backend root — startup warning fires at boot
    const fallbackUrl = publicAppUrl ?? "/";
    if (!code || !state) return res.redirect(`${fallbackUrl}?driveError=missing_params`);

    const pending = pendingDriveOAuthStates.get(state);
    if (!pending || Date.now() > pending.expiresAt) {
      pendingDriveOAuthStates.delete(state);
      return res.redirect(`${fallbackUrl}?driveError=invalid_state`);
    }
    pendingDriveOAuthStates.delete(state);

    try {
      const { refreshToken } = await exchangeCodeForTokens(
        googleDriveClientId!,
        googleDriveClientSecret!,
        googleDriveRedirectUri!,
        code,
      );
      const encryptedToken = encryptToken(refreshToken, tokenEncryptionKey!);
      const { error: upsertErr } = await supabase.from("drive_connections").upsert(
        [{ owner_user_id: pending.userId, refresh_token_enc: encryptedToken, updated_at: new Date().toISOString() }],
        { onConflict: "owner_user_id" },
      );
      if (upsertErr) {
        console.error("[drive] Failed to save tokens:", upsertErr);
        return res.redirect(`${fallbackUrl}?driveError=save_failed`);
      }
      res.redirect(`${fallbackUrl}?driveConnected=true`);
    } catch {
      res.redirect(`${fallbackUrl}?driveError=exchange_failed`);
    }
  });

  router.delete("/api/drive/disconnect", requireSession, async (req, res) => {
    if (!driveEnabled) return res.status(503).json({ error: "drive_not_configured" });
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canConnectDrive(scope)) return res.status(403).json({ error: "forbidden" });
      await supabase.from("drive_connections").delete().eq("owner_user_id", session.userId);
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "failed_to_disconnect" });
    }
  });

  return router;
}
