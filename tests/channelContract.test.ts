import test from "node:test";
import assert from "node:assert/strict";

import { FakeChannel, fakeIncoming } from "../src/channels/fake.ts";
import type { ChannelContext } from "../src/channels/contract.ts";

// A flow only ever sees ChannelContext — never grammY or Meta. This is the
// guarantee that the same flow runs on Telegram and WhatsApp.
async function confirmFlow(ch: ChannelContext): Promise<void> {
  await ch.typing();
  await ch.replyWithButtons("¿Confirmás el gasto de $4.500?", [
    { label: "Confirmar", data: "mov:confirm" },
    { label: "Editar", data: "mov:edit" },
    { label: "Cancelar", data: "mov:cancel" },
  ]);
}

test("FakeChannel records a typing + buttons flow", async () => {
  const ch = new FakeChannel(fakeIncoming({ text: "pagué 4500 de luz" }));
  await confirmFlow(ch);

  assert.equal(ch.outbound.length, 2);
  assert.equal(ch.outbound[0].kind, "typing");
  const last = ch.last();
  assert.equal(last?.kind, "buttons");
  assert.equal(last && last.kind === "buttons" && last.buttons.length, 3);
});

test("FakeChannel exposes identity + button taps to the flow", async () => {
  const ch = new FakeChannel(
    fakeIncoming({ buttonData: "mov:confirm", identity: { channel: "telegram", chatKey: "tg:123", userKey: "123" } }),
  );
  assert.equal(ch.identity.channel, "telegram");
  assert.equal(ch.identity.chatKey, "tg:123");
  assert.equal(ch.incoming.buttonData, "mov:confirm");
});

test("FakeChannel.ofKind filters recorded outbound", async () => {
  const ch = new FakeChannel(fakeIncoming());
  await ch.reply("uno");
  await ch.reply("dos");
  await ch.replyWithMenu("elegí", [{ items: [{ label: "A", data: "a" }] }]);

  assert.equal(ch.ofKind("text").length, 2);
  assert.equal(ch.ofKind("menu").length, 1);
  assert.equal(ch.ofKind("menu")[0].sections[0].items[0].label, "A");
});

test("FakeChannel.downloadMedia returns the configured bytes", async () => {
  const bytes = new TextEncoder().encode("ticket-bytes");
  const ch = new FakeChannel(
    fakeIncoming({ media: { kind: "photo", mimeType: "image/jpeg", ref: "wa-media-id" } }),
    { mediaBytes: bytes },
  );
  const got = await ch.downloadMedia(ch.incoming.media!);
  assert.deepEqual(got, bytes);
});
