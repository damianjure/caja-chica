# Delta Spec: invitaciones-unificadas — Personas Unificadas

Fase 1 únicamente. Las tablas `user_invitations` y `dashboard_invitations` no se migran.
El trigger `on_auth_user_created` no se toca.

---

## ADDED Requirements

### Requirement: GET /api/personas — lectura UNION

El endpoint DEBE retornar una lista unificada de personas (invitadas + miembros activos)
del scope del caller, ordenada por `last_action_at DESC`.

Campos de respuesta por ítem:

| Campo | Tipo | Fuente |
|---|---|---|
| `id` | string | `user_invitations.id` ó `dashboard_invitations.id` |
| `type` | `"app"` \| `"dashboard"` | discriminador de tabla |
| `email` | string | campo `email` de la tabla origen |
| `role` | string | `app_role` ó `dashboard role` |
| `status` | `"pending"` \| `"accepted"` \| `"expired"` \| `"revoked"` | derivado server-side |
| `last_action_at` | ISO timestamp | `accepted_at` \| `created_at` fallback |
| `telegram_linked` | boolean | LEFT JOIN `telegram_links` activo |
| `invite_url` | string \| null | token embebido; null si ya aceptada |

Filtros opcionales via query string: `status`, `role`, `scope` (`app`\|`dashboard`).

**Status derivado**: `expired` cuando `expires_at < now()` y status sigue `pending`.
Scope default del caller: superadmin ve UNION completa; owner ve solo su dashboard.

#### Scenario: Owner recupera lista con miembros mixtos

- GIVEN owner con 2 invitaciones dashboard y 1 miembro aceptado
- WHEN `GET /api/personas`
- THEN responde 200 con array de 3 ítems ordenados por `last_action_at DESC`
- AND cada ítem incluye `invite_url` null si status = accepted

#### Scenario: Filtro por status=pending

- GIVEN owner con 1 pending y 1 accepted
- WHEN `GET /api/personas?status=pending`
- THEN responde solo el ítem pending

#### Scenario: Invitación vencida aparece como expired

- GIVEN invite con `expires_at` 8 días atrás y status `pending`
- WHEN `GET /api/personas`
- THEN ítem retorna `status: "expired"`, no `"pending"`

---

### Requirement: POST /api/personas/:id/resend — reenvío de invitación

El endpoint DEBE re-enviar el email de invitación. Solo el invitador original o un
admin del scope MAY invocar este endpoint.

Comportamiento:
- Si el token vigente aún no expiró: reutiliza token existente, envía email.
- Si el token ya expiró: invalida el anterior, genera nuevo token, envía email.
- Rate limit: MUST NOT permitir más de 3 resend por invitación en 24 h.
- MUST rechazar con 403 si el caller no es invitador ni admin del scope.
- MUST rechazar con 409 si la invitación ya fue `accepted`.

#### Scenario: Resend exitoso con token vigente

- GIVEN invite pending con token no vencido, caller = invitador
- WHEN `POST /api/personas/:id/resend`
- THEN responde 200, email enviado vía Brevo, token sin cambios

#### Scenario: Resend con token expirado — rota token

- GIVEN invite con `expires_at` pasado
- WHEN `POST /api/personas/:id/resend`
- THEN token anterior marcado como inválido, nuevo token generado con TTL 7 días
- AND email enviado con nuevo `invite_url`

#### Scenario: Rate limit excedido

- GIVEN invite con 3 resend en las últimas 24 h
- WHEN `POST /api/personas/:id/resend`
- THEN responde 429

#### Scenario: Invitación ya aceptada

- GIVEN invite con status `accepted`
- WHEN `POST /api/personas/:id/resend`
- THEN responde 409

---

### Requirement: PATCH /api/personas/:id/role — cambio de rol

El endpoint DEBE actualizar el rol de un miembro o invitación. Transiciones prohibidas:

- `owner → viewer/editor` (degradar owner) MUST NOT permitirse desde scope dashboard.
- `viewer/editor → superadmin` MUST NOT permitirse desde scope dashboard.
- `member → superadmin` MUST NOT permitirse desde scope dashboard.

MUST rechazar con 403 si el caller no es owner ni superadmin del scope.
MUST rechazar con 422 con mensaje de transición inválida si la transición está prohibida.
Muta la fila en la tabla correcta según el campo `type` del ítem.

#### Scenario: Owner cambia editor a viewer

- GIVEN miembro activo con role `editor`, caller = owner
- WHEN `PATCH /api/personas/:id/role { "role": "viewer" }`
- THEN responde 200, `dashboard_members.role` actualizado

#### Scenario: Intento de degradar owner

- GIVEN persona con role `owner`
- WHEN `PATCH /api/personas/:id/role { "role": "viewer" }`
- THEN responde 422 con `"No se puede degradar un owner desde scope dashboard"`

#### Scenario: Caller sin permisos

- GIVEN caller = viewer
- WHEN `PATCH /api/personas/:id/role`
- THEN responde 403

---

### Requirement: telegram_preauth en POST /api/dashboard/invitations

El campo `telegram_preauth: boolean` es opcional en el body (default `false`).

Cuando `telegram_preauth: true`:
- MUST generar un row en `telegram_invite_tokens` dirigido al email invitado, TTL 24 h.
- MUST incluir `t.me/<TELEGRAM_BOT_USERNAME>?start=<token>` en el email enviado.
- El email SHOULD mostrar el deep link como botón o CTA destacado.

Cuando `telegram_preauth: false` (default): comportamiento idéntico al actual.

La columna `telegram_preauth boolean default false` MUST agregarse a `dashboard_invitations`.

#### Scenario: Invite con telegram_preauth=true

- GIVEN owner invita `nuevo@mail.com` con `telegram_preauth: true`
- WHEN `POST /api/dashboard/invitations`
- THEN row insertado en `telegram_invite_tokens` con TTL 24h
- AND email enviado contiene deep link `t.me/...?start=<token>`

#### Scenario: Invite con telegram_preauth omitido (default)

- GIVEN owner invita sin campo `telegram_preauth`
- WHEN `POST /api/dashboard/invitations`
- THEN email enviado sin deep link Telegram
- AND no se inserta row en `telegram_invite_tokens`

---

### Requirement: WelcomeJoined — componente para joiners de dashboard

El componente MUST mostrarse cuando `/api/me` retorna `is_dashboard_joiner: true`.
MUST mostrar: "Estás en el dashboard de {dashboard_name}" y nombre del owner.
MUST NOT disparar demo seed ni purgeDemoData.
MUST ofrecer botón "Vincular Telegram" con deep link pre-cargado si el joiner
recibió `telegram_preauth` (consulta `/api/me` para `telegram_deep_link` si presente).

`is_dashboard_joiner` MUST derivarse en `GET /api/me` como `true` cuando el usuario
tiene membresía activa en `dashboard_members` Y `membershipRole !== null` (no owner legacy).

#### Scenario: Joiner ingresa por primera vez

- GIVEN usuario aceptó invite dashboard, sin membresía previa
- WHEN `GET /api/me` retorna `is_dashboard_joiner: true`
- THEN `WelcomeJoined` se monta con nombre del owner/dashboard
- AND `WelcomeWizard` (demo seed) NO se monta

#### Scenario: Joiner con telegram_preauth previo

- GIVEN joiner con `telegram_deep_link` en `/api/me`
- WHEN `WelcomeJoined` se renderiza
- THEN botón "Vincular Telegram" visible con href = deep link

---

### Requirement: Cron reminder de invitaciones pendientes

Un job diario a las 10:00 hs UTC MUST enviar un email de recordatorio a invitados
pending cuando:
- Han pasado > 3 días desde `created_at` o último `last_reminder_at`.
- Han pasado < 7 días desde `created_at` (no reenviar post-expiración natural).
- `last_reminder_at` del día de hoy es NULL (idempotencia: 1 reminder por día por invite).

Aplica a `user_invitations` y `dashboard_invitations`. Requiere columna
`last_reminder_at timestamptz` en ambas tablas.

#### Scenario: Invite pending 4 días sin reminder previo

- GIVEN invite con `created_at` hace 4 días, `last_reminder_at` NULL
- WHEN cron corre a las 10:00 UTC
- THEN email de reminder enviado, `last_reminder_at` actualizado a now()

#### Scenario: Reminder ya enviado hoy

- GIVEN invite con `last_reminder_at` = hoy
- WHEN cron corre
- THEN NO se envía email adicional

#### Scenario: Invite expirado (> 7 días)

- GIVEN invite con `created_at` hace 8 días
- WHEN cron corre
- THEN NO se envía reminder

---

### Requirement: Consolidación form de invitación

`CollaborationPanel` MUST ser la única fuente del form de invitación.
`ConfiguracionTab` MUST NOT duplicar el form; en su lugar MUST mostrar un link
o importar `CollaborationPanel` directamente.
El comportamiento funcional del form no cambia en fase 1.

#### Scenario: ConfiguracionTab no tiene form propio

- GIVEN usuario en ConfiguracionTab
- WHEN navega a sección de colaboradores
- THEN ve el form gestionado por `CollaborationPanel` (no una copia independiente)

---

### Requirement: invite_url en response de POST invite

`POST /api/dashboard/invitations` y `POST /api/admin/invitations` MUST incluir
`invite_url` en el response body además del `id`.

La UI MUST mostrar "Copiar link" como acción prominente (antes o junto a "Enviar email").

#### Scenario: Owner crea invite y copia link

- GIVEN owner crea invitación nueva
- WHEN `POST /api/dashboard/invitations` responde 201
- THEN body contiene `{ id, invite_url, ... }`
- AND UI muestra botón "Copiar link" con ese URL en clipboard al clickear

---

## MODIFIED Requirements

### Requirement: ensureOnboardingSeed — exclusión de joiners

El hook `ensureOnboardingSeed` en `requireSession` SHOULD NOT correr seed demo para
usuarios cuyo `is_dashboard_joiner` es `true`.
(Previously: hook corría para cualquier member con `onboarding_state = pending`.)

#### Scenario: Joiner no recibe demo seed

- GIVEN usuario con membresía dashboard activa (`is_dashboard_joiner: true`), `onboarding_state = pending`
- WHEN request autenticado pasa por `requireSession`
- THEN `seedDemoData` NO se invoca
- AND `onboarding_state` permanece `pending` (no se transiciona a `seeded`)

#### Scenario: Member sin dashboard compartido recibe seed normalmente

- GIVEN usuario sin membresía dashboard, `onboarding_state = pending`
- WHEN request pasa por `requireSession`
- THEN `seedDemoData` se invoca como hasta ahora
