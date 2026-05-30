import test from "node:test";
import assert from "node:assert/strict";

import { buildMainKeyboard, buildGestionarKeyboard } from "../src/bot/keyboards.ts";

function buttons(kb: any) {
  return (kb.inline_keyboard as any[]).flat();
}

test("buildMainKeyboard: sin 'Exportar' duplicado, con 'Informe'", () => {
  const kb = buildMainKeyboard("https://dash");
  const texts = buttons(kb).map((b) => b.text as string);
  assert.ok(texts.some((t) => /Informe/.test(t)), "debe tener Informe");
  assert.ok(!texts.some((t) => /Exportar/.test(t)), "no debe haber botón Exportar (era dup de rp_start)");
});

test("buildMainKeyboard: destructivas NO están al tope, hay 'Gestionar'", () => {
  const kb = buildMainKeyboard("https://dash");
  const cbs = buttons(kb).map((b) => b.callback_data).filter(Boolean) as string[];
  assert.ok(cbs.includes("mng:open"), "debe tener botón Gestionar (mng:open)");
  for (const destructive of ["del_last", "edit_last", "del_emp"]) {
    assert.ok(!cbs.includes(destructive), `${destructive} no debe estar en el teclado principal (va al submenú)`);
  }
});

test("buildMainKeyboard: conserva navegación core + Dashboard url", () => {
  const kb = buildMainKeyboard("https://dash");
  const cbs = buttons(kb).map((b) => b.callback_data).filter(Boolean) as string[];
  for (const core of ["empresas", "categorias", "saldos", "buscar_mode", "qs:hoy", "qs:sem"]) {
    assert.ok(cbs.includes(core), `debe conservar ${core}`);
  }
  const urls = buttons(kb).map((b) => b.url).filter(Boolean) as string[];
  assert.ok(urls.includes("https://dash"), "debe conservar el link al dashboard");
});

test("buildGestionarKeyboard: agrupa las destructivas + volver", () => {
  const kb = buildGestionarKeyboard();
  const cbs = buttons(kb).map((b) => b.callback_data).filter(Boolean) as string[];
  assert.ok(cbs.includes("edit_last"), "editar último");
  assert.ok(cbs.includes("del_last"), "borrar último");
  assert.ok(cbs.includes("del_emp"), "borrar empresa");
  assert.ok(cbs.includes("menu"), "volver al menú");
});
