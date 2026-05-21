# Proposal: invitaciones-unificadas

## 1. Intent

Hoy Caja Chica tiene **tres flujos de invitación paralelos** sin narrativa común: app-level (superadmin), dashboard (owner → colaborador) y Telegram (owner → colaborador ya aceptado). El owner termina siendo el integrador mental: invita por mail, espera que el otro acepte, le manda manualmente el `/start <token>` por WhatsApp, confirma en otra pestaña.

**Problema concreto**:

- No hay una página "Personas" donde el owner vea el estado real de cada invitado (¿le llegó el mail? ¿está pending? ¿ya vinculó Telegram?).
- El form de invitar está duplicado en `CollaborationPanel.tsx` y `ConfiguracionTab.tsx` — drift garantizado.
- No existe **resend** ni **edit role** sobre invitaciones pending — si te equivocaste, la única salida es revocar y empezar de cero.
- El link copiable (`/?invite=<token>`) está disponible pero escondido detrás del email; debería ser **primera opción** (paridad con Notion/Linear/Figma: "copy invite link" es el botón primario).
- El que acepta una invitación de dashboard hoy entra al `WelcomeWizard` que le siembra **demo data** que después tiene que purgar — sin sentido para alguien que ya está entrando a un dashboard real con datos.
- El token de Telegram se muestra como string crudo `/start xxx`; no como deep link `t.me/<bot>?start=xxx`.

**Por qué ahora**: la base multiusuario está deployada y estable (Bloque 2 Telegram + dashboard compartido + permisos granulares). La fricción ya no es técnica, es de UX: el producto crece y la coordinación de invitaciones se vuelve el cuello de botella visible.

**Éxito**: el owner gestiona toda la relación con cada persona desde una sola página, con el mismo lenguaje visual que usan los productos de referencia.

## 2. Scope

### IN (Fase 1)

- Página **Personas** unificada que lista app-level invitations + dashboard members/invitations + Telegram links con status computado.
- Endpoint `GET /api/personas` que hace UNION cross-table y devuelve `PersonaRecord[]` con `invitation_status` y `last_action_at` derivados.
- Endpoint `POST /api/personas/:id/resend` que re-dispara mail (Brevo) según tipo de invitación.
- Endpoint `PATCH /api/personas/:id/role` para mutar rol sobre invitaciones pending.
- **Copy invite link** como CTA primario en el form (botón "Copiar link" antes que "Enviar mail").
- Flag `telegram_preauth: bool` en `POST /api/dashboard/invitations` que crea `telegram_invite_tokens` inmediatamente y embebe deep link `t.me/<bot>?start=<token>` en el mail de invitación.
- Componente `WelcomeJoined` (sin demo seed) para colaboradores aceptados, separado del `WelcomeWizard` actual (owners).
- Flag `is_dashboard_joiner` en `GET /api/me` para decidir qué wizard mostrar.
- Exclusión de demo seed para joiners en `ensureOnboardingSeed`.
- **Reminder cron** diario que re-envía mail a invitaciones pending con más de 3 días.
- **Consolidación** del form duplicado: `ConfiguracionTab.tsx` deja de renderizar el form propio y delega/linkea a Personas.

### OUT (Fase 2 — iteración separada)

- **Link público scoped con uses limit** (estilo "anyone with the link can join") — requiere threat model: rate-limit por IP, captcha, expiración corta, scope dashboard.
- **Match por token loose** en lugar de email estricto — hoy `syncPendingDashboardInvitations` matchea por email; cambiar a match por token tiene implicancias de seguridad (token leak = takeover) que merecen diseño dedicado.
- **Renombrar tablas o cambiar el trigger SQL** `on_auth_user_created` — fuera de scope.
- Notificaciones push/in-app cuando el invitado acepta — nice to have, no bloqueante.

## 3. Approach

**Enfoque C (Additive Unified Read + Targeted Mutations)** — recomendado en exploración.

### Razón

- `user_invitations` es load-bearing en el trigger SQL `on_auth_user_created`. Tocar eso requiere migración DB + trigger rewrite — riesgo alto sin retorno proporcional.
- `dashboard_invitations` tiene `dashboard_id` y `user_invitations` no; un endpoint polimórfico (Approach B) genera más complejidad que la que resuelve.
- Approach A (solo UI aggregator) no permite agregar resend/edit-role/reminder cron limpiamente.

### Lo que hacemos

1. **Capa nueva encima**: `GET /api/personas` hace UNION de `user_invitations` + `dashboard_invitations` + LEFT JOIN a `telegram_links` y `dashboard_members` para enriquecer status. Devuelve forma única `PersonaRecord`.
2. **Mutaciones puntuales**: `resend` y `role` enrutan internamente a la tabla correcta vía discriminador `type: "app" | "dashboard"`.
3. **Existing endpoints intactos**: `POST /api/admin/invitations`, `POST /api/dashboard/invitations`, `POST /api/telegram/invite-token` no cambian su contrato (excepto el nuevo flag `telegram_preauth` opt-in en el dashboard one).
4. **Frontend nuevo**: página Personas en `src/components/personas/` con tabla unificada, form con copy-link primero, secciones por status.
5. **Onboarding split**: `WelcomeWizard` (owners) sigue igual; `WelcomeJoined` nuevo para colaboradores.
6. **Cron tercero**: agrego al runtime (`server.ts`) un `cron.schedule('0 10 * * *', ...)` que busca invitaciones pending > 3 días y re-envía email.

### Qué NO hacemos

- NO tocamos el SQL trigger.
- NO renombramos tablas.
- NO migramos a un esquema polimórfico.
- NO removemos los endpoints viejos (compat).

## 4. Stakeholders & Users

- **Superadmin** (`damianjure@gmail.com`): invita app-level. Necesita ver todas las invitaciones de la app desde un solo lugar (subset de Personas en modo admin).
- **Owner** (cuenta nueva post-cutover): invita colaboradores a su dashboard + opcionalmente pre-autoriza Telegram. Cliente principal de Personas page.
- **Editor con `invite_telegram: true`**: puede generar invites Telegram. Aparece en Personas como persona con capacidades, no como invitador.
- **Invitee** (recibe invitación): hoy entra a un wizard que le siembra datos demo. Tras este cambio, ve `WelcomeJoined` contextual (qué dashboard, quién lo invitó, próximos pasos).

## 5. Constraints

- **Scope resolver legacy**: respeta `owner_user_id` cuando no hay `dashboard_members` (cuentas pre-migración). El UNION debe contemplar este caso.
- **Brevo único transport**: nuevo endpoint `resend` reutiliza `sendAppInvitationEmail()` y `sendDashboardInvitationEmail()`. NO se agregan deps.
- **Tests**: Node native runner (`node --import tsx --test`). Mantener 156/156 verde + cobertura nueva para `GET /api/personas`, resend, role edit, `is_dashboard_joiner`, reminder cron logic.
- **Single-instance Cloud Run**: Maps en memoria siguen OK (no agregamos sessions nuevos en este cambio; reminder cron usa DB query directo).
- **Strict TDD**: enabled. Test primero para cada endpoint nuevo y para la lógica de status derivation.
- **Sin migración SQL** en fase 1. Si fase 2 introduce tabla nueva (ej: tracking de reminders enviados), va en patch separado.
- **No romper trigger `on_auth_user_created`** — sigue leyendo `user_invitations` por email.

## 6. Success Criteria (observable)

La fase 1 está terminada cuando:

1. La página **Personas** muestra una lista unificada con: email, tipo (app/dashboard), rol, status (pending/active/expired/revoked), `last_action_at`, vínculo Telegram (sí/no/pending), y acciones por fila (copy link, resend, edit role, revoke).
2. **Form de invitación**: el botón primario es "Copiar link"; el secundario es "Enviar mail". Ambos accesibles desde Personas.
3. `POST /api/personas/:id/resend` dispara un email real vía Brevo verificable en logs/Brevo dashboard.
4. `PATCH /api/personas/:id/role` actualiza el rol en la tabla correcta sobre una invitación pending; un test asserta el row mutado.
5. Cuando un nuevo colaborador acepta dashboard invite y entra por primera vez, ve `WelcomeJoined` (NO el wizard con demo data). `ensureOnboardingSeed` no le siembra registros `is_demo=true`.
6. `GET /api/me` retorna `is_dashboard_joiner: true` para esos casos.
7. Si owner manda invite con `telegram_preauth: true`, el email contiene un link `t.me/<bot>?start=<token>` clickeable. El invitee al hacer click va al bot, el bot crea `telegram_links` con `pending_owner_confirm`, owner confirma desde Personas.
8. **Reminder cron**: invitaciones pending con `created_at < now() - 3 días` y no aceptadas reciben un segundo email. Logs lo muestran.
9. `CollaborationPanel.tsx` ya no contiene el form de invitar — solo lista miembros activos. El form vive en Personas page.
10. `ConfiguracionTab.tsx` ya no duplica el form de invitar — linkea a Personas.
11. Tests: suite verde, cobertura para los 3 endpoints nuevos + reminder cron + WelcomeJoined branching.

## 7. Risks & Mitigations

| # | Riesgo | Mitigación |
|---|--------|------------|
| 1 | Auth trigger DB-level es difícil de cambiar (`user_invitations` canónico) | NO lo tocamos. Approach C es additive — el trigger sigue leyendo `user_invitations` por email como hoy. |
| 2 | `syncPendingDashboardInvitations` matchea por email, falla silenciosamente con aliases (`me+tag@gmail.com`) | Documentar como limitación conocida en spec. Agregar log warning cuando un `GET /api/me` no matchea y existe invitación pending con email "similar" (Levenshtein simple, opcional). Fuera de scope: normalización de alias. |
| 3 | Telegram pre-auth + pivot guard: si invitee abre deep link ANTES de Google login, no existe `app_users` row → orphan `telegram_links` | En `handleTelegramInviteToken`, si `target_user_id` apunta a un `app_users` que no existe aún, **guardar el token como pending un poco más** (extender TTL a 24h cuando viene de `telegram_preauth`) y reintentar match al primer `GET /api/me`. Alternativa: bot responde "Primero ingresá con Google al dashboard, después volvé a clickear el link". Decisión final en spec. |
| 4 | Dashboard joiners reciben demo data | `ensureOnboardingSeed` checkea `is_dashboard_joiner`: si true, set `onboarding_state='completed'` directo, sin seed. Test explícito. |
| 5 | Form duplicado en `CollaborationPanel` + `ConfiguracionTab` drift | Consolidación es parte del scope IN. El form vive solo en Personas. Los otros dos componentes linkean ("Gestionar personas →"). |
| 6 | UNION cross-table: `user_invitations` tiene TTL 7d, `dashboard_invitations` no | La lógica de derivación de status vive **server-side** en `GET /api/personas` y es uniforme: `expired = expires_at IS NOT NULL AND expires_at < now() AND status='pending'`. `user_invitations` sin `dashboard_id` se marcan `dashboard_id: null` en response. Cliente nunca recomputa status. |

## 8. Open Questions

1. **Telegram pre-auth secuencia (Risk 3)**: ¿extender TTL del token a 24h cuando viene de `telegram_preauth=true` y dejar que el primer `GET /api/me` haga el match diferido, o forzar al usuario a loguear primero con un mensaje del bot? La primera opción es mejor UX, la segunda es más simple. **Decisión sugerida**: opción A (TTL 24h + match diferido), pero validar en spec.
2. **Personas page visibility para `member` sin colaboradores**: ¿escondemos la página o mostramos versión vacía con CTA "Invitar a alguien"? Sugerencia: mostrar siempre, vacía es onboarding implícito.
3. **Reminder cron — anti-spam**: ¿enviamos máximo 1 reminder por invitación (a los 3 días) o también a los 7? Sugerencia: solo 1 en fase 1; si se vuelve necesario, agregamos columna `last_reminder_sent_at` en fase 2.
