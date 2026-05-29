import type { AppSession, DataAccessScope, SupabaseLike } from "./contracts.ts";
import { isMissingSchemaArtifactError } from "./errors.ts";

export async function insertAuditLog(
  supabase: SupabaseLike,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await supabase.from("audit_logs").insert([payload]).select();
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
  }
}

export async function logEntityMutation(
  supabase: SupabaseLike,
  args: {
    session: AppSession;
    scope: DataAccessScope;
    source: "web" | "telegram" | "system";
    action: "create" | "update" | "delete" | "restore_backup";
    entityType: "movimiento" | "empresa" | "movimientos_bulk";
    entityId: string;
    beforeData?: unknown;
    afterData?: unknown;
  },
): Promise<void> {
  await insertAuditLog(supabase, {
    dashboard_id: args.scope.dashboardId,
    actor_user_id: args.session.userId,
    source: args.source,
    action: args.action,
    entity_type: args.entityType,
    entity_id: args.entityId,
    before_data: args.beforeData ?? null,
    after_data: args.afterData ?? null,
    created_at: new Date().toISOString(),
  });
}

export async function createEmpresaDeleteBackup(
  supabase: SupabaseLike,
  args: {
    session: AppSession;
    scope: DataAccessScope;
    empresa: Record<string, unknown>;
    movimientosSnapshot: unknown[];
    source: "web" | "telegram";
  },
): Promise<void> {
  try {
    await supabase
      .from("empresa_delete_backups")
      .insert([
        {
          dashboard_id: args.scope.dashboardId,
          empresa_id: args.empresa.id,
          empresa_data: args.empresa,
          related_movimientos_snapshot: args.movimientosSnapshot,
          deleted_by_user_id: args.session.userId,
          source: args.source,
          created_at: new Date().toISOString(),
        },
      ])
      .select();
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
  }
}

export async function insertReportExport(
  supabase: SupabaseLike,
  payload: Record<string, unknown>,
): Promise<unknown> {
  try {
    const { data, error } = await supabase
      .from("report_exports")
      .insert([payload])
      .select();
    if (error) throw error;
    return data?.[0] ?? null;
  } catch (error) {
    if (isMissingSchemaArtifactError(error)) return null;
    throw error;
  }
}
