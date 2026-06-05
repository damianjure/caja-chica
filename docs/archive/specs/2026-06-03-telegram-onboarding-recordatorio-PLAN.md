# Telegram Onboarding + Recordatorio desde el bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una persona nueva en el bot reciba una bienvenida coloquial con su nombre y ejemplos por capacidad, y que cualquiera pueda ver/cambiar/desactivar su recordatorio diario desde el bot (botones inline + voz), sincronizado con el dashboard.

**Architecture:** Extiende los módulos puros existentes (`welcome.ts`, `voiceIntent.ts`) y agrega un módulo de comandos nuevo (`commands/reminder.ts`) siguiendo el patrón de `commands/recurring.ts` (InlineKeyboard + `bot.callbackQuery`). El acceso a `app_users.notification_*` se aísla en `reminderPrefs.ts`. Toda la lógica de armado de mensajes/teclados/parsing es pura y testeada con `node --test`.

**Tech Stack:** TypeScript, grammY, Supabase JS, Gemini (`@google/genai`), Node test runner (`node --import tsx --test`).

**Test command:** `node --import tsx --test tests/**/*.test.ts`

---

## File Structure

| File | Responsabilidad |
|---|---|
| `src/bot/welcome.ts` (modify) | Agrega `buildHelpMessage(firstName)` con ejemplos coloquiales; `buildWelcomeMessage` lo incluye |
| `src/bot/reminderPrefs.ts` (create) | `readReminder` / `writeReminder` sobre `app_users.notification_*` |
| `src/bot/reminderText.ts` (create) | Puro: `buildReminderStatusText`, `buildReminderKeyboard`, `parseReminderVoice` |
| `src/bot/commands/reminder.ts` (create) | `registerReminderHandlers`: `/recordatorio` + callbackQueries |
| `src/bot/commands/help.ts` (create) | `registerHelpHandlers`: `/ayuda` |
| `src/bot/voiceIntent.ts` (modify) | Suma intent `recordatorio_config` + `parseReminderSlots` |
| `src/bot/commands/movements.ts` (modify) | `case "recordatorio_config"` en el switch de dispatch |
| `src/bot/quickActions.ts` (modify) | Suma `/recordatorio` y `/ayuda` a `FULL_COMMANDS` |
| `src/bot/index.ts` (modify) | Registra los handlers nuevos |
| `src/bot/menu.ts` (modify) | `gemini` prompt de intent: agrega `recordatorio_config` |
| `src/components/dashboard/tabs/configuracion/PreferenciasSection.tsx` (modify) | Apariencia Opción A (Part 0) |
| `tests/welcome.test.ts` (modify) | Tests de `buildHelpMessage` |
| `tests/reminderText.test.ts` (create) | Tests de status/keyboard/parse |
| `tests/voiceIntent.test.ts` (modify) | Tests de `parseReminderSlots` |

---

## Part 0 — Apariencia Opción A (frontend, sin TDD — verificación por preview)

### Task 0: Reestructurar el bloque Apariencia en PreferenciasSection

**Files:**
- Modify: `src/components/dashboard/tabs/configuracion/PreferenciasSection.tsx` (bloque Tema + PaletteRow, ~líneas 176-186)

- [ ] **Step 1: Reemplazar Tema + 2 PaletteRow por grid de 2 columnas + toggle sistema**

Reemplazar el bloque actual (el `<div>` "Tema" con `ThemeSelector` y los dos `<PaletteRow>`) por:

```tsx
        {/* Apariencia — columna clara / columna oscura, tap = aplica + cambia modo */}
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-[var(--app-text-3)]">Apariencia</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-[var(--app-text-3)] flex items-center gap-1"><Sun className="w-3 h-3" /> Claro</p>
              {LIGHT_PALETTES.map((p) => (
                <PaletteChip key={p.id || "default-light"} option={p} active={lightPalette === p.id}
                  onClick={() => { onSetLightPalette(p.id); onSetThemePreference("light"); }} />
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-[var(--app-text-3)] flex items-center gap-1"><Moon className="w-3 h-3" /> Oscuro</p>
              {DARK_PALETTES.map((p) => (
                <PaletteChip key={p.id || "default-dark"} option={p} active={darkPalette === p.id}
                  onClick={() => { onSetDarkPalette(p.id); onSetThemePreference("dark"); }} />
              ))}
            </div>
          </div>
          <label className="mt-1 flex items-center justify-between rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-1)] px-4 py-3">
            <span className="text-sm text-[var(--app-text-2)]">Seguir el sistema<span className="block text-xs text-[var(--app-text-3)]">Cambia claro/oscuro según tu dispositivo</span></span>
            <input type="checkbox" checked={themePreference === "system"}
              onChange={(e) => onSetThemePreference(e.target.checked ? "system" : (theme as ThemePreference))} />
          </label>
        </div>
```

- [ ] **Step 2: Agregar el componente `PaletteChip` (arriba del componente, junto a `PaletteRow`)**

```tsx
function PaletteChip({ option, active, onClick }: { option: PaletteOption; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
        active ? "border-[var(--app-strong-surface)] bg-[color-mix(in_srgb,var(--app-strong-surface)_12%,var(--app-surface-1))]"
               : "border-[var(--app-border)] bg-[var(--app-surface-1)] hover:border-[var(--app-border-strong)]"}`}>
      <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: option.swatch }} />
      <span className="text-sm font-bold text-[var(--app-text-1)]">{option.label}</span>
    </button>
  );
}
```

- [ ] **Step 3: Asegurar imports** — `Sun, Moon` desde `lucide-react`; `theme` ya es prop; `ThemePreference` ya importado.

- [ ] **Step 4: Verificar en preview** — `preview_start boteado-dev`; loguear; ir a Configuración → Preferencias; confirmar 2 columnas, que tocar una paleta clara cambia a claro y se ve, y el toggle "Seguir el sistema".

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/tabs/configuracion/PreferenciasSection.tsx
git commit -m "feat(boteado): apariencia opción A — columnas claro/oscuro + seguir sistema"
```

---

## Part 1 — Onboarding con ejemplos coloquiales

### Task 1: `buildHelpMessage` con ejemplos por capacidad

**Files:**
- Modify: `src/bot/welcome.ts`
- Test: `tests/welcome.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHelpMessage } from "../src/bot/welcome.ts";

test("buildHelpMessage — saluda con nombre y trae ejemplos clave", () => {
  const msg = buildHelpMessage("Caro");
  assert.match(msg, /Caro/);
  assert.match(msg, /pagué 4500 de luz/i);
  assert.match(msg, /anotalo en personal/i);     // ejemplo personal/empresa
  assert.match(msg, /\/informes/);
  assert.match(msg, /\/recurrente/);
});

test("buildHelpMessage — sin nombre no rompe", () => {
  const msg = buildHelpMessage(null);
  assert.match(msg, /Bienvenid/i);
  assert.doesNotMatch(msg, /undefined/);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --import tsx --test tests/welcome.test.ts`
Expected: FAIL — `buildHelpMessage is not a function`

- [ ] **Step 3: Implementar `buildHelpMessage` (export en `welcome.ts`)**

```ts
export function buildHelpMessage(firstName?: string | null): string {
  const name = firstName?.trim();
  const hi = name ? `¡Buenísimo, ${name}! ` : "¡Buenísimo! ";
  return (
    `${hi}Te cuento rápido cómo cargar todo, en criollo 👇\n\n` +
    `💸 *Hablando normal* (texto o audio):\n` +
    `• "pagué 4500 de luz"\n` +
    `• "gasté 12 lucas en el súper"\n` +
    `• "cobré 30.000 de un laburo, anotalo en personal"\n` +
    `• "me entraron 200 dólares"\n` +
    `• "saqué 5000 de nafta para la empresa Norte"\n\n` +
    `📸 *Foto del ticket*: mandá la foto y yo leo monto, fecha y comercio. Después confirmás.\n\n` +
    `🎙️ *Audio*: mandá un audio diciendo el gasto igual que arriba.\n\n` +
    `📊 */informes*: te armo el resumen.\n` +
    `• "informe de este mes"\n• "gastos de la semana"\n• "saldos"\n\n` +
    `🔁 */recurrente*: cargás algo fijo (alquiler, sueldo) y se anota solo.\n\n` +
    `⏰ */recordatorio*: prendé/apagá el aviso diario y elegí la hora.\n\n` +
    `Cuando quieras volver a ver esto, escribí /ayuda. Y /menu para los botones.`
  );
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --import tsx --test tests/welcome.test.ts`
Expected: PASS

- [ ] **Step 5: Incluir la guía en la bienvenida** — en `buildWelcomeMessage`, reemplazar el `OUTRO` final por la guía:

Cambiar el `return` final de `buildWelcomeMessage` para que, en vez de `OUTRO`, agregue `\n\n${buildHelpMessage(firstName)}`. Mantener el bloque de acceso. (Actualizar los tests existentes de `buildWelcomeMessage` que asserteaban el `OUTRO` viejo: ahora deben asertar que incluye un ejemplo, p.ej. `/pagué 4500 de luz/`.)

- [ ] **Step 6: Correr toda la suite de welcome**

Run: `node --import tsx --test tests/welcome.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/bot/welcome.ts tests/welcome.test.ts
git commit -m "feat(boteado): bot welcome incluye guía coloquial con ejemplos por capacidad"
```

### Task 2: Comando `/ayuda`

**Files:**
- Create: `src/bot/commands/help.ts`
- Modify: `src/bot/index.ts`, `src/bot/quickActions.ts`

- [ ] **Step 1: Crear handler**

```ts
import type { Bot } from "grammy";
import type { BotDeps } from "../deps.ts";
import { buildHelpMessage } from "../welcome.ts";

export function registerHelpHandlers(bot: Bot, _deps: BotDeps) {
  bot.command("ayuda", async (ctx) => {
    await ctx.reply(buildHelpMessage(ctx.from?.first_name), { parse_mode: "Markdown" });
  });
}
```

- [ ] **Step 2: Registrar en `index.ts`** — importar `registerHelpHandlers` y llamarlo dentro de `registerBotHandlers`.

- [ ] **Step 3: Sumar a `FULL_COMMANDS`** en `quickActions.ts`: `{ command: "ayuda", description: "Cómo cargar gastos (ejemplos)" }`.

- [ ] **Step 4: Verificación manual** — (server real con bot) `/ayuda` devuelve la guía. Si no hay entorno bot, validar typecheck: `npm run lint` → sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/bot/commands/help.ts src/bot/index.ts src/bot/quickActions.ts
git commit -m "feat(boteado): comando /ayuda reimprime la guía del bot"
```

---

## Part 2 — Acceso a datos del recordatorio

### Task 3: `reminderPrefs.ts` (read/write)

**Files:**
- Create: `src/bot/reminderPrefs.ts`
- Test: `tests/reminderPrefs.test.ts`

- [ ] **Step 1: Test que falla (con supabase fake)**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readReminder, writeReminder } from "../src/bot/reminderPrefs.ts";

function fakeSupabase(row: any, captured: any = {}) {
  return {
    from() {
      return {
        select() { return this; },
        eq() { return this; },
        single() { return Promise.resolve({ data: row, error: null }); },
        update(patch: any) { captured.patch = patch; return { eq: () => Promise.resolve({ error: null }) }; },
      };
    },
    _captured: captured,
  };
}

test("readReminder — defaults cuando faltan campos", async () => {
  const r = await readReminder(fakeSupabase({}) as any, "u1");
  assert.equal(r.enabled, true);
  assert.equal(r.hour, 21);
  assert.equal(r.minute, 0);
});

test("writeReminder — manda solo el patch dado", async () => {
  const captured: any = {};
  await writeReminder(fakeSupabase({}, captured) as any, "u1", { enabled: false });
  assert.deepEqual(captured.patch, { notification_enabled: false });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --import tsx --test tests/reminderPrefs.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implementar**

```ts
type SupabaseLike = { from(t: string): any };

export interface ReminderState {
  enabled: boolean; telegram: boolean; email: boolean; hour: number; minute: number;
}

export async function readReminder(supabase: SupabaseLike, userId: string): Promise<ReminderState> {
  const { data } = await supabase
    .from("app_users")
    .select("notification_enabled, notification_telegram, notification_email, notification_hour, notification_minute")
    .eq("user_id", userId)
    .single();
  return {
    enabled: data?.notification_enabled ?? true,
    telegram: data?.notification_telegram ?? true,
    email: data?.notification_email ?? false,
    hour: data?.notification_hour ?? 21,
    minute: data?.notification_minute ?? 0,
  };
}

export async function writeReminder(
  supabase: SupabaseLike, userId: string,
  patch: Partial<{ enabled: boolean; telegram: boolean; email: boolean; hour: number; minute: number }>,
): Promise<void> {
  const map: Record<string, string> = {
    enabled: "notification_enabled", telegram: "notification_telegram", email: "notification_email",
    hour: "notification_hour", minute: "notification_minute",
  };
  const dbPatch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) dbPatch[map[k]] = v;
  if (Object.keys(dbPatch).length === 0) return;
  await supabase.from("app_users").update(dbPatch).eq("user_id", userId);
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --import tsx --test tests/reminderPrefs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/reminderPrefs.ts tests/reminderPrefs.test.ts
git commit -m "feat(boteado): reminderPrefs — read/write de notification_* para el bot"
```

---

## Part 3 — Comando `/recordatorio` (botones inline)

### Task 4: Texto de estado + teclado (puro)

**Files:**
- Create: `src/bot/reminderText.ts`
- Test: `tests/reminderText.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReminderStatusText, REMINDER_QUICK_HOURS } from "../src/bot/reminderText.ts";

test("status — activado muestra hora y canal", () => {
  const t = buildReminderStatusText({ enabled: true, telegram: true, email: false, hour: 9, minute: 0 });
  assert.match(t, /Activado/i);
  assert.match(t, /09:00/);
  assert.match(t, /Telegram/i);
});

test("status — desactivado lo dice", () => {
  const t = buildReminderStatusText({ enabled: false, telegram: true, email: false, hour: 9, minute: 0 });
  assert.match(t, /Desactivado/i);
});

test("quick hours fijas 9/12/18/21", () => {
  assert.deepEqual(REMINDER_QUICK_HOURS, [9, 12, 18, 21]);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --import tsx --test tests/reminderText.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implementar `reminderText.ts`**

```ts
import { InlineKeyboard } from "grammy";
import type { ReminderState } from "./reminderPrefs.ts";

export const REMINDER_QUICK_HOURS = [9, 12, 18, 21];

const hh = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

export function buildReminderStatusText(s: ReminderState): string {
  if (!s.enabled) return "⏰ *Recordatorio diario*\n\nEstado: *Desactivado*.\n\nPrendelo cuando quieras 👇";
  const canales = [s.telegram ? "Telegram" : null, s.email ? "Mail" : null].filter(Boolean).join(" + ") || "ninguno";
  return `⏰ *Recordatorio diario*\n\nEstado: *Activado*\nHora: *${hh(s.hour, s.minute)}* (UTC)\nCanal: ${canales}`;
}

export function buildReminderKeyboard(s: ReminderState): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(s.enabled ? "🔕 Desactivar" : "🔔 Activar", s.enabled ? "rem_off" : "rem_on").row();
  if (s.enabled) {
    REMINDER_QUICK_HOURS.forEach((h, i) => {
      kb.text(`${String(h).padStart(2, "0")}:00`, `rem_h:${h}`);
      if (i % 2 === 1) kb.row();
    });
  }
  return kb;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --import tsx --test tests/reminderText.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/reminderText.ts tests/reminderText.test.ts
git commit -m "feat(boteado): reminderText — status + teclado inline (puro, testeado)"
```

### Task 5: Handler `/recordatorio` + callbacks

**Files:**
- Create: `src/bot/commands/reminder.ts`
- Modify: `src/bot/index.ts`, `src/bot/quickActions.ts`

- [ ] **Step 1: Crear handler (patrón de `commands/recurring.ts`)**

```ts
import type { Bot, Context } from "grammy";
import type { BotDeps } from "../deps.ts";
import { requireLinkedAccount } from "../utils.ts";
import { readReminder, writeReminder } from "../reminderPrefs.ts";
import { buildReminderStatusText, buildReminderKeyboard } from "../reminderText.ts";

async function showReminder(ctx: Context, deps: BotDeps, edit: boolean) {
  const linked = await requireLinkedAccount(ctx, deps);   // resuelve userId o responde cómo vincularse
  if (!linked) return;
  const state = await readReminder(deps.supabase, linked.userId);
  const text = buildReminderStatusText(state);
  const kb = buildReminderKeyboard(state);
  if (edit) await ctx.editMessageText(text, { parse_mode: "Markdown", reply_markup: kb });
  else await ctx.reply(text, { parse_mode: "Markdown", reply_markup: kb });
}

export function registerReminderHandlers(bot: Bot, deps: BotDeps) {
  bot.command("recordatorio", (ctx) => showReminder(ctx, deps, false));

  bot.callbackQuery("rem_on", async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(ctx, deps); if (!linked) return;
    await writeReminder(deps.supabase, linked.userId, { enabled: true });
    await showReminder(ctx, deps, true);
  });
  bot.callbackQuery("rem_off", async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(ctx, deps); if (!linked) return;
    await writeReminder(deps.supabase, linked.userId, { enabled: false });
    await showReminder(ctx, deps, true);
  });
  bot.callbackQuery(/^rem_h:(\d{1,2})$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const linked = await requireLinkedAccount(ctx, deps); if (!linked) return;
    const h = Number(ctx.match![1]);
    if (h >= 0 && h <= 23) await writeReminder(deps.supabase, linked.userId, { hour: h, minute: 0 });
    await showReminder(ctx, deps, true);
  });
}
```

> NOTA al ejecutor: verificar la firma real de `requireLinkedAccount` en `src/bot/utils.ts`. Si no resuelve `userId` directo, usar el mismo helper que usa `commands/reports.ts` para obtener el app user id del linked context. Ajustar `linked.userId` al campo correcto.

- [ ] **Step 2: Registrar en `index.ts`** — import + llamada en `registerBotHandlers`.

- [ ] **Step 3: Sumar a `FULL_COMMANDS`** en `quickActions.ts`: `{ command: "recordatorio", description: "Prender/apagar y elegir hora del aviso" }`.

- [ ] **Step 4: Typecheck**

Run: `npm run lint`
Expected: sin errores

- [ ] **Step 5: Commit**

```bash
git add src/bot/commands/reminder.ts src/bot/index.ts src/bot/quickActions.ts
git commit -m "feat(boteado): /recordatorio — ver/activar/desactivar/hora por botones inline"
```

---

## Part 4 — Control del recordatorio por voz/texto

### Task 6: Intent + parsing de slots

**Files:**
- Modify: `src/bot/voiceIntent.ts`
- Test: `tests/voiceIntent.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseReminderSlots } from "../src/bot/voiceIntent.ts";

test("parseReminderSlots — apagar", () => {
  assert.deepEqual(parseReminderSlots({ accion: "desactivar" }), { enabled: false });
});
test("parseReminderSlots — hora 9", () => {
  assert.deepEqual(parseReminderSlots({ accion: "hora", hora: 9 }), { enabled: true, hour: 9, minute: 0 });
});
test("parseReminderSlots — prender", () => {
  assert.deepEqual(parseReminderSlots({ accion: "activar" }), { enabled: true });
});
test("parseReminderSlots — ruido → null", () => {
  assert.equal(parseReminderSlots({ accion: "xyz" }), null);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `node --import tsx --test tests/voiceIntent.test.ts`
Expected: FAIL — `parseReminderSlots is not a function`

- [ ] **Step 3: Implementar** — en `voiceIntent.ts`:
  - Agregar `"recordatorio_config"` al type `BotIntent` y a `KNOWN_INTENTS`.
  - Agregar la función:

```ts
export function parseReminderSlots(
  slots: Record<string, string | number | null>,
): null | { enabled: boolean; hour?: number; minute?: number } {
  const accion = String(slots.accion ?? "").toLowerCase();
  if (accion === "desactivar" || accion === "apagar") return { enabled: false };
  if (accion === "activar" || accion === "prender") return { enabled: true };
  if (accion === "hora") {
    const h = Number(slots.hora);
    if (Number.isInteger(h) && h >= 0 && h <= 23) return { enabled: true, hour: h, minute: 0 };
  }
  return null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `node --import tsx --test tests/voiceIntent.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/bot/voiceIntent.ts tests/voiceIntent.test.ts
git commit -m "feat(boteado): intent recordatorio_config + parseReminderSlots"
```

### Task 7: Prompt de clasificación + dispatch

**Files:**
- Modify: `src/bot/menu.ts` (prompt Gemini de intent — donde se listan los intents posibles)
- Modify: `src/bot/commands/movements.ts` (switch de dispatch, ~línea 477)

- [ ] **Step 1: Sumar `recordatorio_config` al prompt de intents** en `menu.ts` (o donde se construya el prompt que enumera los intents). Describir: "recordatorio_config: cuando la persona quiere prender, apagar o cambiar la hora del recordatorio/aviso diario. slots: accion (activar|desactivar|hora), hora (0-23)".

- [ ] **Step 2: Agregar el case en el switch de `movements.ts`** (junto a los otros `case`):

```ts
      case "recordatorio_config": {
        const { parseReminderSlots } = await import("../voiceIntent.ts");
        const { writeReminder, readReminder } = await import("../reminderPrefs.ts");
        const { buildReminderStatusText, buildReminderKeyboard } = await import("../reminderText.ts");
        const patch = parseReminderSlots(intentResult.slots);
        if (!patch) { await ctx.reply("No te entendí el recordatorio. Probá /recordatorio para verlo con botones."); break; }
        await writeReminder(deps.supabase, linked.userId, patch);
        const state = await readReminder(deps.supabase, linked.userId);
        await ctx.reply(buildReminderStatusText(state), { parse_mode: "Markdown", reply_markup: buildReminderKeyboard(state) });
        break;
      }
```

> NOTA al ejecutor: usar el mismo identificador de app user que el resto del switch (`linked.userId` o el helper equivalente ya usado en `movements.ts`). Si los imports dinámicos no encajan con el estilo del archivo, mover a imports estáticos arriba.

- [ ] **Step 3: Typecheck + suite completa**

Run: `npm run lint && node --import tsx --test tests/**/*.test.ts`
Expected: lint sin errores; todos los tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/bot/menu.ts src/bot/commands/movements.ts
git commit -m "feat(boteado): voz/texto controla el recordatorio (recordatorio_config dispatch)"
```

---

## Self-Review (cobertura vs spec)

- AC1/AC2 (bienvenida con nombre + ejemplos, incl. personal) → Task 1.
- AC3 (/ayuda) → Task 2.
- AC4 (/recordatorio ver) → Task 5 (`showReminder`) + Task 4 (texto).
- AC5 (botones: on/off + hora) → Task 4 + Task 5.
- AC6/AC8-voz (cambio por voz) → Task 6 + Task 7.
- AC7 (sync con dashboard) → Task 3 escribe los mismos `notification_*` que lee el dashboard.
- AC8-edge (sin vínculo) → `requireLinkedAccount` en Task 5/7.
- AC viewer → `requireLinkedAccount` no exige permiso de escritura de datos (preferencia personal).
- Apariencia A → Part 0 / Task 0.

## Manual verification gaps (sin entorno bot en CI)
Los handlers de grammY no se testean unit (requieren bot real). Cobertura unit = funciones puras (welcome, reminderText, reminderPrefs con fake, voiceIntent). Verificación end-to-end del bot: manual contra el bot real tras deploy, o E2E fuera de alcance de este plan.
