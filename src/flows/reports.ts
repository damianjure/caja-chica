/**
 * flows/reports.ts — channel-agnostic report core.
 *
 * Loads the scoped movements for a period, builds the CSV/PDF and delivers it
 * (file in chat, or Drive upload + link). The guided UI (period/scope/type
 * pickers) is per-channel and stays out: each channel collects ReportParams
 * however it can (Telegram inline keyboards today, WhatsApp lists later) and
 * calls this core. Scope and Drive-owner resolution are channel-specific too,
 * so they come in as closures.
 */

import type { ChannelContext } from "../channels/contract.ts";
import type { SupabaseLike } from "../server/contracts.ts";
import { buildReportFile, buildSaldosReport } from "../server/reportExports.ts";
import {
  filterMovementsForReport,
  resolveReportDateRange,
  type ReportExportRequest,
} from "../reports/shared.ts";
import { uploadFileToDrive, decryptToken } from "../server/drive.ts";

export interface ReportParams {
  period: ReportExportRequest["period"];
  anchorDate?: string;
  month?: string;
  from?: string;
  to?: string;
  tipo?: "ingreso" | "egreso" | "saldos";
  /** Resolved company names to include; empty = all companies. */
  companies: string[];
}

export interface ReportDelivery {
  format: "csv" | "pdf";
  destination: "local" | "drive";
  /** Whose Drive refresh token to use — required when destination is "drive". */
  resolveDriveOwnerUserId?: () => Promise<string | null>;
}

export interface LoadedReportData {
  range: NonNullable<ReturnType<typeof resolveReportDateRange>>;
  filtered: any[];
  filters: { companies: string[]; tipo: "all" | "ingreso" | "egreso"; moneda: "all" };
}

/** Fetch + filter the scoped movements for the requested period. Null = invalid period. */
export async function loadReportData(
  supabase: SupabaseLike,
  applyScope: (query: any) => any,
  params: ReportParams,
): Promise<LoadedReportData | null> {
  const range = resolveReportDateRange({
    period: params.period,
    anchorDate: params.anchorDate,
    month: params.month,
    from: params.from,
    to: params.to,
  });
  if (!range) return null;

  const { data: movs } = await applyScope(
    supabase.from("movimientos").select("*").is("deleted_at", null),
  );
  const tipoFilter = (params.tipo && params.tipo !== "saldos") ? params.tipo : "all";
  const filters = {
    companies: params.companies,
    tipo: tipoFilter as "all" | "ingreso" | "egreso",
    moneda: "all" as const,
  };
  const filtered = filterMovementsForReport(movs ?? [], filters, range);
  return { range, filtered, filters };
}

/** Build the report file and deliver it through the channel (chat file or Drive link). */
export async function generateAndDeliverReport(
  ch: ChannelContext,
  supabase: SupabaseLike,
  applyScope: (query: any) => any,
  params: ReportParams,
  delivery: ReportDelivery,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const loaded = await loadReportData(supabase, applyScope, params);
  if (!loaded) {
    await ch.reply("❌ Período inválido. Intentá de nuevo con /informes.");
    return;
  }
  const { range, filtered, filters } = loaded;

  const dateSlug = params.from ? `${params.from}_${params.to}` : (params.month ?? params.anchorDate ?? today);
  const tipoSlug = params.tipo ?? "todos";
  const fileName = `informe_${tipoSlug}_${params.period}_${dateSlug}.${delivery.format}`;

  const file = params.tipo === "saldos"
    ? buildSaldosReport({ format: delivery.format, fileName, periodLabel: range.label, filters, movements: filtered })
    : buildReportFile({ format: delivery.format, fileName, periodLabel: range.label, filters, movements: filtered });

  if (delivery.destination === "drive") {
    const ownerUserId = await delivery.resolveDriveOwnerUserId?.() ?? null;
    if (!ownerUserId) {
      await ch.reply("❌ No pude resolver el dueño del dashboard para usar Drive.");
      return;
    }
    const { data: connData } = await supabase
      .from("drive_connections")
      .select("refresh_token_enc")
      .eq("owner_user_id", ownerUserId)
      .limit(1);
    const conn = connData?.[0];
    if (!conn) {
      await ch.reply("❌ Drive no conectado. Conectalo desde el dashboard web.");
      return;
    }
    const tokenEncKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!tokenEncKey) {
      await ch.reply("❌ Error de configuración del servidor.");
      return;
    }
    const refreshToken = decryptToken(conn.refresh_token_enc, tokenEncKey);
    const uploaded = await uploadFileToDrive({
      refreshToken,
      clientId: process.env.GOOGLE_DRIVE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_DRIVE_CLIENT_SECRET!,
      redirectUri: process.env.GOOGLE_DRIVE_REDIRECT_URI!,
      fileName,
      mimeType: file.mimeType,
      buffer: file.buffer,
    });
    const movCount = params.tipo === "saldos" ? `${filtered.length} mov.` : `${filtered.length} movimientos`;
    await ch.reply(`✅ Informe guardado en Drive\n\n📂 ${range.label}\n${movCount}\n\n🔗 ${uploaded.webViewLink}`);
  } else {
    const caption = params.tipo === "saldos"
      ? `📊 Saldos — ${range.label}`
      : `📊 ${range.label} — ${filtered.length} movimientos`;
    await ch.sendFile({ bytes: file.buffer, filename: fileName, mimeType: file.mimeType, caption });
  }
}
