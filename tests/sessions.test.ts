import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

// We import from the modules under test. At the time this test is written,
// clearChatSessions and clearPendingExtractionsByChat do NOT yet exist — RED.

describe("clearChatSessions", () => {
  // We need access to the raw Maps to set up state without going through
  // session getters (which enforce TTL).
  let pendingInputSessions: Map<number, unknown>;
  let pendingReportSessions: Map<number, unknown>;
  let pendingRecurrenceSessions: Map<number, unknown>;
  let setInputSession: (chatId: number, kind: string, linked: unknown) => void;
  let clearChatSessions: (chatId: number) => void;
  let createPendingExtraction: (args: {
    chatId: number;
    dashboardId: string | null;
    userId: string | null;
    ownerUserId: string | null;
    data: unknown;
    messageId: number;
  }) => { id: string };
  let getPendingExtraction: (id: string) => unknown;

  before(async () => {
    const sessions = await import("../src/bot/sessions.ts");
    pendingInputSessions = sessions.pendingInputSessions;
    pendingReportSessions = sessions.pendingReportSessions;
    pendingRecurrenceSessions = sessions.pendingRecurrenceSessions;
    setInputSession = sessions.setInputSession;
    // clearChatSessions does NOT exist yet — this import will fail when RED
    clearChatSessions = (sessions as any).clearChatSessions;

    const er = await import("../src/server/extractionReview.ts");
    createPendingExtraction = er.createPendingExtraction;
    getPendingExtraction = er.getPendingExtraction;
  });

  it("clears all four session maps for the given chatId", () => {
    const chatId = 99001;
    const fakeLinked = { userId: "u1", ownerUserId: "u1", dashboardId: null };
    const fakeData = {
      monto: 100,
      moneda: "ARS",
      tipo: "egreso",
      empresa: null,
      cuit: null,
      categoria: "Otros",
      descripcion: "test",
      fecha: null,
      confidence: 1,
      sourceType: "photo",
    };

    // Populate all four stores for chatId
    setInputSession(chatId, "empresa", fakeLinked);
    pendingReportSessions.set(chatId, { step: "temporalidad", period: "month", selectedCompanyIdx: new Set(), linked: fakeLinked, expiresAt: Date.now() + 60_000 } as any);
    pendingRecurrenceSessions.set(chatId, { step: "monto", linked: fakeLinked, expiresAt: Date.now() + 60_000 } as any);
    const extraction = createPendingExtraction({
      chatId,
      dashboardId: null,
      userId: "u1",
      ownerUserId: "u1",
      data: fakeData as any,
      messageId: 1,
    });

    // Precondition: all populated
    assert.ok(pendingInputSessions.has(chatId), "inputSession should exist before clear");
    assert.ok(pendingReportSessions.has(chatId), "reportSession should exist before clear");
    assert.ok(pendingRecurrenceSessions.has(chatId), "recurrenceSession should exist before clear");
    assert.ok(getPendingExtraction(extraction.id) !== null, "extraction should exist before clear");

    // Act
    clearChatSessions(chatId);

    // Assert all cleared
    assert.ok(!pendingInputSessions.has(chatId), "inputSession should be cleared");
    assert.ok(!pendingReportSessions.has(chatId), "reportSession should be cleared");
    assert.ok(!pendingRecurrenceSessions.has(chatId), "recurrenceSession should be cleared");
    assert.strictEqual(getPendingExtraction(extraction.id), null, "extraction should be cleared");
  });

  it("is idempotent — calling on chatId with no sessions does not throw", () => {
    const chatId = 99002;
    // Precondition: nothing in any store for this chatId
    assert.ok(!pendingInputSessions.has(chatId));
    assert.ok(!pendingReportSessions.has(chatId));
    assert.ok(!pendingRecurrenceSessions.has(chatId));

    // Act + Assert: must not throw
    assert.doesNotThrow(() => clearChatSessions(chatId));
  });
});
