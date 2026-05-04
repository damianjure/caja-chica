import { useEffect, useState } from "react";
import { Copy, Loader2, Shield, UserPlus, XCircle } from "lucide-react";

import {
  api,
  AppInvitation,
  AppRole,
  AppUser,
  AppViewer,
} from "../services/api";

interface AdminPanelProps {
  viewer: AppViewer;
}

export function AdminPanel({ viewer }: AdminPanelProps) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [invitations, setInvitations] = useState<AppInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AppRole>("member");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isSuperadmin = viewer.role === "superadmin";

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [loadedUsers, loadedInvitations] = await Promise.all([
        api.getAdminUsers(),
        api.getAdminInvitations(),
      ]);
      setUsers(loadedUsers);
      setInvitations(loadedInvitations);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudieron cargar los datos de admin.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const handleInvite = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const invitation = await api.inviteUser(email.trim(), role);
      setInvitations((prev) => [invitation, ...prev.filter((item) => item.id !== invitation.id)]);
      setEmail("");
      setRole("member");
      setNotice(`Invitación creada para ${invitation.email}`);
      setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la invitación.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopy = async (invitation: AppInvitation) => {
    await navigator.clipboard.writeText(invitation.invite_url);
    setNotice(`Link copiado para ${invitation.email}`);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleRevoke = async (invitationId: string) => {
    try {
      await api.revokeInvitation(invitationId);
      setInvitations((prev) =>
        prev.map((item) =>
          item.id === invitationId ? { ...item, status: "revoked" } : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar la invitación.");
    }
  };

  return (
    <section className="bg-white border border-neutral-200 rounded-3xl p-6 md:p-8 shadow-sm space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-xl bg-neutral-900 text-white">
          <Shield className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-xl font-bold">Administración</h2>
          <p className="text-sm text-neutral-500">
            Gestioná usuarios autorizados e invitaciones activas.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.8fr)_auto] gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="usuario@empresa.com"
          className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as AppRole)}
          className="rounded-2xl border border-neutral-200 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-900 bg-white"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
          {isSuperadmin && <option value="superadmin">superadmin</option>}
        </select>
        <button
          onClick={() => void handleInvite()}
          disabled={submitting || !email.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-neutral-900 px-5 py-3 text-white font-medium hover:bg-neutral-800 disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Invitando...
            </>
          ) : (
            <>
              <UserPlus className="w-4 h-4" />
              Invitar
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div className="py-8 flex items-center justify-center text-neutral-500">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Usuarios
            </h3>
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.user_id}
                  className="border border-neutral-200 rounded-2xl px-4 py-3 min-w-0"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">{user.email}</div>
                    <div className="text-xs text-neutral-500">
                      {user.role} · {user.status}
                    </div>
                  </div>
                </div>
              ))}
              {users.length === 0 && (
                <p className="text-sm text-neutral-500">Todavía no hay usuarios activos.</p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
              Invitaciones
            </h3>
            <div className="space-y-3">
              {invitations.map((invitation) => (
                <div
                  key={invitation.id}
                  className="border border-neutral-200 rounded-2xl px-4 py-3 space-y-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between min-w-0">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-neutral-900 [overflow-wrap:anywhere]">{invitation.email}</div>
                      <div className="text-xs text-neutral-500">
                        {invitation.role} · {invitation.status}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => void handleCopy(invitation)}
                        className="p-2 rounded-xl border border-neutral-200 hover:bg-neutral-50"
                        title="Copiar link"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {invitation.status === "pending" && (
                        <button
                          onClick={() => void handleRevoke(invitation.id)}
                          className="p-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50"
                          title="Revocar"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-neutral-500 [overflow-wrap:anywhere] leading-relaxed">
                    {invitation.invite_url}
                  </div>
                </div>
              ))}
              {invitations.length === 0 && (
                <p className="text-sm text-neutral-500">Todavía no hay invitaciones.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
