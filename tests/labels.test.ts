import test from "node:test";
import assert from "node:assert/strict";

import { formatIdentity, initialsFromEmail } from "../src/services/labels.ts";

// formatIdentity — usado en el header. Debe manejar dashboardRole null sin "null".
test("formatIdentity: con dashboardRole → app · rol scope", () => {
  assert.equal(formatIdentity("superadmin", "owner"), "Super Admin · Dueño de este dashboard");
  assert.equal(formatIdentity("member", "editor"), "Dueño · Puede editar este dashboard");
});

test("formatIdentity: sin dashboardRole (null) → solo app, sin 'null'", () => {
  const r = formatIdentity("member", null);
  assert.equal(r, "Dueño");
  assert.doesNotMatch(r, /null/);
});

// initialsFromEmail — inicial del avatar (Header C). Determinístico.
test("initialsFromEmail: primera letra alfanumérica en mayúscula", () => {
  assert.equal(initialsFromEmail("damianjure@gmail.com"), "D");
  assert.equal(initialsFromEmail("ana@x.com"), "A");
  assert.equal(initialsFromEmail("ANA@x.com"), "A");
  assert.equal(initialsFromEmail("123@x.com"), "1");
});

test("initialsFromEmail: vacío o inválido → '?'", () => {
  assert.equal(initialsFromEmail(""), "?");
  assert.equal(initialsFromEmail("@x.com"), "?");
});
