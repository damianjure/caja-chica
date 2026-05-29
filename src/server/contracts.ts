import type { AppRole } from "./validation.ts";

export type AppUserStatus = "active" | "suspended" | "paused" | "blocked";

export interface AppSession {
  userId: string;
  email: string;
  role: AppRole;
  status: AppUserStatus;
  sessionId?: string; // JWT session_id claim — present on real Supabase tokens
}

export type DashboardMemberRole = "owner" | "editor" | "viewer";

export interface DataAccessScope {
  dashboardId: string | null;
  membershipRole: DashboardMemberRole | null;
  memberPermissions: Record<string, boolean>;
}

export interface DashboardMemberSummary {
  id: string;
  user_id: string;
  email: string | null;
  role: DashboardMemberRole;
  status: string;
  created_at: string;
  permissions: Record<string, boolean>;
}

export interface SupabaseLike {
  from(table: string): any;
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: any; error: any }>;
  auth: {
    admin: {
      deleteUser(userId: string): Promise<{ error: any }>;
    };
  };
}

export interface GenAILike {
  models: {
    generateContent(input: {
      model: string;
      contents: string;
      config: { systemInstruction: string };
    }): Promise<{
      text?: string;
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }>;
  };
}
