/**
 * waSim.ts — offline WhatsApp conversation harness (no Meta).
 *
 * Drives handleWhatsAppMessage with a WhatsAppChannel backed by a fake transport
 * + a shared session store, so a full guided flow can be exercised turn by turn
 * and the outbound Cloud API payloads asserted. This is the substitute for an
 * integration test against Meta.
 */

import { WhatsAppChannel, whatsappIncoming, type WhatsAppTransport } from "../../src/channels/whatsapp/adapter.ts";
import { handleWhatsAppMessage, type WhatsAppRouterDeps } from "../../src/channels/whatsapp/router.ts";
import { WaSessionStore } from "../../src/channels/whatsapp/session.ts";

export class WaSim {
  readonly sent: Array<Record<string, unknown>> = [];
  readonly uploads: Array<{ filename: string; mimeType: string }> = [];
  readonly sessions = new WaSessionStore();
  private readonly transport: WhatsAppTransport;
  private readonly phone: string;
  private readonly deps: WhatsAppRouterDeps;

  constructor(deps: Omit<WhatsAppRouterDeps, "sessions">, phone = "549351") {
    this.phone = phone;
    this.deps = { ...deps, sessions: this.sessions };
    this.transport = {
      sendMessage: async (payload) => { this.sent.push(payload); },
      uploadMedia: async (_b, filename, mimeType) => { this.uploads.push({ filename, mimeType }); return "media-id"; },
      downloadMedia: async () => new Uint8Array(),
    };
  }

  private async run(message: Record<string, unknown>): Promise<void> {
    const incoming = whatsappIncoming({
      contacts: [{ profile: { name: "Sim" } }],
      messages: [{ from: this.phone, ...message }],
    });
    if (!incoming) return;
    const ch = new WhatsAppChannel(incoming, this.transport);
    await handleWhatsAppMessage(ch, this.deps);
  }

  /** Send a free-text / command message. */
  async text(body: string): Promise<void> {
    await this.run({ type: "text", text: { body } });
  }

  /** Tap an interactive button (button_reply with the given id). */
  async tapButton(id: string): Promise<void> {
    await this.run({ type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: id } } });
  }

  /** Pick a list row (list_reply with the given id). */
  async pickRow(id: string): Promise<void> {
    await this.run({ type: "interactive", interactive: { type: "list_reply", list_reply: { id, title: id } } });
  }

  /** The most recent outbound payload. */
  last(): Record<string, unknown> | undefined {
    return this.sent[this.sent.length - 1];
  }

  /** The most recent interactive payload's type ("button" | "list"), or null. */
  lastInteractiveType(): string | null {
    const p = this.last() as any;
    return p?.type === "interactive" ? p.interactive.type : null;
  }
}
