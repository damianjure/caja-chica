import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("bot-modules smoke test", () => {
  it("registerBotHandlers is a function", async () => {
    const { registerBotHandlers } = await import("../src/bot/index.ts");
    assert.strictEqual(typeof registerBotHandlers, "function");
  });

  it("registerMenuHandlers is a function", async () => {
    const { registerMenuHandlers } = await import("../src/bot/menu.ts");
    assert.strictEqual(typeof registerMenuHandlers, "function");
  });

  it("registerMovementHandlers is a function", async () => {
    const { registerMovementHandlers } = await import("../src/bot/commands/movements.ts");
    assert.strictEqual(typeof registerMovementHandlers, "function");
  });

  it("registerEntityHandlers is a function", async () => {
    const { registerEntityHandlers } = await import("../src/bot/commands/entities.ts");
    assert.strictEqual(typeof registerEntityHandlers, "function");
  });

  it("registerReportHandlers is a function", async () => {
    const { registerReportHandlers } = await import("../src/bot/commands/reports.ts");
    assert.strictEqual(typeof registerReportHandlers, "function");
  });

  it("registerRecurringHandlers is a function", async () => {
    const { registerRecurringHandlers } = await import("../src/bot/commands/recurring.ts");
    assert.strictEqual(typeof registerRecurringHandlers, "function");
  });

  it("registerExtractionHandlers is a function", async () => {
    const { registerExtractionHandlers } = await import("../src/bot/extraction.ts");
    assert.strictEqual(typeof registerExtractionHandlers, "function");
  });
});
