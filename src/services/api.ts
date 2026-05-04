import { supabase } from "./supabase";
import type { ReportExportFormat, ReportExportRequest } from "../reports/shared";

const API_BASE = (import.meta as any).env.VITE_API_URL;
if (!API_BASE) {
  throw new Error("VITE_API_URL is required. Set it in your .env file.");
}

export interface ExtractedItem {
  monto: number | null;
  tipo: "ingreso" | "egreso";
  moneda: "ARS" | "USD";
  categoria: string;
  empresa: string | null;
  descripcion: string;
}

export type GeminiResponse =
  | { intent: "REGISTRAR"; items: ExtractedItem[] }
  | { intent: "GESTIONAR_EMPRESA"; action: "ADD" | "DELETE"; companyName: string }
  | { intent: "ELIMINAR_MOVIMIENTO"; target: "last" | string }
  | { intent: "CONSULTAR"; query: string }
  | { error: string };

export interface Movimiento {
  id: string;
  created_at: string;
  tipo: string;
  moneda: string;
  monto: number;
  categoria: string;
  empresa_nombre: string;
  descripcion: string;
  original_text: string;
  conciliado?: boolean;
  conciliado_at?: string | null;
  conciliado_notas?: string | null;
}

export interface Empresa {
  id: string;
  nombre: string;
  created_at: string;
  deleted_at?: string | null;
}

export interface Categoria {
  id: string;
  nombre: string;
  created_at: string;
}

export interface PaginatedMovimientos {
  items: Movimiento[];
  nextCursor: string | null;
}

export interface BotConnectionStatus {
  connected: boolean;
  chatId: string | number | null;
  telegramUsername: string | null;
  linkedAt: string | null;
  remindersEnabled: boolean;
  pendingToken: string | null;
  pendingTokenExpiresAt: string | null;
  telegramDeepLink: string | null;
  manualStartCode: string | null;
}

export type AppRole = "superadmin" | "admin" | "member";
export type AppUserStatus = "active" | "suspended";
export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";
export type DashboardMemberRole = "owner" | "editor" | "viewer";
export type DashboardInvitationRole = "editor" | "viewer";

export interface AppUser {
  user_id: string;
  email: string;
  role: AppRole;
  status: AppUserStatus;
  invited_by: string | null;
  invited_at: string | null;
  created_at: string;
}

export interface AppInvitation {
  id: string;
  email: string;
  role: AppRole;
  status: InvitationStatus;
  invite_token: string;
  invite_url: string;
  expires_at: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface AppViewer {
  id: string;
  email: string;
  role: AppRole;
  status: AppUserStatus;
}

export interface MemberPermissions {
  delete_any?: boolean;
  export_drive?: boolean;
  invite_telegram?: boolean;
}

export interface DashboardMember {
  id: string;
  user_id: string;
  email: string | null;
  role: DashboardMemberRole;
  status: string;
  permissions?: MemberPermissions;
  created_at: string;
}

export interface DashboardInvitation {
  id: string;
  dashboard_id: string;
  email: string;
  role: DashboardInvitationRole;
  status: InvitationStatus;
  invite_token: string;
  invite_url: string;
  expires_at: string | null;
  created_at: string;
  accepted_at: string | null;
}

export interface DashboardMembersResponse {
  dashboardId: string | null;
  members: DashboardMember[];
  invitations: DashboardInvitation[];
}

export interface Presupuesto {
  id: string;
  period: string;
  categoria: string;
  moneda: "ARS" | "USD";
  monto: number;
  owner_user_id: string;
}

export interface ReportExportRecord {
  id: string;
  created_at: string;
  format: ReportExportFormat;
  period_type?: string;
  period_label: string;
  company: string;
  tipo: string;
  moneda: string;
  total_movements: number;
  file_name: string;
  destination?: "local" | "drive";
  drive_url?: string | null;
}

export interface ReportExportResponse {
  format: ReportExportFormat;
  mimeType: string;
  fileName: string;
  contentBase64: string | null;
  driveUrl: string | null;
  record: {
    id: string | null;
    created_at: string;
    totalMovements: number;
    periodLabel: string;
    company: string;
    tipo: string;
    moneda: string;
    destination: "local" | "drive";
    driveUrl: string | null;
  };
}

export interface DriveStatus {
  connected: boolean;
  enabled: boolean;
}

export interface TelegramLink {
  id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  app_user_id: string;
  status: "pending_owner_confirm" | "active" | "revoked";
  linked_at: string | null;
  created_at: string;
}

export interface TelegramInviteTokenResponse {
  token: string;
  expires_at: string;
}

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function fetchApi(path: string, options?: RequestInit) {
  const session = supabase ? await supabase.auth.getSession() : null;
  const accessToken = session?.data.session?.access_token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.error || `API error: ${res.status}`, res.status);
  }
  return res.json();
}

export const api = {
  isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  },

  async getMe(): Promise<AppViewer> {
    return fetchApi("/api/me");
  },

  async getBotConnection(): Promise<BotConnectionStatus> {
    return fetchApi("/api/bot/connection");
  },

  async createBotLinkToken(): Promise<BotConnectionStatus> {
    return fetchApi("/api/bot/connection/link-token", {
      method: "POST",
    });
  },

  async extract(text: string, categories: Categoria[]): Promise<GeminiResponse> {
    return fetchApi("/api/extract", {
      method: "POST",
      body: JSON.stringify({ text, categories }),
    });
  },

  async saveMovimientos(items: ExtractedItem[], originalText: string): Promise<Movimiento[]> {
    return fetchApi("/api/movimientos", {
      method: "POST",
      body: JSON.stringify({ items, originalText }),
    });
  },

  async addEmpresa(nombre: string): Promise<Empresa> {
    return fetchApi("/api/empresas", {
      method: "POST",
      body: JSON.stringify({ nombre }),
    });
  },

  async deleteMovimiento(id: string): Promise<void> {
    return fetchApi(`/api/movimientos/${id}`, { method: "DELETE" });
  },

  async updateMovimiento(
    id: string,
    payload: Partial<{
      monto: number;
      categoria: string;
      empresa: string | null;
      descripcion: string;
      tipo: "ingreso" | "egreso";
      moneda: "ARS" | "USD";
    }>,
  ): Promise<{ ok: boolean }> {
    return fetchApi(`/api/movimientos/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },

  async reconcileMovimiento(
    id: string,
    payload: { conciliado: boolean; notas?: string },
  ): Promise<{ ok: boolean }> {
    return fetchApi(`/api/movimientos/${id}/conciliar`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async deleteLastMovimiento(): Promise<{ ok: boolean; id: string | null }> {
    return fetchApi("/api/movimientos/last", { method: "DELETE" });
  },

  async deleteAllMovimientos(): Promise<void> {
    return fetchApi("/api/movimientos/all", { method: "DELETE" });
  },

  async deleteEmpresa(id: string): Promise<void> {
    return fetchApi(`/api/empresas/${id}`, { method: "DELETE" });
  },

  async updateEmpresa(id: string, nombre: string): Promise<{ ok: boolean }> {
    return fetchApi(`/api/empresas/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ nombre }),
    });
  },

  async deleteCategoria(id: string): Promise<void> {
    return fetchApi(`/api/categorias/${id}`, { method: "DELETE" });
  },

  async getMovimientos(limit = 100, before?: string | null): Promise<PaginatedMovimientos> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (before) params.set("before", before);
    return fetchApi(`/api/movimientos?${params.toString()}`);
  },

  async getEmpresas(): Promise<Empresa[]> {
    return fetchApi("/api/empresas");
  },

  async getPresupuestos(period?: string): Promise<Presupuesto[]> {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return fetchApi(`/api/presupuestos${suffix}`);
  },

  async savePresupuesto(payload: Omit<Presupuesto, "id" | "owner_user_id">): Promise<Presupuesto> {
    return fetchApi("/api/presupuestos", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getCategorias(): Promise<Categoria[]> {
    return fetchApi("/api/categorias");
  },

  async getReportExports(): Promise<ReportExportRecord[]> {
    return fetchApi("/api/report-exports");
  },

  async exportReport(payload: ReportExportRequest & { destination?: "local" | "drive" }): Promise<ReportExportResponse> {
    return fetchApi("/api/report-exports", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async getDriveStatus(): Promise<DriveStatus> {
    return fetchApi("/api/drive/status");
  },

  async getDriveAuthUrl(): Promise<{ url: string }> {
    return fetchApi("/api/drive/auth-url");
  },

  async disconnectDrive(): Promise<{ ok: boolean }> {
    return fetchApi("/api/drive/disconnect", { method: "DELETE" });
  },

  async getAdminUsers(): Promise<AppUser[]> {
    return fetchApi("/api/admin/users");
  },

  async getAdminInvitations(): Promise<AppInvitation[]> {
    return fetchApi("/api/admin/invitations");
  },

  async inviteUser(email: string, role: AppRole): Promise<AppInvitation> {
    return fetchApi("/api/admin/invitations", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  async revokeInvitation(invitationId: string): Promise<{ ok: boolean }> {
    return fetchApi(`/api/admin/invitations/${invitationId}/revoke`, {
      method: "POST",
    });
  },

  async getDashboardMembers(): Promise<DashboardMembersResponse> {
    return fetchApi("/api/dashboard/members");
  },

  async inviteDashboardMember(
    email: string,
    role: DashboardInvitationRole,
  ): Promise<DashboardInvitation> {
    return fetchApi("/api/dashboard/invitations", {
      method: "POST",
      body: JSON.stringify({ email, role }),
    });
  },

  async revokeDashboardInvitation(invitationId: string): Promise<{ ok: boolean }> {
    return fetchApi(`/api/dashboard/invitations/${invitationId}/revoke`, {
      method: "POST",
    });
  },

  async generateTelegramInviteToken(targetUserId: string): Promise<TelegramInviteTokenResponse> {
    return fetchApi("/api/telegram/invite-token", {
      method: "POST",
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
  },

  async getTelegramLinks(): Promise<{ links: TelegramLink[] }> {
    return fetchApi("/api/telegram/links");
  },

  async confirmTelegramLink(linkId: string): Promise<void> {
    return fetchApi(`/api/telegram/links/${linkId}/confirm`, { method: "POST" });
  },

  async revokeTelegramLink(linkId: string): Promise<void> {
    return fetchApi(`/api/telegram/links/${linkId}`, { method: "DELETE" });
  },

  async updateMemberPermissions(
    memberId: string,
    permissions: MemberPermissions,
  ): Promise<{ permissions: MemberPermissions }> {
    return fetchApi(`/api/dashboard/members/${memberId}/permissions`, {
      method: "PATCH",
      body: JSON.stringify({ permissions }),
    });
  },
};
