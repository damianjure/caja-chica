import { useState, useMemo } from "react";
import {
  Bell,
  Check,
  Copy,
  Download,
  HardDrive,
  Loader2,
  Lock,
  LogOut,
  MessageCircle,
  Monitor,
  Settings,
  Smartphone,
  SlidersHorizontal,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  api,
  type AppViewer,
  type DashboardInvitationRole,
  type DashboardMembersResponse,
  type MemberPermissions,
  type TelegramLink,
  type UserSession,
  type OnboardingState,
} from "../../../services/api";
import { ConfirmModal } from "../../ui/ConfirmModal";
import { ThemeSelector, type ThemePreference } from "../../ThemeToggle";
import { PersonasPanel } from "../../PersonasPanel";
import type { Empresa } from "../../../services/api";

const PREF_CURRENCY_KEY = 'caja-chica:default-currency';
const PREF_EMPRESA_KEY = 'caja-chica:default-empresa';

interface ConfiguracionTabProps {
  viewer: AppViewer;
  data: DashboardMembersResponse | null;
  loading: boolean;
  onRefresh: () => Promise<void>;
  canConnectDrive: boolean;
  onSignOut: () => Promise<void> | void;
  onDisconnectDrive?: () => Promise<void>;
  companies: Empresa[];
  themePreference: ThemePreference;
  onSetThemePreference: (p: ThemePreference) => void;
}

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

export default function ConfiguracionTab({
  viewer,
  data,
  loading,
  onRefresh,
  canConnectDrive,
  onSignOut,
  onDisconnectDrive,
  companies,
  themePreference,
  onSetThemePreference,
}: ConfiguracionTabProps) {
  const [defaultCurrency, setDefaultCurrencyState] = useState<'ARS' | 'USD'>(
    () => (window.localStorage.getItem(PREF_CURRENCY_KEY) === 'USD' ? 'USD' : 'ARS'),
  );
  const [defaultEmpresa, setDefaultEmpresaState] = useState<string>(
    () => window.localStorage.getItem(PREF_EMPRESA_KEY) ?? '',
  );

  const setDefaultCurrency = (v: 'ARS' | 'USD') => {
    setDefaultCurrencyState(v);
    window.localStorage.setItem(PREF_CURRENCY_KEY, v);
  };

  const setDefaultEmpresa = (v: string) => {
    setDefaultEmpresaState(v);
    if (v) window.localStorage.setItem(PREF_EMPRESA_KEY, v);
    else window.localStorage.removeItem(PREF_EMPRESA_KEY);
  };

  // display name
  const [displayName, setDisplayName] = useState(viewer.display_name ?? "");
  const [savingDisplayName, setSavingDisplayName] = useState(false);

  // notification hour
  const [notifHour, setNotifHour] = useState(viewer.notification_hour ?? 21);
  const [savingNotifHour, setSavingNotifHour] = useState(false);

  // sessions
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [revokingSession, setRevokingSession] = useState<string | null>(null);

  // demo data
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(viewer.onboarding_state ?? 'completed');
  const [purgingDemo, setPurgingDemo] = useState(false);

  const handlePurgeDemo = async () => {
    setPurgingDemo(true);
    try {
      await api.deleteDemoData();
      setOnboardingState('cleaned');
      showNotice('Datos de ejemplo eliminados.');
    } catch {
      showNotice('No se pudo eliminar los datos de ejemplo.');
    } finally {
      setPurgingDemo(false);
    }
  };

  // delete account
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DashboardInvitationRole>("viewer");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [updatingPermissions, setUpdatingPermissions] = useState<string | null>(null);
  const [revokingMember, setRevokingMember] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState<{ id: string; email: string } | null>(null);
  const [leavingDashboard, setLeavingDashboard] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [generatingTokenFor, setGeneratingTokenFor] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<{ userId: string; token: string; expiresAt: string } | null>(null);

  const selfMembership = useMemo(
    () => data?.members.find((m) => m.user_id === viewer.id) ?? null,
    [data, viewer.id],
  );

  const canManage =
    viewer.role === "admin" ||
    viewer.role === "superadmin" ||
    selfMembership?.role === "owner";

  const isNonOwnerMember = selfMembership !== null && selfMembership.role !== "owner";

  const showNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleSaveDisplayName = async () => {
    setSavingDisplayName(true);
    try {
      await api.updateMe({ display_name: displayName.trim() || null });
      showNotice("Nombre guardado");
    } catch {
      setError("No se pudo guardar el nombre.");
    } finally {
      setSavingDisplayName(false);
    }
  };

  const handleSaveNotifHour = async (h: number) => {
    setNotifHour(h);
    setSavingNotifHour(true);
    try {
      await api.updateMe({ notification_hour: h });
    } catch {
      setError("No se pudo guardar la hora.");
    } finally {
      setSavingNotifHour(false);
    }
  };

  const handleExportData = () => {
    window.open(api.getExportUrl(), "_blank");
  };

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const r = await api.getMySessionsList();
      setSessions(r.sessions);
      setCurrentSessionId(r.currentSessionId);
      setSessionsLoaded(true);
    } catch {
      setError("No se pudieron cargar las sesiones.");
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingSession(sessionId);
    try {
      await api.revokeMySession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showNotice("Sesión cerrada");
    } catch {
      setError("No se pudo cerrar la sesión.");
    } finally {
      setRevokingSession(null);
    }
  };

  const handleDeleteAccount = async () => {
    await api.deleteMyAccount();
    await onSignOut();
  };

  const loadTelegramLinks = () => {
    if (!canManage) return;
    setLoadingLinks(true);
    api.getTelegramLinks()
      .then((r) => setTelegramLinks(r.links))
      .catch(console.error)
      .finally(() => setLoadingLinks(false));
  };

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.inviteDashboardMember(email.trim(), role);
      setEmail("");
      setRole("viewer");
      showNotice(`Invitación enviada a ${email.trim()}`);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo invitar.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeDashboardInvitation = async (invitationId: string) => {
    try {
      await api.revokeDashboardInvitation(invitationId);
      showNotice("Invitación revocada");
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar.");
    }
  };

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

  const handleLeaveDashboard = async () => {
    setLeavingDashboard(true);
    setShowLeaveConfirm(false);
    try {
      await api.leaveDashboard();
      showNotice("Abandonaste el dashboard. Cerrando sesión...");
      setTimeout(() => void onSignOut(), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo abandonar el dashboard.");
      setLeavingDashboard(false);
    }
  };

  const handleGenerateToken = async (userId: string) => {
    setGeneratingTokenFor(userId);
    setError(null);
    try {
      const result = await api.generateTelegramInviteToken(userId);
      setGeneratedToken({ userId, token: result.token, expiresAt: result.expires_at });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo generar el token.");
    } finally {
      setGeneratingTokenFor(null);
    }
  };

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(`/start ${token}`);
    showNotice("Comando copiado");
  };

  const handleConfirmLink = async (linkId: string) => {
    setError(null);
    try {
      await api.confirmTelegramLink(linkId);
      loadTelegramLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar el vínculo.");
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    setError(null);
    try {
      await api.revokeTelegramLink(linkId);
      loadTelegramLinks();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar el vínculo.");
    }
  };

  const statusDot = (status: string) => {
    if (status === "active") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500" />;
    if (status === "pending") return <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />;
    return <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-300" />;
  };

  const roleBadge = (role: string) => {
    const styles: Record<string, string> = {
      owner: "bg-neutral-900 text-white",
      editor: "bg-blue-100 text-blue-700",
      viewer: "bg-neutral-100 text-neutral-600",
    };
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[role] ?? "bg-neutral-100 text-neutral-500"}`}>
        {role}
      </span>
    );
  };

  const linkStatusBadge = (status: TelegramLink["status"]) => {
    if (status === "active") return <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Activo</span>;
    if (status === "pending_owner_confirm") return <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>;
    return <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">Revocado</span>;
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {notice && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>
      )}

      {/* ── Preferencias ──────────────────────────────────────────────────── */}
      <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-neutral-900 text-white">
            <SlidersHorizontal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Preferencias</h2>
            <p className="text-sm text-neutral-500">Configuración personal del dashboard.</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Tema */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Tema</p>
            <ThemeSelector preference={themePreference} onChange={onSetThemePreference} />
          </div>

          {/* Moneda default */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Moneda por defecto</p>
            <div className="flex gap-2" role="group" aria-label="Moneda por defecto">
              {(['ARS', 'USD'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDefaultCurrency(c)}
                  aria-pressed={defaultCurrency === c}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-medium transition ${
                    defaultCurrency === c
                      ? 'bg-neutral-900 border-neutral-900 text-white'
                      : 'bg-white border-neutral-300 text-neutral-700 hover:border-neutral-500 hover:bg-neutral-50'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-neutral-500">Se usa en el formulario de presupuesto.</p>
          </div>

          {/* Empresa default */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Empresa por defecto</p>
            <select
              value={defaultEmpresa}
              onChange={(e) => setDefaultEmpresa(e.target.value)}
              aria-label="Empresa por defecto"
              className="rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-900 bg-white w-full max-w-xs"
            >
              <option value="">Sin empresa (Personal)</option>
              {companies.filter((c) => !c.deleted_at).map((c) => (
                <option key={c.id} value={c.nombre}>{c.nombre}</option>
              ))}
            </select>
            <p className="text-[11px] text-neutral-500">Se resalta en el selector de empresa al registrar un ticket.</p>
          </div>

          {/* Notification hour */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Hora del recordatorio</p>
              {savingNotifHour && <Loader2 className="w-3 h-3 animate-spin text-neutral-500" />}
            </div>
            <div className="flex items-center gap-3">
              <Bell className="w-4 h-4 text-neutral-500 shrink-0" />
              <input
                type="range"
                min={0}
                max={23}
                value={notifHour}
                onChange={(e) => void handleSaveNotifHour(Number(e.target.value))}
                className="flex-1 accent-neutral-900"
                aria-label="Hora del recordatorio diario"
              />
              <span className="w-14 text-sm font-mono text-neutral-700 text-right">
                {String(notifHour).padStart(2, "0")}:00 hs
              </span>
            </div>
            <p className="text-[11px] text-neutral-500">El bot te manda el recordatorio a esta hora (UTC). Actualmente el recordatorio llega por Telegram.</p>
          </div>
        </div>
      </section>

      {/* ── Miembros (solo owner / admin) ─────────────────────────────────── */}
      {canManage && (
        <section className="bg-white border border-neutral-200 rounded-3xl shadow-sm overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-6 pb-4 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-neutral-900 text-white">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-xl font-bold">Miembros</h2>
                <p className="text-sm text-neutral-500">Accesos, permisos e invitaciones.</p>
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
            <div className="overflow-x-auto border-t border-neutral-100" aria-live="polite" aria-atomic="false">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-100">
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
                      <tr
                        key={member.id}
                        className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/60 transition-colors"
                      >
                        {/* Member info — sticky */}
                        <td className="sticky left-0 z-10 bg-white px-6 py-4 hover:bg-neutral-50/60">
                          <div className="font-medium text-neutral-900 text-sm [overflow-wrap:anywhere] leading-tight">
                            {member.email ?? member.user_id}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {roleBadge(member.role)}
                            {statusDot(member.status)}
                            <span className="text-[11px] text-neutral-500">{member.status}</span>
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
                                      ? "bg-neutral-900 text-white hover:bg-neutral-700"
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
                              className="inline-flex items-center justify-center w-7 h-7 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-50 mx-auto"
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

          {/* Telegram invite per member */}
          {!loading && data && data.members.some((m) => m.status === "active") && (
            <div className="px-6 py-4 border-t border-neutral-100 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Invitar a Telegram</p>
              <div className="flex flex-wrap gap-2">
                {data.members.filter((m) => m.status === "active").map((member) => {
                  const activeToken = generatedToken?.userId === member.user_id ? generatedToken : null;
                  return (
                    <div key={member.id} className="space-y-1.5">
                      <button
                        disabled={generatingTokenFor === member.user_id}
                        onClick={() => void handleGenerateToken(member.user_id)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                      >
                        {generatingTokenFor === member.user_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Smartphone className="w-3 h-3" />}
                        {member.email?.split("@")[0] ?? "miembro"}
                      </button>
                      {activeToken && (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <code className="text-xs font-mono text-neutral-800 break-all">/start {activeToken.token}</code>
                            <button onClick={() => void handleCopyToken(activeToken.token)} className="shrink-0 p-1 rounded-lg hover:bg-neutral-200" aria-label="Copiar token">
                              <Copy className="w-3 h-3 text-neutral-600" />
                            </button>
                          </div>
                          <p className="text-[11px] text-neutral-500">Válido 30 min.</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Telegram links */}
          <div className="px-6 py-4 border-t border-neutral-100 space-y-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-3.5 h-3.5 text-neutral-500" />
              <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500 flex-1">Vínculos Telegram</p>
              <button onClick={loadTelegramLinks} className="text-xs text-neutral-500 hover:text-neutral-700">Actualizar</button>
            </div>
            {loadingLinks ? (
              <div className="flex items-center gap-2 text-sm text-neutral-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>
            ) : telegramLinks.length === 0 ? (
              <p className="text-sm text-neutral-500">No hay vínculos registrados.</p>
            ) : (
              <div className="space-y-2">
                {telegramLinks.map((link) => (
                  <div key={link.id} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="font-medium text-neutral-900 text-sm">
                        {link.telegram_username ? `@${link.telegram_username}` : `ID ${link.telegram_user_id}`}
                      </div>
                      <div className="flex items-center gap-2">{linkStatusBadge(link.status)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {link.status === "pending_owner_confirm" && (
                        <button onClick={() => void handleConfirmLink(link.id)} className="p-1.5 rounded-xl border border-green-200 text-green-600 hover:bg-green-50" aria-label="Confirmar vínculo" title="Confirmar">
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      {link.status !== "revoked" && (
                        <button onClick={() => void handleRevokeLink(link.id)} className="p-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50" aria-label="Revocar vínculo" title="Revocar">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Cuenta ────────────────────────────────────────────────────────── */}
      <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-neutral-900 text-white">
            <Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Cuenta</h2>
            <p className="text-sm text-neutral-500">Sesión, integraciones y acceso.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-1">
          <div className="text-sm font-medium text-neutral-900">{viewer.email}</div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-neutral-500">Rol de app:</span>
            <span className="text-xs font-medium text-neutral-700">{viewer.role}</span>
            {selfMembership && (
              <>
                <span className="text-xs text-neutral-300">·</span>
                <span className="text-xs text-neutral-500">Dashboard:</span>
                {roleBadge(selfMembership.role)}
                {statusDot(selfMembership.status)}
              </>
            )}
          </div>
        </div>

        {/* Display name */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Nombre visible</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={viewer.email}
              maxLength={50}
              aria-label="Nombre visible"
              className="flex-1 rounded-2xl border border-neutral-300 px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-neutral-900"
            />
            <button
              type="button"
              onClick={() => void handleSaveDisplayName()}
              disabled={savingDisplayName}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              {savingDisplayName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              Guardar
            </button>
          </div>
          <p className="text-[11px] text-neutral-500">Lo ven otros miembros del dashboard.</p>
        </div>

        <div className="space-y-3">
          {canConnectDrive && onDisconnectDrive && (
            <button
              onClick={() => void onDisconnectDrive()}
              className="w-full flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <HardDrive className="w-4 h-4 text-neutral-500" />
              Desconectar Google Drive
            </button>
          )}

          {/* Demo data purge */}
          {(onboardingState === 'seeded' || onboardingState === 'pending') && (
            <button
              onClick={() => void handlePurgeDemo()}
              disabled={purgingDemo}
              className="w-full flex items-center gap-3 rounded-2xl border border-amber-200 px-4 py-3 text-sm font-medium text-amber-700 hover:bg-amber-50 transition-colors disabled:opacity-50"
            >
              {purgingDemo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Limpiar datos de ejemplo
            </button>
          )}

          {/* Export data */}
          <button
            onClick={handleExportData}
            className="w-full flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <Download className="w-4 h-4 text-neutral-500" />
            Exportar mis datos (JSON)
          </button>

          {isNonOwnerMember && (
            <button
              onClick={() => setShowLeaveConfirm(true)}
              disabled={leavingDashboard}
              className="w-full flex items-center gap-3 rounded-2xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {leavingDashboard ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserMinus className="w-4 h-4" />}
              Abandonar este dashboard
            </button>
          )}

          <button
            onClick={() => void onSignOut()}
            className="w-full flex items-center gap-3 rounded-2xl border border-neutral-200 px-4 py-3 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            <LogOut className="w-4 h-4 text-neutral-500" />
            Cerrar sesión
          </button>
        </div>

        {/* Active sessions */}
        <div className="space-y-3 border-t border-neutral-100 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Sesiones activas</p>
            {!sessionsLoaded && (
              <button
                onClick={() => void loadSessions()}
                disabled={loadingSessions}
                className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
              >
                {loadingSessions ? <Loader2 className="w-3 h-3 animate-spin" /> : <Monitor className="w-3 h-3" />}
                Ver sesiones
              </button>
            )}
          </div>
          {sessionsLoaded && (
            <div className="space-y-2">
              {sessions.length === 0 ? (
                <p className="text-sm text-neutral-500">No hay sesiones activas.</p>
              ) : (
                sessions.map((s) => {
                  const isCurrent = currentSessionId !== null && s.id === currentSessionId;
                  return (
                    <div key={s.id} className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${isCurrent ? "border-neutral-400 bg-neutral-50" : "border-neutral-200"}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="text-xs font-medium text-neutral-700 truncate">{s.user_agent ?? "Dispositivo desconocido"}</div>
                          {isCurrent && (
                            <span className="inline-flex items-center rounded-full bg-neutral-900 px-2 py-0.5 text-[10px] font-semibold text-white shrink-0">
                              Esta sesión
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          Iniciada {new Date(s.created_at).toLocaleString("es-AR")}
                          {s.not_after && ` · Expira ${new Date(s.not_after).toLocaleString("es-AR")}`}
                        </div>
                      </div>
                      <button
                        onClick={() => void handleRevokeSession(s.id)}
                        disabled={revokingSession === s.id || isCurrent}
                        aria-label={isCurrent ? "No se puede cerrar la sesión activa" : "Cerrar esta sesión"}
                        title={isCurrent ? "Usá Cerrar sesión para salir" : "Cerrar sesión"}
                        className="p-1.5 rounded-xl border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                      >
                        {revokingSession === s.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Delete account */}
        <div className="border-t border-red-100 pt-4">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full flex items-center gap-3 rounded-2xl border border-red-200 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Borrar mi cuenta
          </button>
          <p className="text-[11px] text-neutral-500 mt-2 px-1">Esta acción es permanente e irreversible. Exportá tus datos antes.</p>
        </div>
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

      {showLeaveConfirm && (
        <ConfirmModal
          title="Abandonar dashboard"
          description="Vas a salir de este dashboard compartido. Se revocará tu acceso y se cerrará tu sesión."
          confirmLabel="Abandonar"
          tone="danger"
          onConfirm={async () => {
            await handleLeaveDashboard();
          }}
          onCancel={() => setShowLeaveConfirm(false)}
        />
      )}

      {showDeleteConfirm && (
        <ConfirmModal
          title="Borrar mi cuenta"
          description={`Vas a eliminar permanentemente tu cuenta (${viewer.email}). Se borrarán tus datos y no podrás recuperarlos. Escribí tu email para confirmar.`}
          confirmLabel="Borrar cuenta"
          tone="danger"
          requireText={viewer.email}
          onConfirm={async () => {
            setShowDeleteConfirm(false);
            await handleDeleteAccount();
          }}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
