# Telegram Multiusuario sobre dashboard_id — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que múltiples miembros de un dashboard compartan el bot de Telegram con roles y permisos granulares.

**Architecture:** Nueva tabla `telegram_links` para vínculos editor/viewer con flujo doble-factor; owners siguen flujo legacy (tabla `usuarios`). Helper `can()` centraliza todos los checks de permiso. Bot handlers reemplazan `requireTelegramEditor` con `requireTelegramCan(action)`.

**Tech Stack:** TypeScript, Express, grammY, Supabase (PostgreSQL), node:test

---

## Decisiones de diseño (no cambiar sin justificación)

- **Un vínculo activo por telegram_user_id** — UNIQUE constraint. Cambiar dashboard requiere revocar el anterior.
- **Rol hereda de dashboard_members.role** — consultado en cada request, no cacheado. Cambio en web refleja inmediatamente.
- **Solo owner genera tokens de invitación** (salvo que editor tenga toggle `invite_telegram` activo).
- **Owner sigue flujo legacy** via tabla `usuarios` (sin doble-factor).
- **Editor/Viewer**: flujo doble-factor via `telegram_invite_tokens` → `telegram_links` con `status='pending_owner_confirm'` → owner confirma.
- **3 toggles sobre editor** (solo editor, no viewer, no owner): `delete_any`, `export_drive`, `invite_telegram`.
- **Editor puede borrar propios por default**. Solo owner borra empresas (no override).

---

## File Map

| Archivo | Acción |
|---------|--------|
| `telegram_multi_user_phase.sql` | CREAR — schema DB completo |
| `src/server/permissions.ts` | CREAR — helper `can()` |
| `tests/permissions.test.ts` | CREAR — unit tests de `can()` |
| `src/server/telegramAccess.ts` | MODIFICAR — agregar `permissions` field, check `telegram_links` primero |
| `tests/telegramAccess.test.ts` | MODIFICAR — tests nuevos para resolver multiusuario |
| `src/server/app.ts` | MODIFICAR — 5 endpoints nuevos, tipo `DashboardMemberSummary` con `permissions` |
| `server.ts` | MODIFICAR — bot handlers usan `requireTelegramCan(action)` |
| `src/services/api.ts` | MODIFICAR — tipos y métodos nuevos |
| `src/components/CollaborationPanel.tsx` | MODIFICAR — UI para invitaciones Telegram + toggles |
| `tests/api.test.ts` | MODIFICAR — tests de endpoints nuevos |

---

## Task 1: SQL migration

**Files:**
- Create: `telegram_multi_user_phase.sql`

- [ ] **Step 1: Escribir el archivo SQL**

```sql
-- telegram_multi_user_phase.sql
-- Aplicar en Supabase prod ANTES de deployar el backend.

-- 1. Tabla principal de vínculos Telegram (editor/viewer — flujo nuevo)
CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_user_id bigint NOT NULL,
  telegram_username text,
  dashboard_id uuid NOT NULL,
  app_user_id text NOT NULL,           -- referencias app_users.user_id
  status text NOT NULL DEFAULT 'pending_owner_confirm'
    CHECK (status IN ('pending_owner_confirm', 'active', 'revoked')),
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (telegram_user_id)             -- un vínculo activo por usuario Telegram
);

CREATE INDEX IF NOT EXISTS telegram_links_dashboard_id_idx ON telegram_links(dashboard_id);
CREATE INDEX IF NOT EXISTS telegram_links_app_user_id_idx ON telegram_links(app_user_id);

-- RLS
ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;

-- Leer: solo el backend con service_role
-- No policies para anon — solo service_role bypasses RLS

-- 2. Tokens de invitación (one-shot, TTL 30 min)
CREATE TABLE IF NOT EXISTS telegram_invite_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  dashboard_id uuid NOT NULL,
  target_user_id text NOT NULL,        -- app_users.user_id del invitado
  created_by_user_id text NOT NULL,    -- app_users.user_id del owner/editor con toggle
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 minutes',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'expired'))
);

CREATE INDEX IF NOT EXISTS telegram_invite_tokens_token_idx ON telegram_invite_tokens(token);

ALTER TABLE telegram_invite_tokens ENABLE ROW LEVEL SECURITY;

-- 3. Permisos granulares sobre editor en dashboard_members
ALTER TABLE dashboard_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}';
-- Estructura: { "delete_any": bool, "export_drive": bool, "invite_telegram": bool }

-- 4. Migración: owners existentes con chat vinculado → telegram_links (status=active)
-- Esto preserva el acceso de owners que ya tenían Telegram vinculado.
-- El resolver en código chequea telegram_links PRIMERO, luego usuarios (legacy).
-- No es necesario migrar — el resolver hace fallback automático a usuarios.
-- Esta inserción es opcional y solo es para consistencia futura:
INSERT INTO telegram_links (telegram_user_id, dashboard_id, app_user_id, status, linked_at)
SELECT
  u.chat_id,
  dm.dashboard_id,
  u.user_id,
  'active',
  COALESCE(u.linked_at, now())
FROM usuarios u
JOIN dashboard_members dm
  ON dm.user_id = u.user_id
  AND dm.role = 'owner'
  AND dm.status = 'active'
WHERE u.chat_id IS NOT NULL
  AND u.user_id IS NOT NULL
  AND u.dashboard_id IS NOT NULL
ON CONFLICT (telegram_user_id) DO NOTHING;
```

- [ ] **Step 2: Verificar SQL válido** (solo sintaxis, no ejecutar en prod todavía)

```bash
# Verificación local con psql si está disponible, o simplemente revisar visual
grep -c "CREATE TABLE" telegram_multi_user_phase.sql
# Esperado: 2
```

---

## Task 2: `src/server/permissions.ts` — helper `can()`

**Files:**
- Create: `src/server/permissions.ts`
- Create: `tests/permissions.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

```typescript
// tests/permissions.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { can, type MemberContext } from "../src/server/permissions.ts";

const owner: MemberContext = {
  role: "owner",
  permissions: {},
  user_id: "owner-1",
};

const editorDefault: MemberContext = {
  role: "editor",
  permissions: {},
  user_id: "editor-1",
};

const editorWithDeleteAny: MemberContext = {
  role: "editor",
  permissions: { delete_any: true },
  user_id: "editor-1",
};

const editorWithDrive: MemberContext = {
  role: "editor",
  permissions: { export_drive: true },
  user_id: "editor-1",
};

const editorWithInviteTelegram: MemberContext = {
  role: "editor",
  permissions: { invite_telegram: true },
  user_id: "editor-1",
};

const viewer: MemberContext = {
  role: "viewer",
  permissions: {},
  user_id: "viewer-1",
};

// --- owner ---
test("owner puede hacer todo", () => {
  const actions = [
    "read", "write_movimiento", "delete_own_movimiento",
    "delete_any_movimiento", "delete_empresa",
    "export_drive", "invite_telegram",
  ] as const;
  for (const action of actions) {
    assert.equal(can(owner, action), true, `owner debería poder: ${action}`);
  }
});

// --- editor default ---
test("editor puede leer y escribir por default", () => {
  assert.equal(can(editorDefault, "read"), true);
  assert.equal(can(editorDefault, "write_movimiento"), true);
});

test("editor puede borrar sus propios movimientos por default", () => {
  assert.equal(can(editorDefault, "delete_own_movimiento"), true);
});

test("editor NO puede borrar movimientos ajenos sin toggle", () => {
  assert.equal(can(editorDefault, "delete_any_movimiento"), false);
});

test("editor NUNCA puede borrar empresas aunque tenga todos los toggles", () => {
  const editorFull: MemberContext = {
    role: "editor",
    permissions: { delete_any: true, export_drive: true, invite_telegram: true },
    user_id: "editor-1",
  };
  assert.equal(can(editorFull, "delete_empresa"), false);
});

test("editor NO puede usar Drive sin toggle", () => {
  assert.equal(can(editorDefault, "export_drive"), false);
});

test("editor NO puede invitar a Telegram sin toggle", () => {
  assert.equal(can(editorDefault, "invite_telegram"), false);
});

// --- editor con toggles ---
test("editor con delete_any puede borrar movimientos de otros", () => {
  assert.equal(can(editorWithDeleteAny, "delete_any_movimiento"), true);
});

test("editor con export_drive puede subir a Drive", () => {
  assert.equal(can(editorWithDrive, "export_drive"), true);
});

test("editor con invite_telegram puede generar tokens", () => {
  assert.equal(can(editorWithInviteTelegram, "invite_telegram"), true);
});

// --- viewer ---
test("viewer solo puede leer", () => {
  assert.equal(can(viewer, "read"), true);
  assert.equal(can(viewer, "write_movimiento"), false);
  assert.equal(can(viewer, "delete_own_movimiento"), false);
  assert.equal(can(viewer, "delete_any_movimiento"), false);
  assert.equal(can(viewer, "delete_empresa"), false);
  assert.equal(can(viewer, "export_drive"), false);
  assert.equal(can(viewer, "invite_telegram"), false);
});
```

- [ ] **Step 2: Correr tests — deben fallar**

```bash
npm test -- --test-name-pattern "permissions"
# Esperado: FAIL — permissions.ts no existe
```

- [ ] **Step 3: Implementar `src/server/permissions.ts`**

```typescript
export type TelegramAction =
  | "read"
  | "write_movimiento"
  | "delete_own_movimiento"
  | "delete_any_movimiento"
  | "delete_empresa"
  | "export_drive"
  | "invite_telegram";

export interface MemberPermissions {
  delete_any?: boolean;
  export_drive?: boolean;
  invite_telegram?: boolean;
}

export interface MemberContext {
  role: "owner" | "editor" | "viewer";
  permissions: MemberPermissions;
  user_id: string;
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
    case "delete_empresa":
      return false;
    case "export_drive":
      return !!member.permissions.export_drive;
    case "invite_telegram":
      return !!member.permissions.invite_telegram;
    default:
      return false;
  }
}
```

- [ ] **Step 4: Correr tests — deben pasar**

```bash
npm test -- --test-name-pattern "permissions"
# Esperado: todos PASS
```

- [ ] **Step 5: Commit**

```bash
git add src/server/permissions.ts tests/permissions.test.ts
git commit -m "feat: add permissions helper can() for Telegram multiuser"
```

---

## Task 3: Extender `telegramAccess.ts` — check `telegram_links` primero

**Files:**
- Modify: `src/server/telegramAccess.ts`
- Modify: `tests/telegramAccess.test.ts`

El resolver ahora:
1. Busca en `telegram_links` (status='active') por `telegram_user_id`
2. Si encuentra, lee `dashboard_members` para rol y `permissions`
3. Si no encuentra, cae a `usuarios` (flujo legacy owner)

- [ ] **Step 1: Agregar tests nuevos en `tests/telegramAccess.test.ts`**

Agregar al final del archivo (sin borrar tests existentes):

```typescript
// Tests para flujo multiusuario (telegram_links)

function createMultiuserSupabaseStub(seed: {
  telegramLinks?: unknown[];
  dashboardMembers?: unknown[];
  usuarios?: unknown[];
}) {
  const builder = (table: string) => {
    let rows: unknown[];
    if (table === "telegram_links") rows = [...(seed.telegramLinks ?? [])];
    else if (table === "dashboard_members") rows = [...(seed.dashboardMembers ?? [])];
    else rows = [...(seed.usuarios ?? [])];

    const api: any = {
      select() { return api; },
      eq(column: string, value: unknown) {
        rows = (rows as any[]).filter((r: any) => r[column] === value);
        return api;
      },
      gt(column: string, value: unknown) {
        rows = (rows as any[]).filter((r: any) => r[column] > value);
        return api;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return Promise.resolve({ data: rows, error: null });
      },
    };
    return api;
  };

  return {
    client: { from: (table: string) => builder(table) },
  };
}

test("resolver usa telegram_links cuando existe vínculo activo de editor", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{
      id: "tl-1",
      telegram_user_id: 111,
      telegram_username: "editor_user",
      dashboard_id: "dash-1",
      app_user_id: "app-user-editor",
      status: "active",
      linked_at: "2026-01-01T00:00:00.000Z",
    }],
    dashboardMembers: [{
      user_id: "app-user-editor",
      dashboard_id: "dash-1",
      role: "editor",
      status: "active",
      permissions: { delete_any: false, export_drive: true, invite_telegram: false },
    }],
    usuarios: [], // no debe tocar usuarios
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 111);

  assert.ok(linked, "debe resolver");
  assert.equal(linked!.userId, "app-user-editor");
  assert.equal(linked!.dashboardId, "dash-1");
  assert.equal(linked!.role, "editor");
  assert.deepEqual(linked!.permissions, { delete_any: false, export_drive: true, invite_telegram: false });
});

test("resolver rechaza vínculo pending_owner_confirm — no tiene acceso", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{
      id: "tl-pending",
      telegram_user_id: 222,
      telegram_username: "newuser",
      dashboard_id: "dash-1",
      app_user_id: "app-user-new",
      status: "pending_owner_confirm",
      linked_at: null,
    }],
    dashboardMembers: [],
    usuarios: [],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 222);
  assert.equal(linked, null, "pending no debe tener acceso");
});

test("resolver cae a usuarios legacy cuando no hay telegram_link activo", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [],
    dashboardMembers: [],
    usuarios: [{
      id: "u-legacy",
      user_id: null,
      dashboard_id: null,
      owner_user_id: "owner-legacy",
      chat_id: 333,
      username: "legacy_owner",
      reminders_enabled: true,
      link_token_expires_at: null,
    }],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 333);
  assert.ok(linked, "debe resolver via legacy");
  assert.equal(linked!.ownerUserId, "owner-legacy");
  assert.equal(linked!.userId, null);
});

test("viewer no puede editar (hasTelegramAccess true, canEditViaTelegram false)", async () => {
  const supabase = createMultiuserSupabaseStub({
    telegramLinks: [{
      id: "tl-viewer",
      telegram_user_id: 444,
      telegram_username: "viewer_user",
      dashboard_id: "dash-1",
      app_user_id: "app-user-viewer",
      status: "active",
      linked_at: "2026-01-01T00:00:00.000Z",
    }],
    dashboardMembers: [{
      user_id: "app-user-viewer",
      dashboard_id: "dash-1",
      role: "viewer",
      status: "active",
      permissions: {},
    }],
    usuarios: [],
  });

  const linked = await resolveTelegramIdentityByChatId(supabase.client, 444);
  assert.ok(linked);
  assert.equal(hasTelegramAccess(linked), true);
  assert.equal(canEditViaTelegram(linked), false);
  assert.equal(linked!.role, "viewer");
});
```

- [ ] **Step 2: Correr tests — deben fallar** (resolver no busca telegram_links todavía)

```bash
npm test -- --test-name-pattern "telegram_links|multiusuario|resolver usa telegram"
# Esperado: FAIL
```

- [ ] **Step 3: Actualizar `TelegramLinkRecord` y `TelegramSupabaseLike` en `telegramAccess.ts`**

Reemplazar el bloque de interfaces al inicio del archivo:

```typescript
import { isMissingSchemaArtifactError } from "./errors.ts";
import type { MemberPermissions } from "./permissions.ts";

export interface TelegramSupabaseLike {
  from(table: string): any;
}

export type TelegramDashboardRole = "owner" | "editor" | "viewer";

export interface TelegramLinkRecord {
  id?: string;
  userId: string | null;
  dashboardId: string | null;
  ownerUserId: string | null;
  role: TelegramDashboardRole | null;
  permissions: MemberPermissions;      // NUEVO
  username: string | null;
  remindersEnabled: boolean;
  linkTokenExpiresAt: string | null;
}
```

- [ ] **Step 4: Actualizar `normalizeRecord` para incluir `permissions`**

```typescript
function normalizeRecord(
  raw: any,
  role: TelegramDashboardRole | null,
  permissions: MemberPermissions = {},
): TelegramLinkRecord {
  return {
    id: raw?.id ?? undefined,
    userId: raw?.user_id ?? null,
    dashboardId: raw?.dashboard_id ?? null,
    ownerUserId: raw?.owner_user_id ?? null,
    role,
    permissions,
    username: raw?.username ?? null,
    remindersEnabled: raw?.reminders_enabled ?? true,
    linkTokenExpiresAt: raw?.link_token_expires_at ?? null,
  };
}
```

- [ ] **Step 5: Agregar función `resolveViaNewLinks` que chequea `telegram_links`**

Agregar después de `resolveRoleIfNeeded`:

```typescript
async function resolveViaNewLinks(
  supabase: TelegramSupabaseLike,
  telegramUserId: number,
): Promise<TelegramLinkRecord | null> {
  try {
    const { data: linkRows, error: linkError } = await supabase
      .from("telegram_links")
      .select("id, app_user_id, dashboard_id, telegram_username, status")
      .eq("telegram_user_id", telegramUserId)
      .eq("status", "active")
      .limit(1);

    if (linkError) {
      if (isMissingSchemaArtifactError(linkError)) return null;
      throw linkError;
    }

    const link = linkRows?.[0];
    if (!link) return null;

    const { data: memberRows, error: memberError } = await supabase
      .from("dashboard_members")
      .select("role, status, permissions")
      .eq("user_id", link.app_user_id)
      .eq("dashboard_id", link.dashboard_id)
      .limit(1);

    if (memberError) throw memberError;
    const member = memberRows?.[0];
    if (!member || member.status !== "active") return null;

    return {
      id: link.id,
      userId: link.app_user_id,
      dashboardId: link.dashboard_id,
      ownerUserId: null,
      role: member.role as TelegramDashboardRole,
      permissions: (member.permissions as MemberPermissions) ?? {},
      username: link.telegram_username ?? null,
      remindersEnabled: true,
      linkTokenExpiresAt: null,
    };
  } catch (error) {
    if (isMissingSchemaArtifactError(error)) return null;
    throw error;
  }
}
```

- [ ] **Step 6: Actualizar `resolveTelegramIdentityByChatId` — chequea `telegram_links` primero**

Reemplazar la función completa:

```typescript
export async function resolveTelegramIdentityByChatId(
  supabase: TelegramSupabaseLike,
  chatId: number,
): Promise<TelegramLinkRecord | null> {
  // 1. Flujo nuevo: editor/viewer via telegram_links
  const viaNewLinks = await resolveViaNewLinks(supabase, chatId);
  if (viaNewLinks) return viaNewLinks;

  // 2. Flujo legacy: owner via usuarios
  try {
    const { data, error } = await supabase
      .from("usuarios")
      .select(
        "id, user_id, dashboard_id, owner_user_id, username, reminders_enabled, link_token_expires_at",
      )
      .eq("chat_id", chatId)
      .limit(1);
    if (error) throw error;
    const raw = data?.[0];
    if (!raw) return null;
    const role = await resolveRoleIfNeeded(supabase, raw);
    return normalizeRecord(raw, role);
  } catch (error) {
    if (!isMissingSchemaArtifactError(error)) throw error;
  }

  const { data, error } = await supabase
    .from("usuarios")
    .select("id, owner_user_id, username, reminders_enabled, link_token_expires_at")
    .eq("chat_id", chatId)
    .limit(1);
  if (error) throw error;
  const raw = data?.[0];
  return raw ? normalizeRecord(raw, null) : null;
}
```

- [ ] **Step 7: Actualizar `resolveTelegramIdentityByToken` — agrega campo `permissions`**

En ambos `normalizeRecord` calls dentro de esta función, asegurarse de pasar el tercer arg como `{}` (el token lookup sigue siendo solo para owners legacy, no hay permissions aquí):

```typescript
// Ambas llamadas quedan igual pero normalizeRecord ahora devuelve permissions: {}
// No hay cambio funcional — owners legacy no usan el sistema de permissions
```

- [ ] **Step 8: Correr todos los tests de telegramAccess**

```bash
npm test -- --test-name-pattern "Telegram|telegram"
# Esperado: todos PASS (incluyendo tests legacy existentes)
```

- [ ] **Step 9: Commit**

```bash
git add src/server/telegramAccess.ts tests/telegramAccess.test.ts
git commit -m "feat: telegram resolver checks telegram_links before legacy usuarios"
```

---

## Task 4: Nuevos endpoints en `app.ts`

**Files:**
- Modify: `src/server/app.ts`

5 endpoints nuevos:
1. `POST /api/telegram/invite-token` — genera token para miembro del dashboard
2. `GET /api/telegram/links` — lista links del dashboard (activos + pendientes)
3. `POST /api/telegram/links/:id/confirm` — owner confirma vínculo pendiente
4. `DELETE /api/telegram/links/:id` — revoca vínculo
5. `PATCH /api/dashboard/members/:id/permissions` — actualiza toggles de editor

También actualizar `DashboardMemberSummary` para incluir `permissions`.

- [ ] **Step 1: Actualizar `DashboardMemberSummary` interface**

En `src/server/app.ts`, modificar la interface:

```typescript
interface DashboardMemberSummary {
  id: string;
  user_id: string;
  email: string | null;
  role: DashboardMemberRole;
  status: string;
  created_at: string;
  permissions: Record<string, boolean>;   // NUEVO
}
```

- [ ] **Step 2: Actualizar `listDashboardMembers` para incluir `permissions`**

Modificar el `.select(...)` y el mapeo en `listDashboardMembers`:

```typescript
const listDashboardMembers = async (dashboardId: string): Promise<DashboardMemberSummary[]> => {
  const { data, error } = await supabase
    .from("dashboard_members")
    .select("id, user_id, role, status, created_at, permissions")  // agregar permissions
    .eq("dashboard_id", dashboardId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;

  const members = data ?? [];
  const enriched = await Promise.all(
    members.map(async (member: any) => {
      const { data: userRows, error: userError } = await supabase
        .from("app_users")
        .select("user_id, email")
        .eq("user_id", member.user_id)
        .limit(1);
      if (userError) throw userError;
      const user = userRows?.[0] ?? null;
      return {
        id: member.id,
        user_id: member.user_id,
        email: user?.email ?? null,
        role: member.role,
        status: member.status,
        created_at: member.created_at,
        permissions: (member.permissions as Record<string, boolean>) ?? {},  // NUEVO
      } as DashboardMemberSummary;
    }),
  );

  return enriched;
};
```

- [ ] **Step 3: Agregar helper `requireOwnerOrEditorWithToggle` en `app.ts`**

Agregar cerca de `requireSession`:

```typescript
function requireTelegramInviteAccess(
  session: AppSession,
  scope: { dashboardId: string },
): boolean {
  if (session.role === "admin" || session.role === "superadmin") return true;
  if (!scope.dashboardId) return false;
  // Los checks de toggle los hace el caller
  return true;
}
```

- [ ] **Step 4: Agregar los 5 endpoints nuevos en `app.ts`**

Agregar antes del cierre del bloque de routes (buscar `// --- WEBHOOK ---` o similar como referencia):

```typescript
  // POST /api/telegram/invite-token
  // Owner (o editor con invite_telegram toggle) genera token de invitación para un miembro.
  app.post("/api/telegram/invite-token", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
      const scope = await resolveScope(session);
      if (!scope) return res.status(403).json({ error: "forbidden" });

      const { target_user_id } = req.body as { target_user_id?: string };
      if (!target_user_id) return res.status(400).json({ error: "target_user_id requerido" });

      // Verificar que el caller puede invitar
      const isOwner = scope.role === "owner";
      if (!isOwner) {
        // Check toggle invite_telegram
        const { data: callerMember } = await supabase
          .from("dashboard_members")
          .select("permissions")
          .eq("user_id", session.userId)
          .eq("dashboard_id", scope.dashboardId)
          .limit(1);
        const perms = (callerMember?.[0]?.permissions as Record<string, boolean>) ?? {};
        if (!perms.invite_telegram) return res.status(403).json({ error: "sin permiso para invitar" });
      }

      // Verificar que target_user_id es miembro activo del dashboard
      const { data: targetMember, error: tmError } = await supabase
        .from("dashboard_members")
        .select("id, role")
        .eq("user_id", target_user_id)
        .eq("dashboard_id", scope.dashboardId)
        .eq("status", "active")
        .limit(1);
      if (tmError) throw tmError;
      if (!targetMember?.[0]) return res.status(404).json({ error: "miembro no encontrado" });

      // Expirar tokens anteriores del mismo target
      await supabase
        .from("telegram_invite_tokens")
        .update({ status: "expired" })
        .eq("target_user_id", target_user_id)
        .eq("dashboard_id", scope.dashboardId)
        .eq("status", "pending");

      const token = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      const { error: insertError } = await supabase
        .from("telegram_invite_tokens")
        .insert({
          token,
          dashboard_id: scope.dashboardId,
          target_user_id,
          created_by_user_id: session.userId,
          expires_at: expiresAt,
          status: "pending",
        });
      if (insertError) throw insertError;

      return res.json({ token, expires_at: expiresAt });
    } catch (err) {
      console.error("POST /api/telegram/invite-token:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // GET /api/telegram/links
  // Lista links Telegram del dashboard (activos + pendientes).
  app.get("/api/telegram/links", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
      const scope = await resolveScope(session);
      if (!scope) return res.status(403).json({ error: "forbidden" });

      const { data, error } = await supabase
        .from("telegram_links")
        .select("id, telegram_user_id, telegram_username, app_user_id, status, linked_at, created_at")
        .eq("dashboard_id", scope.dashboardId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) throw error;

      return res.json({ links: data ?? [] });
    } catch (err) {
      console.error("GET /api/telegram/links:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // POST /api/telegram/links/:id/confirm
  // Owner confirma un vínculo pending_owner_confirm.
  app.post("/api/telegram/links/:id/confirm", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
      const scope = await resolveScope(session);
      if (!scope || scope.role !== "owner") return res.status(403).json({ error: "solo owner puede confirmar" });

      const { id } = req.params;
      const { data, error } = await supabase
        .from("telegram_links")
        .update({ status: "active", linked_at: new Date().toISOString() })
        .eq("id", id)
        .eq("dashboard_id", scope.dashboardId)
        .eq("status", "pending_owner_confirm")
        .select("id")
        .limit(1);
      if (error) throw error;
      if (!data?.[0]) return res.status(404).json({ error: "link no encontrado o no pendiente" });

      return res.json({ confirmed: true });
    } catch (err) {
      console.error("POST /api/telegram/links/:id/confirm:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // DELETE /api/telegram/links/:id
  // Revoca un vínculo (owner puede revocar cualquiera; miembro puede revocar el propio).
  app.delete("/api/telegram/links/:id", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
      const scope = await resolveScope(session);
      if (!scope) return res.status(403).json({ error: "forbidden" });

      const { id } = req.params;

      // Verificar que el link pertenece al dashboard
      const { data: linkRows, error: fetchError } = await supabase
        .from("telegram_links")
        .select("id, app_user_id")
        .eq("id", id)
        .eq("dashboard_id", scope.dashboardId)
        .limit(1);
      if (fetchError) throw fetchError;
      const link = linkRows?.[0];
      if (!link) return res.status(404).json({ error: "link no encontrado" });

      // Solo owner puede revocar links ajenos
      if (scope.role !== "owner" && link.app_user_id !== session.userId) {
        return res.status(403).json({ error: "solo owner puede revocar links de otros" });
      }

      const { error: updateError } = await supabase
        .from("telegram_links")
        .update({ status: "revoked" })
        .eq("id", id);
      if (updateError) throw updateError;

      return res.json({ revoked: true });
    } catch (err) {
      console.error("DELETE /api/telegram/links/:id:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  // PATCH /api/dashboard/members/:id/permissions
  // Owner actualiza los toggles de un miembro editor.
  app.patch("/api/dashboard/members/:id/permissions", requireSession, async (req, res) => {
    try {
      const session = (req as any).session as AppSession;
      const scope = await resolveScope(session);
      if (!scope || scope.role !== "owner") {
        return res.status(403).json({ error: "solo owner puede cambiar permisos" });
      }

      const { id } = req.params;
      const { permissions } = req.body as { permissions?: Record<string, boolean> };
      if (!permissions || typeof permissions !== "object") {
        return res.status(400).json({ error: "permissions requerido (objeto)" });
      }

      // Solo los 3 toggles válidos
      const allowed = ["delete_any", "export_drive", "invite_telegram"];
      const sanitized: Record<string, boolean> = {};
      for (const key of allowed) {
        if (key in permissions) sanitized[key] = Boolean(permissions[key]);
      }

      // Verificar que el miembro pertenece al dashboard y es editor
      const { data: memberRows, error: fetchError } = await supabase
        .from("dashboard_members")
        .select("id, role")
        .eq("id", id)
        .eq("dashboard_id", scope.dashboardId)
        .limit(1);
      if (fetchError) throw fetchError;
      const member = memberRows?.[0];
      if (!member) return res.status(404).json({ error: "miembro no encontrado" });
      if (member.role !== "editor") {
        return res.status(400).json({ error: "permisos granulares solo aplican a editor" });
      }

      const { error: updateError } = await supabase
        .from("dashboard_members")
        .update({ permissions: sanitized })
        .eq("id", id);
      if (updateError) throw updateError;

      return res.json({ permissions: sanitized });
    } catch (err) {
      console.error("PATCH /api/dashboard/members/:id/permissions:", err);
      return res.status(500).json({ error: "internal" });
    }
  });
```

- [ ] **Step 5: Correr lint para verificar tipos**

```bash
npm run lint
# Esperado: sin errores nuevos
```

- [ ] **Step 6: Commit**

```bash
git add src/server/app.ts
git commit -m "feat: add telegram invite, link management, and member permissions endpoints"
```

---

## Task 5: Tests de los endpoints nuevos

**Files:**
- Modify: `tests/api.test.ts`

- [ ] **Step 1: Agregar helpers al stub de Supabase en `tests/api.test.ts`**

Dentro de `createSupabaseStub`, asegurarse que el stub maneje las nuevas tablas. Buscar donde se definen las tablas stub y agregar `telegram_links`, `telegram_invite_tokens`:

```typescript
// En createSupabaseStub, agregar al initialState o donde se inicializan tablas:
telegramLinks: [] as any[],
telegramInviteTokens: [] as any[],
// Y en el builder de tabla mapearlo
```

- [ ] **Step 2: Escribir tests para `/api/telegram/invite-token`**

```typescript
test("owner puede generar invite token para miembro del dashboard", async () => {
  await withServer({
    supabase: createSupabaseStubWith({
      dashboard_members: [
        { id: "dm-owner", user_id: "owner-1", dashboard_id: "dash-1", role: "owner", status: "active", permissions: {} },
        { id: "dm-editor", user_id: "editor-1", dashboard_id: "dash-1", role: "editor", status: "active", permissions: {} },
      ],
      app_users: [
        { user_id: "owner-1", email: "owner@test.com" },
        { user_id: "editor-1", email: "editor@test.com" },
      ],
    }),
    resolveSession: async () => ({ userId: "owner-1", role: "member" }),
  }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/telegram/invite-token`, {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: "editor-1" }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.token, "debe devolver token");
    assert.ok(body.expires_at, "debe devolver expires_at");
  });
});

test("editor sin toggle no puede generar invite token", async () => {
  await withServer({
    supabase: createSupabaseStubWith({
      dashboard_members: [
        { id: "dm-editor", user_id: "editor-1", dashboard_id: "dash-1", role: "editor", status: "active", permissions: {} },
        { id: "dm-viewer", user_id: "viewer-1", dashboard_id: "dash-1", role: "viewer", status: "active", permissions: {} },
      ],
    }),
    resolveSession: async () => ({ userId: "editor-1", role: "member" }),
  }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/telegram/invite-token`, {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ target_user_id: "viewer-1" }),
    });
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 3: Escribir tests para `PATCH /api/dashboard/members/:id/permissions`**

```typescript
test("owner puede cambiar permisos de editor", async () => {
  await withServer({
    supabase: createSupabaseStubWith({
      dashboard_members: [
        { id: "dm-owner", user_id: "owner-1", dashboard_id: "dash-1", role: "owner", status: "active", permissions: {} },
        { id: "dm-editor", user_id: "editor-1", dashboard_id: "dash-1", role: "editor", status: "active", permissions: {} },
      ],
    }),
    resolveSession: async () => ({ userId: "owner-1", role: "member" }),
  }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/dashboard/members/dm-editor/permissions`, {
      method: "PATCH",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { export_drive: true, delete_any: false } }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.permissions.export_drive, true);
    assert.equal(body.permissions.delete_any, false);
  });
});

test("no se puede cambiar permisos de viewer", async () => {
  await withServer({
    supabase: createSupabaseStubWith({
      dashboard_members: [
        { id: "dm-owner", user_id: "owner-1", dashboard_id: "dash-1", role: "owner", status: "active", permissions: {} },
        { id: "dm-viewer", user_id: "viewer-1", dashboard_id: "dash-1", role: "viewer", status: "active", permissions: {} },
      ],
    }),
    resolveSession: async () => ({ userId: "owner-1", role: "member" }),
  }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/dashboard/members/dm-viewer/permissions`, {
      method: "PATCH",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { export_drive: true } }),
    });
    assert.equal(res.status, 400);
  });
});

test("editor no puede cambiar permisos (solo owner)", async () => {
  await withServer({
    supabase: createSupabaseStubWith({
      dashboard_members: [
        { id: "dm-editor", user_id: "editor-1", dashboard_id: "dash-1", role: "editor", status: "active", permissions: {} },
      ],
    }),
    resolveSession: async () => ({ userId: "editor-1", role: "member" }),
  }, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/api/dashboard/members/dm-editor/permissions`, {
      method: "PATCH",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { export_drive: true } }),
    });
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 4: Correr todos los tests**

```bash
npm test
# Esperado: todos PASS (los nuevos pueden fallar si el stub no soporta las nuevas tablas — ajustar stub)
```

- [ ] **Step 5: Commit**

```bash
git add tests/api.test.ts
git commit -m "test: add API tests for telegram invitations and member permissions"
```

---

## Task 6: Bot handlers — `requireTelegramCan(action)`

**Files:**
- Modify: `server.ts`

Reemplazar `requireTelegramEditor` con `requireTelegramCan(action)` que usa el helper `can()`.

- [ ] **Step 1: Importar `can` en `server.ts`**

```typescript
import { can, type TelegramAction } from "./src/server/permissions.ts";
```

- [ ] **Step 2: Reemplazar `requireTelegramEditor` con `requireTelegramCan`**

Buscar la función `requireTelegramEditor` (línea ~336) y reemplazarla:

```typescript
  async function requireTelegramCan(
    ctx: any,
    action: TelegramAction,
  ): Promise<TelegramLinkRecord | null> {
    const linked = await requireLinkedAccount(ctx);
    if (!linked) return null;

    const memberCtx = {
      role: linked.role ?? "viewer",
      permissions: linked.permissions,
      user_id: linked.userId ?? linked.ownerUserId ?? "",
    };

    if (!can(memberCtx, action)) {
      const msgs: Record<TelegramAction, string> = {
        read: "❌ Sin acceso de lectura.",
        write_movimiento: "👀 Solo lectura. Pedile permiso de editor al dueño del dashboard.",
        delete_own_movimiento: "👀 Solo lectura. Sin permiso para borrar.",
        delete_any_movimiento: "🚫 Sin permiso para borrar movimientos de otros.",
        delete_empresa: "🚫 Solo el dueño del dashboard puede borrar empresas.",
        export_drive: "🚫 Sin permiso para subir a Google Drive.",
        invite_telegram: "🚫 Sin permiso para invitar por Telegram.",
      };
      await ctx.reply(msgs[action] ?? "❌ Sin permiso para esta acción.");
      return null;
    }
    return linked;
  }
```

- [ ] **Step 3: Actualizar todos los handlers que usaban `requireTelegramEditor`**

Buscar con `rg -n "requireTelegramEditor" server.ts` y reemplazar cada llamada:

```typescript
// Antes:
const linked = await requireTelegramEditor(ctx);
// Después (ajustar acción según el handler):
const linked = await requireTelegramCan(ctx, "write_movimiento");
// Para borrar:
const linked = await requireTelegramCan(ctx, "delete_own_movimiento");
// Para recurrentes:
const linked = await requireTelegramCan(ctx, "write_movimiento");
// Para agregar empresa:
const linked = await requireTelegramCan(ctx, "write_movimiento");
```

- [ ] **Step 4: Actualizar `canUseDriveViaTelegram` para usar `can()`**

```typescript
  async function canUseDriveViaTelegram(linked: TelegramLinkRecord): Promise<boolean> {
    const memberCtx = {
      role: linked.role ?? "viewer",
      permissions: linked.permissions,
      user_id: linked.userId ?? linked.ownerUserId ?? "",
    };
    if (!can(memberCtx, "export_drive")) return false;

    const ownerUserId = linked.ownerUserId ?? linked.userId;
    if (!ownerUserId) return false;
    const { data } = await supabase
      .from("drive_connections")
      .select("id")
      .eq("owner_user_id", ownerUserId)
      .limit(1);
    return (data?.length ?? 0) > 0;
  }
```

- [ ] **Step 5: Agregar handler para `/start <token>` — flujo invitación nuevo**

Buscar el handler de `/start` con token en `server.ts` y agregar branch para `telegram_invite_tokens`:

```typescript
  // Dentro del handler bot.command("start", ...) o bot.on("message", ...)
  // Cuando se recibe un token, verificar si es de telegram_invite_tokens:
  async function handleTelegramInviteToken(ctx: any, token: string): Promise<boolean> {
    const { data: tokenRows } = await supabase
      .from("telegram_invite_tokens")
      .select("id, dashboard_id, target_user_id, expires_at, status")
      .eq("token", token)
      .eq("status", "pending")
      .limit(1);

    const inviteToken = tokenRows?.[0];
    if (!inviteToken) return false;

    if (new Date(inviteToken.expires_at) < new Date()) {
      await supabase
        .from("telegram_invite_tokens")
        .update({ status: "expired" })
        .eq("id", inviteToken.id);
      await ctx.reply("⏰ El link de invitación venció. Pedile uno nuevo al dueño del dashboard.");
      return true;
    }

    const telegramUserId = ctx.from?.id;
    const telegramUsername = ctx.from?.username ?? null;

    if (!telegramUserId) {
      await ctx.reply("❌ No se pudo identificar tu usuario de Telegram.");
      return true;
    }

    // Crear registro pending en telegram_links
    await supabase
      .from("telegram_links")
      .upsert({
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        dashboard_id: inviteToken.dashboard_id,
        app_user_id: inviteToken.target_user_id,
        status: "pending_owner_confirm",
        linked_at: null,
      }, { onConflict: "telegram_user_id" });

    // Marcar token como claimed
    await supabase
      .from("telegram_invite_tokens")
      .update({ status: "claimed" })
      .eq("id", inviteToken.id);

    await ctx.reply(
      "✅ Solicitud enviada. El dueño del dashboard necesita confirmarte. Te avisamos cuando esté listo.",
    );
    return true;
  }
```

- [ ] **Step 6: Correr lint**

```bash
npm run lint
# Esperado: sin errores
```

- [ ] **Step 7: Commit**

```bash
git add server.ts
git commit -m "feat: bot uses can() for permission checks, add telegram invite token flow"
```

---

## Task 7: `src/services/api.ts` — tipos y métodos nuevos

**Files:**
- Modify: `src/services/api.ts`

- [ ] **Step 1: Agregar tipos nuevos**

```typescript
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

export interface MemberPermissions {
  delete_any?: boolean;
  export_drive?: boolean;
  invite_telegram?: boolean;
}
```

- [ ] **Step 2: Actualizar `DashboardMember` para incluir `permissions`**

```typescript
export interface DashboardMember {
  id: string;
  user_id: string;
  email: string | null;
  role: DashboardMemberRole;
  status: string;
  created_at: string;
  permissions: MemberPermissions;  // NUEVO
}
```

- [ ] **Step 3: Agregar métodos nuevos al objeto `api`**

```typescript
  async generateTelegramInviteToken(targetUserId: string): Promise<TelegramInviteTokenResponse> {
    const res = await this.fetch("/api/telegram/invite-token", {
      method: "POST",
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    return res.json();
  },

  async getTelegramLinks(): Promise<{ links: TelegramLink[] }> {
    const res = await this.fetch("/api/telegram/links");
    return res.json();
  },

  async confirmTelegramLink(linkId: string): Promise<void> {
    await this.fetch(`/api/telegram/links/${linkId}/confirm`, { method: "POST" });
  },

  async revokeTelegramLink(linkId: string): Promise<void> {
    await this.fetch(`/api/telegram/links/${linkId}`, { method: "DELETE" });
  },

  async updateMemberPermissions(
    memberId: string,
    permissions: MemberPermissions,
  ): Promise<{ permissions: MemberPermissions }> {
    const res = await this.fetch(`/api/dashboard/members/${memberId}/permissions`, {
      method: "PATCH",
      body: JSON.stringify({ permissions }),
    });
    return res.json();
  },
```

- [ ] **Step 4: Commit**

```bash
git add src/services/api.ts
git commit -m "feat: add telegram link management and permissions API methods"
```

---

## Task 8: `CollaborationPanel.tsx` — UI multiusuario Telegram

**Files:**
- Modify: `src/components/CollaborationPanel.tsx`

La UI necesita:
1. Por cada miembro (con role `editor`): toggles de permisos (`delete_any`, `export_drive`, `invite_telegram`)
2. Botón "Invitar a Telegram" por cada miembro activo → genera token + muestra link para copiar
3. Sección "Vínculos Telegram": lista links activos/pendientes con botón confirmar/revocar
4. Badge estado: `pending_owner_confirm`, `active`, `revoked`

- [ ] **Step 1: Agregar imports necesarios**

```typescript
import { useState, useMemo, useEffect } from "react";
import { Copy, Loader2, UserPlus, Users, XCircle, MessageCircle, Check, X, Toggle } from "lucide-react";
import {
  api,
  type AppViewer,
  type DashboardInvitationRole,
  type DashboardMembersResponse,
  type MemberPermissions,
  type TelegramLink,
} from "../services/api";
```

- [ ] **Step 2: Agregar estado para telegram links y permisos**

```typescript
  const [telegramLinks, setTelegramLinks] = useState<TelegramLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [generatingTokenFor, setGeneratingTokenFor] = useState<string | null>(null);
  const [generatedToken, setGeneratedToken] = useState<{ userId: string; token: string; expiresAt: string } | null>(null);
  const [updatingPermissions, setUpdatingPermissions] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) return;
    setLoadingLinks(true);
    api.getTelegramLinks()
      .then((r) => setTelegramLinks(r.links))
      .catch(console.error)
      .finally(() => setLoadingLinks(false));
  }, [canManage]);
```

- [ ] **Step 3: Handler para generar token de invitación Telegram**

```typescript
  const handleGenerateTelegramToken = async (userId: string) => {
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
```

- [ ] **Step 4: Handler para confirmar/revocar link**

```typescript
  const handleConfirmLink = async (linkId: string) => {
    setError(null);
    try {
      await api.confirmTelegramLink(linkId);
      setNotice("Vínculo confirmado ✅");
      setTimeout(() => setNotice(null), 2500);
      const updated = await api.getTelegramLinks();
      setTelegramLinks(updated.links);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo confirmar.");
    }
  };

  const handleRevokeLink = async (linkId: string) => {
    setError(null);
    try {
      await api.revokeTelegramLink(linkId);
      setNotice("Vínculo revocado");
      setTimeout(() => setNotice(null), 2500);
      const updated = await api.getTelegramLinks();
      setTelegramLinks(updated.links);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo revocar.");
    }
  };
```

- [ ] **Step 5: Handler para toggles de permisos**

```typescript
  const handleTogglePermission = async (
    memberId: string,
    currentPermissions: MemberPermissions,
    key: keyof MemberPermissions,
  ) => {
    setUpdatingPermissions(memberId);
    setError(null);
    try {
      const next = { ...currentPermissions, [key]: !currentPermissions[key] };
      await api.updateMemberPermissions(memberId, next);
      setNotice("Permisos actualizados");
      setTimeout(() => setNotice(null), 2500);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo actualizar permisos.");
    } finally {
      setUpdatingPermissions(null);
    }
  };
```

- [ ] **Step 6: Agregar UI de permisos y Telegram al JSX**

Dentro del mapeo de members, después del email/rol de cada member con role `editor`, agregar:

```tsx
{/* Permisos granulares — solo editor, solo si canManage */}
{member.role === "editor" && canManage && (
  <div className="mt-2 flex flex-wrap gap-2 text-xs">
    {(["delete_any", "export_drive", "invite_telegram"] as const).map((perm) => {
      const labels: Record<string, string> = {
        delete_any: "Borrar ajenos",
        export_drive: "Drive",
        invite_telegram: "Invitar Telegram",
      };
      const active = !!member.permissions?.[perm];
      return (
        <button
          key={perm}
          onClick={() => handleTogglePermission(member.id, member.permissions ?? {}, perm)}
          disabled={updatingPermissions === member.id}
          className={`px-2 py-0.5 rounded-full border text-xs transition-colors ${
            active
              ? "bg-neutral-900 text-white border-neutral-900"
              : "bg-white text-neutral-500 border-neutral-300"
          }`}
        >
          {labels[perm]}
        </button>
      );
    })}
  </div>
)}

{/* Invitar a Telegram */}
{canManage && member.status === "active" && (
  <div className="mt-2">
    <button
      onClick={() => handleGenerateTelegramToken(member.user_id)}
      disabled={generatingTokenFor === member.user_id}
      className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      <MessageCircle className="w-3 h-3" />
      {generatingTokenFor === member.user_id ? "Generando..." : "Invitar a Telegram"}
    </button>
    {generatedToken?.userId === member.user_id && (
      <div className="mt-1 flex items-center gap-2 bg-neutral-50 border border-neutral-200 rounded-lg p-2 text-xs">
        <code className="flex-1 truncate font-mono">
          /start {generatedToken.token}
        </code>
        <button
          onClick={() => navigator.clipboard.writeText(`/start ${generatedToken.token}`)}
          className="text-neutral-500 hover:text-neutral-900"
        >
          <Copy className="w-3 h-3" />
        </button>
      </div>
    )}
  </div>
)}
```

- [ ] **Step 7: Agregar sección "Vínculos Telegram" al final del componente**

```tsx
{/* Sección vínculos Telegram */}
{canManage && (
  <div className="mt-6 space-y-3">
    <h3 className="text-sm font-semibold text-neutral-900">Vínculos Telegram</h3>
    {loadingLinks ? (
      <Loader2 className="w-4 h-4 animate-spin text-neutral-400" />
    ) : telegramLinks.length === 0 ? (
      <p className="text-xs text-neutral-400">Sin vínculos Telegram activos.</p>
    ) : (
      telegramLinks.map((link) => (
        <div key={link.id} className="flex items-center justify-between gap-2 text-sm">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-neutral-400" />
            <span className="text-neutral-700">
              {link.telegram_username ? `@${link.telegram_username}` : `ID ${link.telegram_user_id}`}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              link.status === "active"
                ? "bg-green-100 text-green-700"
                : link.status === "pending_owner_confirm"
                ? "bg-amber-100 text-amber-700"
                : "bg-neutral-100 text-neutral-500"
            }`}>
              {link.status === "active" ? "Activo" : link.status === "pending_owner_confirm" ? "Pendiente" : "Revocado"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {link.status === "pending_owner_confirm" && (
              <button
                onClick={() => handleConfirmLink(link.id)}
                className="p-1 rounded hover:bg-green-50 text-green-600"
                title="Confirmar"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            {link.status !== "revoked" && (
              <button
                onClick={() => handleRevokeLink(link.id)}
                className="p-1 rounded hover:bg-red-50 text-red-500"
                title="Revocar"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))
    )}
  </div>
)}
```

- [ ] **Step 8: Correr lint**

```bash
npm run lint
# Esperado: sin errores (ajustar imports si faltan)
```

- [ ] **Step 9: Commit**

```bash
git add src/components/CollaborationPanel.tsx
git commit -m "feat: collaboration panel shows telegram links and permission toggles"
```

---

## Task 9: Correr suite completa y verificar

- [ ] **Step 1: Correr todos los tests**

```bash
npm test
# Esperado: todos PASS. Si hay fallas en el stub de supabase, ajustar el stub para soportar las nuevas tablas.
```

- [ ] **Step 2: Correr lint completo**

```bash
npm run lint
# Esperado: sin errores
```

- [ ] **Step 3: Commit final si hay ajustes menores**

```bash
git add -p
git commit -m "fix: adjust test stubs for telegram_links and telegram_invite_tokens tables"
```

---

## Checklist de cobertura

| Requisito de diseño | Task |
|---------------------|------|
| Un vínculo por telegram_user_id (UNIQUE) | Task 1 |
| Rol hereda de dashboard_members | Task 3 |
| Solo owner genera tokens (+ toggle) | Task 4 |
| Owner flujo legacy sin cambios | Task 3 (fallback usuarios) |
| Editor/Viewer flujo doble-factor | Task 4 + Task 6 |
| Confirmación owner (pending → active) | Task 4 + Task 8 |
| 3 toggles sobre editor | Task 2 + Task 4 + Task 8 |
| Editor borra propios por default | Task 2 |
| Solo owner borra empresas | Task 2 |
| Feedback "📍 Dashboard: X" en bot | Task 6 (agregar a cada reply) |
| Tests permisos granulares | Task 2 + Task 5 |
| UI toggles en CollaborationPanel | Task 8 |
| UI vínculos pendientes/activos | Task 8 |
