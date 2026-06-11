/**
 * whatsapp/adapter.ts — WhatsApp Cloud API implementation of ChannelContext.
 *
 * This is the render/format layer: it turns the channel-agnostic verbs into
 * Cloud API JSON payloads. It does NOT talk to Meta directly — all I/O goes
 * through an injected WhatsAppTransport, so every payload is unit-testable now
 * and the actual Graph API plumbing (auth, graph.facebook.com) is the only
 * piece deferred to last.
 *
 * WhatsApp realities baked in here:
 *   reply buttons  → max 3, titles ≤20 chars; >3 actions → numbered text
 *   list message   → max 10 rows total, titles ≤24 / descriptions ≤72; >10 → numbered text
 *   editMessage    → WhatsApp can't edit a sent message → sends a NEW one
 *   ackButton      → no-op (a button tap already arrives as a new inbound message)
 *   typing         → no-op for now. The Cloud API *does* support a typing
 *                    indicator, but it requires the inbound message's wamid, which
 *                    this adapter doesn't thread through yet — so it's skipped.
 */

import type {
  ChannelButton,
  ChannelContext,
  ChannelFile,
  ChannelIdentity,
  ChannelMenuItem,
  ChannelMenuSection,
  IncomingMedia,
  IncomingMessage,
} from "../contract.ts";

export const WA_TEXT_MAX = 4096;
/** Interactive message body cap (1024, not the 4096 plain-text cap). */
export const WA_INTERACTIVE_BODY_MAX = 1024;
export const WA_MAX_BUTTONS = 3;
export const WA_BUTTON_TITLE_MAX = 20;
export const WA_BUTTON_ID_MAX = 256;
export const WA_MAX_LIST_ROWS = 10;
export const WA_LIST_ROW_TITLE_MAX = 24;
export const WA_LIST_ROW_DESC_MAX = 72;
export const WA_LIST_SECTION_TITLE_MAX = 24;
export const WA_DOC_FILENAME_MAX = 240;
const WA_LIST_BUTTON_LABEL = "Ver opciones";

export interface WhatsAppTransport {
  /** POST a message payload to the Cloud API. */
  sendMessage(payload: Record<string, unknown>): Promise<void>;
  /** Upload bytes, returning a media id usable in a document/image message. */
  uploadMedia(bytes: Uint8Array, filename: string, mimeType: string): Promise<string>;
  /** Resolve a media id to raw bytes (download from the Cloud API). */
  downloadMedia(mediaId: string): Promise<Uint8Array>;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function chunkText(text: string, max = WA_TEXT_MAX): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf("\n", max);
    if (cut < max / 2) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) chunks.push(rest);
  return chunks;
}

// --- pure payload builders (exported for tests) ---

export function buildTextPayload(to: string, body: string): Record<string, unknown> {
  return { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } };
}

export function buildButtonsPayload(to: string, text: string, buttons: ChannelButton[]): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: truncate(text, WA_INTERACTIVE_BODY_MAX) },
      action: {
        buttons: buttons.slice(0, WA_MAX_BUTTONS).map((b) => ({
          type: "reply",
          reply: { id: truncate(b.data, WA_BUTTON_ID_MAX), title: truncate(b.label, WA_BUTTON_TITLE_MAX) },
        })),
      },
    },
  };
}

export function buildListPayload(
  to: string,
  text: string,
  sections: ChannelMenuSection[],
  buttonLabel = WA_LIST_BUTTON_LABEL,
): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: truncate(text, WA_INTERACTIVE_BODY_MAX) },
      action: {
        button: truncate(buttonLabel, WA_BUTTON_TITLE_MAX),
        sections: sections.map((s) => ({
          ...(s.title ? { title: truncate(s.title, WA_LIST_SECTION_TITLE_MAX) } : {}),
          rows: s.items.map((it) => ({
            id: it.data,
            title: truncate(it.label, WA_LIST_ROW_TITLE_MAX),
            ...(it.description ? { description: truncate(it.description, WA_LIST_ROW_DESC_MAX) } : {}),
          })),
        })),
      },
    },
  };
}

export function buildDocumentPayload(
  to: string,
  mediaId: string,
  filename: string,
  caption?: string,
): Record<string, unknown> {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "document",
    document: { id: mediaId, filename: truncate(filename, WA_DOC_FILENAME_MAX), ...(caption ? { caption } : {}) },
  };
}

/** Numbered-text fallback for >3 actions / >10 list rows (WhatsApp lacks the widget). */
export function buildNumberedText(
  text: string,
  items: Array<{ label: string }>,
): string {
  const lines = items.map((it, i) => `${i + 1}. ${it.label}`);
  return `${text}\n\n${lines.join("\n")}\n\nRespondé con el número.`;
}

function totalRows(sections: ChannelMenuSection[]): number {
  return sections.reduce((acc, s) => acc + s.items.length, 0);
}

function flattenItems(sections: ChannelMenuSection[]): ChannelMenuItem[] {
  return sections.flatMap((s) => s.items);
}

// --- inbound webhook normalizer ---

/**
 * Normalize a WhatsApp Cloud API webhook `value` object (entry[].changes[].value)
 * into a channel-agnostic IncomingMessage. Reads the first message + contact.
 * Returns null when there's no user message (status callbacks, empty payloads).
 */
export function whatsappIncoming(value: any): IncomingMessage | null {
  const msg = value?.messages?.[0];
  if (!msg?.from) return null;

  const identity: ChannelIdentity = {
    channel: "whatsapp",
    chatKey: `wa:${msg.from}`,
    userKey: String(msg.from),
    displayName: value?.contacts?.[0]?.profile?.name,
  };

  // Button / list selection → buttonData (the row/button id we set as `data`).
  const interactive = msg.interactive;
  if (interactive) {
    const reply = interactive.button_reply ?? interactive.list_reply;
    if (reply?.id) return { identity, buttonData: String(reply.id) };
  }
  // Legacy quick-reply button payload.
  if (msg.type === "button" && msg.button?.payload) {
    return { identity, buttonData: String(msg.button.payload) };
  }

  const media = whatsappIncomingMedia(msg);

  const body: string = msg.text?.body ?? msg.image?.caption ?? msg.document?.caption ?? "";
  if (body.startsWith("/")) {
    const [cmd, ...rest] = body.slice(1).split(/\s+/);
    return { identity, command: cmd, text: rest.join(" "), media };
  }
  return { identity, text: body || undefined, media };
}

function whatsappIncomingMedia(msg: any): IncomingMedia | undefined {
  if (msg.image) return { kind: "photo", mimeType: msg.image.mime_type ?? "image/jpeg", ref: msg.image.id };
  if (msg.document) return { kind: "document", mimeType: msg.document.mime_type ?? null, ref: msg.document.id, displayName: msg.document.filename };
  if (msg.audio) return { kind: msg.audio.voice ? "voice" : "audio", mimeType: msg.audio.mime_type ?? null, ref: msg.audio.id };
  return undefined;
}

// --- adapter ---

export class WhatsAppChannel implements ChannelContext {
  readonly identity: ChannelIdentity;
  readonly incoming: IncomingMessage;
  private readonly transport: WhatsAppTransport;
  private readonly to: string;

  constructor(incoming: IncomingMessage, transport: WhatsAppTransport) {
    this.incoming = incoming;
    this.identity = incoming.identity;
    this.transport = transport;
    this.to = incoming.identity.userKey;
  }

  async reply(text: string): Promise<void> {
    for (const chunk of chunkText(text)) {
      await this.transport.sendMessage(buildTextPayload(this.to, chunk));
    }
  }

  async replyWithButtons(text: string, buttons: ChannelButton[]): Promise<void> {
    if (buttons.length > WA_MAX_BUTTONS) {
      await this.reply(buildNumberedText(text, buttons));
      return;
    }
    await this.transport.sendMessage(buildButtonsPayload(this.to, text, buttons));
  }

  async replyWithMenu(text: string, sections: ChannelMenuSection[]): Promise<void> {
    if (totalRows(sections) > WA_MAX_LIST_ROWS) {
      await this.reply(buildNumberedText(text, flattenItems(sections)));
      return;
    }
    await this.transport.sendMessage(buildListPayload(this.to, text, sections));
  }

  async sendFile(file: ChannelFile): Promise<void> {
    const mediaId = await this.transport.uploadMedia(file.bytes, file.filename, file.mimeType);
    await this.transport.sendMessage(buildDocumentPayload(this.to, mediaId, file.filename, file.caption));
  }

  async editMessage(text: string, buttons?: ChannelButton[]): Promise<void> {
    // WhatsApp can't edit a sent message — send a fresh one.
    if (buttons && buttons.length) {
      await this.replyWithButtons(text, buttons);
    } else {
      await this.reply(text);
    }
  }

  async ackButton(_text?: string): Promise<void> {
    // No Cloud API equivalent — a button tap already sends a new inbound message.
  }

  async typing(): Promise<void> {
    // No-op for now. The Cloud API supports a typing indicator, but it needs the
    // inbound message's wamid, which the adapter doesn't thread through yet.
  }

  async downloadMedia(media: IncomingMedia): Promise<Uint8Array> {
    return this.transport.downloadMedia(media.ref);
  }
}
