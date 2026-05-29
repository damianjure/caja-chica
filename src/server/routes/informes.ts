import express, { type Request, type RequestHandler } from "express";
import type { AppSession, DataAccessScope, SupabaseLike } from "../contracts.ts";

export interface InformesDeps {
  supabase: SupabaseLike;
  requireSession: RequestHandler;
  getSession: (req: Request) => AppSession;
  resolveDataAccessScope: (session: AppSession) => Promise<DataAccessScope>;
  canWriteToScope: (scope: DataAccessScope) => boolean;
  canExportDrive: (scope: DataAccessScope) => boolean;
  canExportLocal: (scope: DataAccessScope) => boolean;
  fetchScopedMovimientos: (session: AppSession, scope: DataAccessScope) => Promise<any[]>;
  filterMovementsForReport: (movements: any[], payload: any, range: any) => any[];
  resolveReportDateRange: (payload: any) => any;
  buildReportFile: (args: { format: string; fileName: string; periodLabel: string; filters: any; movements: any[] }) => { mimeType: string; buffer: Buffer };
  insertReportExport: (payload: Record<string, unknown>) => Promise<any>;
  buildWriteOwnership: (session: AppSession, scope: DataAccessScope) => Record<string, string>;
  resolveDriveOwnerUserId: (session: AppSession, scope: DataAccessScope) => Promise<string | null>;
  driveEnabled: boolean;
  googleDriveClientId?: string;
  googleDriveClientSecret?: string;
  googleDriveRedirectUri?: string;
  tokenEncryptionKey?: string;
  decryptToken: (encrypted: string, key: string) => string;
  uploadFileToDrive: (args: { refreshToken: string; clientId: string; clientSecret: string; redirectUri: string; fileName: string; mimeType: string; buffer: Buffer }) => Promise<{ fileId: string; webViewLink: string }>;
  parseReportExportRequest: (body: unknown) => any;
  isMissingSchemaArtifactError: (error: unknown) => boolean;
  applyDataScope: (query: any, session: AppSession, scope: DataAccessScope) => any;
}

export function createInformesRouter(deps: InformesDeps) {
  const router = express.Router();
  const {
    supabase,
    requireSession,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    canExportDrive,
    canExportLocal,
    fetchScopedMovimientos,
    filterMovementsForReport,
    resolveReportDateRange,
    buildReportFile,
    insertReportExport,
    buildWriteOwnership,
    resolveDriveOwnerUserId,
    driveEnabled,
    googleDriveClientId,
    googleDriveClientSecret,
    googleDriveRedirectUri,
    tokenEncryptionKey,
    decryptToken,
    uploadFileToDrive,
    parseReportExportRequest,
    isMissingSchemaArtifactError,
    applyDataScope,
  } = deps;


  router.get("/api/report-exports", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const { data, error } = await applyDataScope(
        supabase
          .from("report_exports")
          .select("*")
          .order("created_at", { ascending: false }),
        session,
        scope,
      ).limit(100);
      if (error) throw error;
      res.json(data ?? []);
    } catch (error) {
      if (isMissingSchemaArtifactError(error)) {
        return res.json([]);
      }
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });

  router.post("/api/report-exports", requireSession, async (req, res) => {
    try {
      const payload = parseReportExportRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const range = resolveReportDateRange(payload);
      if (!range) return res.status(400).json({ error: "invalid_request" });

      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const scopedMovements = await fetchScopedMovimientos(session, scope);
      const filteredMovements = filterMovementsForReport(scopedMovements, payload, range);
      const dateSlug =
        payload.period === "month"
          ? payload.month
          : payload.period === "range"
            ? `${payload.from}_${payload.to}`
            : payload.anchorDate;
      const fileName = `informe_${payload.period}_${dateSlug || new Date().toISOString().slice(0, 10)}.${payload.format}`;
      const file = buildReportFile({
        format: payload.format,
        fileName,
        periodLabel: range.label,
        filters: payload,
        movements: filteredMovements as any[],
      });

      // WARNING-19: use validated destination from payload, not raw req.body
      if (!canExportLocal(scope) && payload.destination === "local") {
        return res.status(403).json({ error: "forbidden" });
      }
      const wantsDrive = payload.destination === "drive" && driveEnabled && canExportDrive(scope);
      let driveFileId: string | null = null;
      let driveUrl: string | null = null;

      if (wantsDrive) {
        const driveOwnerUserId = await resolveDriveOwnerUserId(session, scope);
        if (!driveOwnerUserId) return res.status(400).json({ error: "drive_not_connected" });
        const { data: connData } = await supabase
          .from("drive_connections")
          .select("refresh_token_enc")
          .eq("owner_user_id", driveOwnerUserId)
          .limit(1);
        const connection = connData?.[0];
        if (!connection) return res.status(400).json({ error: "drive_not_connected" });
        const refreshToken = decryptToken(connection.refresh_token_enc, tokenEncryptionKey!);
        const uploaded = await uploadFileToDrive({
          refreshToken,
          clientId: googleDriveClientId!,
          clientSecret: googleDriveClientSecret!,
          redirectUri: googleDriveRedirectUri!,
          fileName,
          mimeType: file.mimeType,
          buffer: file.buffer,
        });
        driveFileId = uploaded.fileId;
        driveUrl = uploaded.webViewLink;
      }

      const recordPayload = {
        ...buildWriteOwnership(session, scope),
        exported_by_user_id: session.userId,
        format: payload.format,
        period_type: payload.period,
        period_label: range.label,
        period_anchor_date: payload.anchorDate ?? null,
        period_month: payload.month ?? null,
        period_from: payload.from ?? null,
        period_to: payload.to ?? null,
        company: payload.companies.join(", ") || "all",
        tipo: payload.tipo,
        moneda: payload.moneda,
        total_movements: filteredMovements.length,
        file_name: fileName,
        destination: wantsDrive ? "drive" : "local",
        drive_file_id: driveFileId,
        drive_url: driveUrl,
      };
      const record = await insertReportExport(recordPayload);

      res.status(201).json({
        format: payload.format,
        mimeType: file.mimeType,
        fileName,
        contentBase64: wantsDrive ? null : file.buffer.toString("base64"),
        driveUrl,
        record: {
          id: record?.id ?? null,
          created_at: record?.created_at ?? new Date().toISOString(),
          totalMovements: filteredMovements.length,
          periodLabel: range.label,
          company: payload.companies.join(", ") || "all",
          tipo: payload.tipo,
          moneda: payload.moneda,
          destination: wantsDrive ? "drive" : "local",
          driveUrl,
        },
      });
    } catch (err) {
      console.error("Report export error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  return router;
}
