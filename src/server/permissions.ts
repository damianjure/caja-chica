export type TelegramAction =
  | "read"
  | "write_movimiento"
  | "delete_own_movimiento"
  | "delete_any_movimiento"
  | "edit_any_movimiento"
  | "delete_empresa"
  | "export_drive"
  | "export_local"
  | "invite_telegram"
  | "manage_empresas"
  | "manage_categorias"
  | "manage_backups"
  | "restore_backups";

export interface MemberPermissions {
  delete_any?: boolean;
  edit_any?: boolean;
  export_drive?: boolean;
  export_local?: boolean;
  invite_telegram?: boolean;
  manage_empresas?: boolean;
  manage_categorias?: boolean;
  manage_backups?: boolean;
  restore_backups?: boolean;
}

export interface MemberContext {
  role: "owner" | "editor" | "viewer";
  permissions: MemberPermissions;
  user_id: string;
}

// Permissions that default to TRUE for editors (backwards-compatible)
const DEFAULT_ON = new Set<keyof MemberPermissions>([
  "export_local",
  "manage_empresas",
  "manage_categorias",
]);

export function editorPerm(perms: MemberPermissions, key: keyof MemberPermissions): boolean {
  const val = perms[key];
  return val !== undefined ? !!val : DEFAULT_ON.has(key);
}

export function can(member: MemberContext, action: TelegramAction): boolean {
  if (member.role === "owner") return true;
  if (member.role === "viewer") return action === "read";

  // editor
  switch (action) {
    case "read":
    case "write_movimiento":
    case "delete_own_movimiento":
      return true;
    case "delete_any_movimiento":
      return !!member.permissions.delete_any;
    case "edit_any_movimiento":
      return !!member.permissions.edit_any;
    case "delete_empresa":
      return editorPerm(member.permissions, "manage_empresas");
    case "export_drive":
      return !!member.permissions.export_drive;
    case "export_local":
      return editorPerm(member.permissions, "export_local");
    case "invite_telegram":
      return !!member.permissions.invite_telegram;
    case "manage_empresas":
      return editorPerm(member.permissions, "manage_empresas");
    case "manage_categorias":
      return editorPerm(member.permissions, "manage_categorias");
    case "manage_backups":
      return !!member.permissions.manage_backups;
    case "restore_backups":
      return !!member.permissions.restore_backups;
    default:
      return false;
  }
}
