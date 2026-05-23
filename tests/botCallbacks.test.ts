import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildToggleCallbackData,
  resolveSelectedCompanies,
  buildAlcanceKeyboard,
} from "../src/server/reportBotHelpers.ts";

describe("callback_data stays ≤ 64 bytes", () => {
  it("toggle at index 0 is under 64 bytes", () => {
    const data = buildToggleCallbackData(0);
    assert.ok(data.length <= 64, `expected ≤64 bytes, got ${data.length}: "${data}"`);
  });

  it("toggle at index 99 is under 64 bytes", () => {
    const data = buildToggleCallbackData(99);
    assert.ok(data.length <= 64, `expected ≤64 bytes, got ${data.length}: "${data}"`);
  });

  it("rs:all is under 64 bytes", () => {
    assert.ok("rs:all".length <= 64);
  });

  it("rs:done is under 64 bytes", () => {
    assert.ok("rs:done".length <= 64);
  });
});

describe("resolveSelectedCompanies", () => {
  const choices = [
    { id: "id-a", nombre: "Empresa A" },
    { id: "id-b", nombre: "Empresa B" },
    { id: "id-c", nombre: "Empresa C" },
  ];

  it("empty set → empty array (all companies)", () => {
    const result = resolveSelectedCompanies(new Set(), choices);
    assert.deepEqual(result, []);
  });

  it("single index → correct company name", () => {
    const result = resolveSelectedCompanies(new Set([1]), choices);
    assert.deepEqual(result, ["Empresa B"]);
  });

  it("multiple indices → correct names in order", () => {
    const result = resolveSelectedCompanies(new Set([0, 2]), choices);
    assert.deepEqual(result, ["Empresa A", "Empresa C"]);
  });

  it("out-of-bounds index is silently skipped", () => {
    const result = resolveSelectedCompanies(new Set([0, 99]), choices);
    assert.deepEqual(result, ["Empresa A"]);
  });
});

describe("buildAlcanceKeyboard", () => {
  const choices = [
    { id: "id-a", nombre: "Empresa A" },
    { id: "id-b", nombre: "Empresa B" },
  ];

  it("renders ☐ for unselected, ☑ for selected", () => {
    const kb = buildAlcanceKeyboard(choices, new Set([0]));
    // Expect inline_keyboard rows with button text showing ☑ for idx 0, ☐ for idx 1
    const flat = kb.inline_keyboard.flat();
    const btn0 = flat.find((b: any) => b.callback_data === "rs:tog:0");
    const btn1 = flat.find((b: any) => b.callback_data === "rs:tog:1");
    assert.ok(btn0, "button for index 0 should exist");
    assert.ok(btn1, "button for index 1 should exist");
    assert.ok(btn0.text.startsWith("☑"), `btn0 should be checked, got: ${btn0.text}`);
    assert.ok(btn1.text.startsWith("☐"), `btn1 should be unchecked, got: ${btn1.text}`);
  });

  it("always includes a Listo button with rs:done", () => {
    const kb = buildAlcanceKeyboard(choices, new Set());
    const flat = kb.inline_keyboard.flat();
    const doneBtn = flat.find((b: any) => b.callback_data === "rs:done");
    assert.ok(doneBtn, "Listo button should exist");
  });
});
