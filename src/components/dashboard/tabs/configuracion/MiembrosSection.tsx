import { useState } from "react";
import { Check, Loader2, Lock, UserMinus, Users } from "lucide-react";
import {
  api,
  type AppViewer,
  type DashboardMembersResponse,
  type MemberPermissions,
} from "../../../../services/api";
import { ConfirmModal } from "../../../ui/ConfirmModal";
import { PersonasPanel } from "../../../PersonasPanel";

interface PermCol {
  key: keyof MemberPermissions;
  label: string;
  description: string;
  defaultOn: boolean;
}

const PERM_COLS: PermCol[] = [
  { key: "invite_telegram", label: "Telegram", description: "Puede generar invitaciones de Telegram para otros miembros", defaultOn: false },
  { key: "export_drive", label: "Drive", description: "Puede exportar informes a Google Drive (usa token del owner)", defaultOn: false },
  { key: "export_local", label: "Exportar", description: "Puede descargar archivos CSV y PDF", defaultOn: true },
  { key: "edit_any", label: "Editar", description: "Puede editar movimientos de otros miembros", defaultOn: false },
  { key: "delete_any", label: "Eliminar", description: "Puede eliminar movimientos de otros miembros", defaultOn: false },
  { key: "manage_empresas", label: "Empresas", description: "Puede crear, editar y eliminar empresas", defaultOn: true },
  { key: "manage_categorias", label: "Categ.", description: "Puede crear y eliminar categorías", defaultOn: true },
  { key: "manage_backups", label: "Backups", description: "Puede gestionar backups del dashboard", defaultOn: false },
  { key: "restore_backups", label: "Restaurar", description: "Puede restaurar datos desde un backup", defaultOn: false },
];

function effectivePerm(perms: MemberPermissions, col: PermCol): boolean {
  const val = perms[col.key];
  return val !== undefined ? !!val : col.defaultOn;
}

function statusDot(status: string) {
  if (status === "active") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />;
  if (status === "pending") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />;
  return <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300" />;
}

function roleBadge(role: string) {
  const styles: Record<string, string> = {
    owner: "bg-neutral-900 text-white",
    editor: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
    viewer: "bg-neutral-100 text-neutral-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles[role] ?? "bg-neutral-100 text-neutral-500"}`}>
      {role}
    </span>
  );
}

interface MiembrosSectionProps {
  viewer: AppViewer;
  data: DashboardMembersResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  showNotice: (msg: string) => void;
  setError: (msg: string | null) => void;
}

export function MiembrosSection({
  viewer,
  data,
  loading,
  onRefresh,
  showNotice,
  setError,
}: MiembrosSectionProps) {
  const [updatingPermissions, setUpdatingPermissions] = useState<string | null>(null);
  const [revokingMember, setRevokingMember] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; email: string } | null>(null);

  const handleTogglePermission = async (
    memberId: string,
    current: MemberPermissions,
    col: PermCol,
  ) => {
    setUpdatingPermissions(memberId);
    setError(null);
    try {
      const next = !effectivePerm(current, col);
      await api.updateMemberPermissions(memberId, { ...current, [col.key]: next });
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar el permiso.");
    } finally {
      setUpdatingPermissions(null);
    }
  };

  const handleRevokeMember = async (memberId: string) => {
    setRevokingMember(memberId);
    setRevokeConfirm(null);
    setError(null);
    try {
      await api.revokeMember(memberId);
      showNotice("Acceso revocado");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el acceso.");
    } finally {
      setRevokingMember(null);
    }
  };

  return (
    <>
      <section className="bg-white border border-neutral-200 rounded-3xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-neutral-900 text-white">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Equipo</h2>
              <p className="text-sm text-neutral-500">Quién tiene acceso a este dashboard y qué puede hacer.</p>
            </div>
          </div>

          {/* Invitations — unified panel */}
          <PersonasPanel scope="dashboard" showTelegramToggle />
        </div>

        {/* Permissions table */}
        {loading ? (
          <div className="py-10 flex justify-center text-neutral-500" role="status" aria-label="Cargando miembros">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-neutral-200" aria-live="polite" aria-atomic="false">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200">
                  <th className="sticky left-0 z-10 bg-neutral-50 text-left px-6 py-3 font-semibold text-neutral-700 text-xs uppercase tracking-wide min-w-[180px]">
                    Miembro
                  </th>
                  {PERM_COLS.map((col) => (
                    <th
                      key={col.key}
                      title={col.description}
                      className="px-3 py-3 text-center font-medium text-neutral-500 text-xs whitespace-nowrap cursor-help"
                    >
                      {col.label}
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-medium text-neutral-500 text-xs">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {data?.members.map((member) => {
                  const perms: MemberPermissions = member.permissions ?? {};
                  const isUpdating = updatingPermissions === member.id;
                  const isRevoking = revokingMember === member.id;
                  const canRevoke = member.role !== "owner" && member.user_id !== viewer.id;
                  const isOwner = member.role === "owner";
                  const isViewer = member.role === "viewer";

                  return (
                    <tr key={member.id} className="border-b border-neutral-200 last:border-0">
                      {/* Member info — sticky */}
                      <td className="sticky left-0 z-10 bg-white px-6 py-4">
                        <div className="font-medium text-neutral-900 text-sm [overflow-wrap:anywhere] leading-tight">
                          {member.email ?? member.user_id}
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          {roleBadge(member.role)}
                          {statusDot(member.status)}
                          <span className="text-xs text-neutral-500">{member.status}</span>
                        </div>
                      </td>

                      {/* Permission cells */}
                      {PERM_COLS.map((col) => {
                        const active = effectivePerm(perms, col);
                        return (
                          <td key={col.key} className="px-3 py-4 text-center">
                            {isOwner ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-neutral-900 mx-auto">
                                <Check className="w-3 h-3 text-white" />
                              </span>
                            ) : isViewer ? (
                              <span className="inline-flex items-center justify-center w-6 h-6 mx-auto">
                                <Lock className="w-3.5 h-3.5 text-neutral-300" />
                              </span>
                            ) : (
                              <button
                                disabled={isUpdating}
                                onClick={() => void handleTogglePermission(member.id, perms, col)}
                                title={col.description}
                                className={`inline-flex items-center justify-center w-6 h-6 rounded-full mx-auto transition-all disabled:opacity-40 ${
                                  active
                                    ? "bg-neutral-900 text-white"
                                    : "border-2 border-neutral-300 text-transparent hover:border-neutral-500"
                                }`}
                              >
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                          </td>
                        );
                      })}

                      {/* Actions */}
                      <td className="px-3 py-4 text-center">
                        {isUpdating ? (
                          <Loader2 className="w-4 h-4 animate-spin text-neutral-500 mx-auto" />
                        ) : canRevoke ? (
                          <button
                            onClick={() => setRevokeConfirm({ id: member.id, email: member.email ?? member.user_id })}
                            disabled={isRevoking}
                            className="inline-flex items-center justify-center w-11 h-11 rounded-xl border border-red-200 text-red-500 hover:border-red-400 disabled:opacity-50 mx-auto"
                            title="Revocar acceso"
                          >
                            {isRevoking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserMinus className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="text-xs text-neutral-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {(!data || data.members.length === 0) && (
                  <tr>
                    <td colSpan={PERM_COLS.length + 2} className="px-6 py-8 text-center text-sm text-neutral-500">
                      Todavía no hay miembros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {revokeConfirm && (
        <ConfirmModal
          title="Revocar acceso"
          description={`Vas a revocar el acceso de ${revokeConfirm.email}. No podrá ver ni editar el dashboard.`}
          confirmLabel="Revocar"
          tone="danger"
          onConfirm={async () => {
            await handleRevokeMember(revokeConfirm.id);
          }}
          onCancel={() => setRevokeConfirm(null)}
        />
      )}
    </>
  );
}
