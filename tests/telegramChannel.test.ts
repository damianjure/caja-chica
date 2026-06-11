import test from "node:test";
import assert from "node:assert/strict";

import { TelegramChannel, telegramIncoming, type TelegramCtxLike } from "../src/channels/telegram/adapter.ts";

function fakeCtx(overrides: Partial<TelegramCtxLike> = {}) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const rec = (method: string) => (...args: unknown[]) => {
    calls.push({ method, args });
    return Promise.resolve({});
  };
  const ctx: TelegramCtxLike = {
    chat: { id: 555 },
    from: { id: 999, first_name: "Dami" },
    reply: rec("reply"),
    replyWithDocument: rec("replyWithDocument"),
    editMessageText: rec("editMessageText"),
    answerCallbackQuery: rec("answerCallbackQuery"),
    replyWithChatAction: rec("replyWithChatAction"),
    api: { getFile: async () => ({ file_path: "photos/file_1.jpg" }) },
    ...overrides,
  };
  return { ctx, calls };
}

test("telegramIncoming: identidad con chatKey prefijado", () => {
  const { ctx } = fakeCtx({ message: { text: "hola" } });
  const inc = telegramIncoming(ctx);
  assert.equal(inc.identity.channel, "telegram");
  assert.equal(inc.identity.chatKey, "tg:555");
  assert.equal(inc.identity.userKey, "999");
  assert.equal(inc.text, "hola");
});

test("telegramIncoming: parsea comando y args", () => {
  const { ctx } = fakeCtx({ message: { text: "/preguntar cuánto gasté" } });
  const inc = telegramIncoming(ctx);
  assert.equal(inc.command, "preguntar");
  assert.equal(inc.text, "cuánto gasté");
});

test("telegramIncoming: callbackQuery → buttonData", () => {
  const { ctx } = fakeCtx({ callbackQuery: { data: "mov:confirm" } });
  const inc = telegramIncoming(ctx);
  assert.equal(inc.buttonData, "mov:confirm");
});

test("telegramIncoming: foto → media photo con file_id más grande", () => {
  const { ctx } = fakeCtx({ message: { photo: [{ file_id: "small" }, { file_id: "big" }] } });
  const inc = telegramIncoming(ctx);
  assert.equal(inc.media?.kind, "photo");
  assert.equal(inc.media?.ref, "big");
});

test("replyWithButtons → inline_keyboard, una fila por botón", async () => {
  const { ctx, calls } = fakeCtx();
  const ch = new TelegramChannel(ctx, { botToken: "T" });
  await ch.replyWithButtons("¿Confirmás?", [
    { label: "Sí", data: "y" },
    { label: "No", data: "n" },
  ]);
  const call = calls.find((c) => c.method === "reply");
  assert.ok(call);
  const opts = call!.args[1] as any;
  assert.deepEqual(opts.reply_markup.inline_keyboard, [
    [{ text: "Sí", callback_data: "y" }],
    [{ text: "No", callback_data: "n" }],
  ]);
});

test("replyWithMenu → aplana secciones a filas de inline keyboard", async () => {
  const { ctx, calls } = fakeCtx();
  const ch = new TelegramChannel(ctx, { botToken: "T" });
  await ch.replyWithMenu("Menú", [
    { title: "Caja", items: [{ label: "Cargar", data: "load" }, { label: "Informe", data: "rep" }] },
  ]);
  const opts = calls.find((c) => c.method === "reply")!.args[1] as any;
  assert.equal(opts.reply_markup.inline_keyboard.length, 2);
});

test("editMessage → editMessageText con markup; ackButton → answerCallbackQuery", async () => {
  const { ctx, calls } = fakeCtx();
  const ch = new TelegramChannel(ctx, { botToken: "T" });
  await ch.editMessage("nuevo texto", [{ label: "X", data: "x" }]);
  await ch.ackButton("listo");
  assert.ok(calls.some((c) => c.method === "editMessageText"));
  const ack = calls.find((c) => c.method === "answerCallbackQuery");
  assert.deepEqual(ack!.args[0], { text: "listo" });
});

test("typing → replyWithChatAction('typing')", async () => {
  const { ctx, calls } = fakeCtx();
  const ch = new TelegramChannel(ctx, { botToken: "T" });
  await ch.typing();
  assert.deepEqual(calls.find((c) => c.method === "replyWithChatAction")!.args, ["typing"]);
});

test("downloadMedia: getFile → fetch al file API → bytes", async () => {
  const { ctx } = fakeCtx();
  let fetchedUrl = "";
  const fetchImpl = (async (url: string) => {
    fetchedUrl = url;
    return new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 });
  }) as unknown as typeof fetch;
  const ch = new TelegramChannel(ctx, { botToken: "ABC", fetchImpl });
  const bytes = await ch.downloadMedia({ kind: "photo", mimeType: "image/jpeg", ref: "file_1" });
  assert.equal(fetchedUrl, "https://api.telegram.org/file/botABC/photos/file_1.jpg");
  assert.deepEqual([...bytes], [1, 2, 3]);
});
