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

test("editor con manage_empresas puede borrar empresas (default ON)", () => {
  // delete_empresa now requires manage_empresas (default ON for editors).
  // Editor can DISABLE manage_empresas to prevent empresa management.
  const editorDefault2: MemberContext = {
    role: "editor",
    permissions: {},
    user_id: "editor-1",
  };
  assert.equal(can(editorDefault2, "delete_empresa"), true);

  const editorWithEmpresasOff: MemberContext = {
    role: "editor",
    permissions: { manage_empresas: false },
    user_id: "editor-1",
  };
  assert.equal(can(editorWithEmpresasOff, "delete_empresa"), false);
});

test("editor NO puede usar Drive sin toggle", () => {
  assert.equal(can(editorDefault, "export_drive"), false);
});

test("editor NO puede invitar a Telegram sin toggle", () => {
  assert.equal(can(editorDefault, "invite_telegram"), false);
});

test("editor con delete_any puede borrar movimientos de otros", () => {
  assert.equal(can(editorWithDeleteAny, "delete_any_movimiento"), true);
});

test("editor con export_drive puede subir a Drive", () => {
  assert.equal(can(editorWithDrive, "export_drive"), true);
});

test("editor con invite_telegram puede generar tokens", () => {
  assert.equal(can(editorWithInviteTelegram, "invite_telegram"), true);
});

test("viewer solo puede leer", () => {
  assert.equal(can(viewer, "read"), true);
  assert.equal(can(viewer, "write_movimiento"), false);
  assert.equal(can(viewer, "delete_own_movimiento"), false);
  assert.equal(can(viewer, "delete_any_movimiento"), false);
  assert.equal(can(viewer, "delete_empresa"), false);
  assert.equal(can(viewer, "export_drive"), false);
  assert.equal(can(viewer, "invite_telegram"), false);
});
