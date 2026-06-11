import test from "node:test";
import assert from "node:assert/strict";

import {
  WhatsAppChannel,
  whatsappIncoming,
  buildButtonsPayload,
  buildListPayload,
  buildTextPayload,
  buildDocumentPayload,
  buildNumberedText,
  WA_BUTTON_TITLE_MAX,
  type WhatsAppTransport,
} from "../src/channels/whatsapp/adapter.ts";
import { fakeIncoming } from "../src/channels/fake.ts";

function fakeTransport(opts: { mediaBytes?: Uint8Array } = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const uploads: Array<{ filename: string; mimeType: string }> = [];
  const transport: WhatsAppTransport = {
    async sendMessage(payload) { sent.push(payload); },
    async uploadMedia(_bytes, filename, mimeType) { uploads.push({ filename, mimeType }); return "media-123"; },
    async downloadMedia() { return opts.mediaBytes ?? new Uint8Array(); },
  };
  return { transport, sent, uploads };
}

function channel(transport: WhatsAppTransport, incoming = fakeIncoming({ identity: { channel: "whatsapp", chatKey: "wa:549351", userKey: "549351" } })) {
  return new WhatsAppChannel(incoming, transport);
}

// --- pure payload builders ---

test("buildButtonsPayload: interactive button, titles truncados a 20", () => {
  const p = buildButtonsPayload("549351", "¿Confirmás?", [
    { label: "Confirmar", data: "y" },
    { label: "Este título es demasiado largo para WhatsApp", data: "n" },
  ]) as any;
  assert.equal(p.type, "interactive");
  assert.equal(p.interactive.type, "button");
  assert.equal(p.interactive.body.text, "¿Confirmás?");
  assert.equal(p.interactive.action.buttons.length, 2);
  assert.equal(p.interactive.action.buttons[0].reply.id, "y");
  assert.equal(p.interactive.action.buttons[0].reply.title, "Confirmar");
  assert.ok(p.interactive.action.buttons[1].reply.title.length <= WA_BUTTON_TITLE_MAX);
});

test("buildButtonsPayload: recipient_type + body cap 1024 + id cap 256", () => {
  const longText = "x".repeat(2000);
  const longId = "d".repeat(400);
  const p = buildButtonsPayload("5", longText, [{ label: "ok", data: longId }]) as any;
  assert.equal(p.recipient_type, "individual");
  assert.ok(p.interactive.body.text.length <= 1024);
  assert.ok(p.interactive.action.buttons[0].reply.id.length <= 256);
});

test("buildListPayload: interactive list con secciones y filas", () => {
  const p = buildListPayload("549351", "Menú", [
    { title: "Caja", items: [{ label: "Cargar", data: "load", description: "texto/voz/foto" }, { label: "Informe", data: "rep" }] },
  ]) as any;
  assert.equal(p.interactive.type, "list");
  assert.equal(p.interactive.action.sections[0].title, "Caja");
  assert.equal(p.interactive.action.sections[0].rows[0].id, "load");
  assert.equal(p.interactive.action.sections[0].rows[0].description, "texto/voz/foto");
  assert.equal(p.interactive.action.sections[0].rows[1].description, undefined);
});

test("buildTextPayload + buildDocumentPayload", () => {
  assert.deepEqual(buildTextPayload("5", "hola"), { messaging_product: "whatsapp", recipient_type: "individual", to: "5", type: "text", text: { body: "hola" } });
  const d = buildDocumentPayload("5", "m1", "informe.csv", "📊 cap") as any;
  assert.equal(d.document.id, "m1");
  assert.equal(d.document.filename, "informe.csv");
  assert.equal(d.document.caption, "📊 cap");
});

test("buildNumberedText: arma lista numerada con cierre", () => {
  const t = buildNumberedText("Elegí cuáles:", [{ label: "Café" }, { label: "Agua" }]);
  assert.match(t, /1\. Café/);
  assert.match(t, /2\. Agua/);
  assert.match(t, /Respondé con el número/);
});

// --- adapter behavior ---

test("replyWithButtons: ≤3 → interactive; >3 → numbered text", async () => {
  const { transport, sent } = fakeTransport();
  const ch = channel(transport);
  await ch.replyWithButtons("a", [{ label: "1", data: "1" }, { label: "2", data: "2" }, { label: "3", data: "3" }]);
  assert.equal((sent[0] as any).type, "interactive");

  await ch.replyWithButtons("b", [{ label: "1", data: "1" }, { label: "2", data: "2" }, { label: "3", data: "3" }, { label: "4", data: "4" }]);
  assert.equal((sent[1] as any).type, "text");
  assert.match((sent[1] as any).text.body, /4\. 4/);
});

test("replyWithMenu: >10 filas → numbered text fallback", async () => {
  const { transport, sent } = fakeTransport();
  const ch = channel(transport);
  const items = Array.from({ length: 11 }, (_, i) => ({ label: `op${i}`, data: `o${i}` }));
  await ch.replyWithMenu("muchas", [{ items }]);
  assert.equal((sent[0] as any).type, "text");
});

test("sendFile: sube media y manda document con el id", async () => {
  const { transport, sent, uploads } = fakeTransport();
  const ch = channel(transport);
  await ch.sendFile({ bytes: new Uint8Array([1, 2]), filename: "i.pdf", mimeType: "application/pdf", caption: "x" });
  assert.equal(uploads.length, 1);
  assert.equal((sent[0] as any).document.id, "media-123");
  assert.equal((sent[0] as any).document.caption, "x");
});

test("editMessage: WhatsApp no edita → manda mensaje nuevo", async () => {
  const { transport, sent } = fakeTransport();
  const ch = channel(transport);
  await ch.editMessage("nuevo", [{ label: "ok", data: "ok" }]);
  assert.equal((sent[0] as any).type, "interactive");
});

test("ackButton + typing: no-ops (no llaman al transport)", async () => {
  const { transport, sent } = fakeTransport();
  const ch = channel(transport);
  await ch.ackButton("listo");
  await ch.typing();
  assert.equal(sent.length, 0);
});

test("downloadMedia: delega en transport con el ref", async () => {
  const bytes = new TextEncoder().encode("doc");
  const { transport } = fakeTransport({ mediaBytes: bytes });
  const ch = channel(transport);
  const got = await ch.downloadMedia({ kind: "document", mimeType: "application/pdf", ref: "wamid-media" });
  assert.deepEqual(got, bytes);
});

// --- inbound normalizer ---

test("whatsappIncoming: texto → identity wa: + text", () => {
  const inc = whatsappIncoming({
    contacts: [{ profile: { name: "Dami" } }],
    messages: [{ from: "549351", type: "text", text: { body: "pagué 4500 de luz" } }],
  });
  assert.ok(inc);
  assert.equal(inc!.identity.channel, "whatsapp");
  assert.equal(inc!.identity.chatKey, "wa:549351");
  assert.equal(inc!.identity.displayName, "Dami");
  assert.equal(inc!.text, "pagué 4500 de luz");
});

test("whatsappIncoming: comando /preguntar", () => {
  const inc = whatsappIncoming({ messages: [{ from: "5", type: "text", text: { body: "/preguntar cuánto gasté" } }] });
  assert.equal(inc!.command, "preguntar");
  assert.equal(inc!.text, "cuánto gasté");
});

test("whatsappIncoming: button_reply y list_reply → buttonData", () => {
  const b = whatsappIncoming({ messages: [{ from: "5", type: "interactive", interactive: { type: "button_reply", button_reply: { id: "mov:confirm", title: "Confirmar" } } }] });
  assert.equal(b!.buttonData, "mov:confirm");
  const l = whatsappIncoming({ messages: [{ from: "5", type: "interactive", interactive: { type: "list_reply", list_reply: { id: "menu:informe", title: "Informe" } } }] });
  assert.equal(l!.buttonData, "menu:informe");
});

test("whatsappIncoming: imagen / documento / audio de voz → media", () => {
  const img = whatsappIncoming({ messages: [{ from: "5", type: "image", image: { id: "img1", mime_type: "image/jpeg" } }] });
  assert.equal(img!.media?.kind, "photo");
  assert.equal(img!.media?.ref, "img1");
  const doc = whatsappIncoming({ messages: [{ from: "5", type: "document", document: { id: "doc1", mime_type: "application/pdf", filename: "resumen.pdf" } }] });
  assert.equal(doc!.media?.kind, "document");
  assert.equal(doc!.media?.displayName, "resumen.pdf");
  const voice = whatsappIncoming({ messages: [{ from: "5", type: "audio", audio: { id: "a1", voice: true, mime_type: "audio/ogg" } }] });
  assert.equal(voice!.media?.kind, "voice");
});

test("whatsappIncoming: payload sin mensaje (status callback) → null", () => {
  assert.equal(whatsappIncoming({ statuses: [{ status: "delivered" }] }), null);
  assert.equal(whatsappIncoming({}), null);
});
