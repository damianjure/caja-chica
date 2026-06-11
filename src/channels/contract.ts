/**
 * contract.ts — the channel abstraction (ports & adapters).
 *
 * A `ChannelContext` is everything a conversation flow needs to talk to the
 * user, with ZERO knowledge of Telegram or WhatsApp. Flows in src/flows/ consume
 * this interface; adapters (channels/telegram, channels/whatsapp) implement it.
 *
 * The surface is grounded in what the current grammY bot actually uses:
 *   reply (222×), inline-keyboard buttons (reply_markup 77× / InlineKeyboard 42×),
 *   answerCallbackQuery (96× → ackButton), editMessageText (36× → editMessage),
 *   getFile (5× → downloadMedia), replyWithDocument (1× → sendFile),
 *   chat action (→ typing).
 *
 * Telegram-only capabilities (inline mode) stay in the Telegram adapter — they
 * are NOT in this shared contract because WhatsApp has no equivalent.
 *
 * UI mapping per channel:
 *   replyWithButtons → Telegram inline keyboard · WhatsApp reply buttons (≤3) or numbered text
 *   replyWithMenu    → Telegram inline keyboard · WhatsApp list message (≤10 rows)
 *   editMessage      → Telegram edits in place · WhatsApp can't, so it sends a new message
 *   ackButton        → Telegram answerCallbackQuery · WhatsApp no-op
 */

export type ChannelName = "telegram" | "whatsapp";

export interface ChannelIdentity {
  channel: ChannelName;
  /** Stable per-conversation key, channel-prefixed: "tg:<chatId>" / "wa:<phone>". */
  chatKey: string;
  /** Stable per-user key (Telegram user id / WhatsApp phone). */
  userKey: string;
  displayName?: string;
}

/** A tappable action button. `data` is the callback payload the adapter routes back. */
export interface ChannelButton {
  label: string;
  data: string;
}

/** A selectable row inside a menu/list. */
export interface ChannelMenuItem {
  label: string;
  data: string;
  description?: string;
}

export interface ChannelMenuSection {
  title?: string;
  items: ChannelMenuItem[];
}

/** Outbound file (informe PDF/CSV, etc.). */
export interface ChannelFile {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  caption?: string;
}

export type IncomingMediaKind = "photo" | "document" | "audio" | "voice";

/** An attached media descriptor; `ref` is opaque, the adapter resolves it to bytes. */
export interface IncomingMedia {
  kind: IncomingMediaKind;
  mimeType: string | null;
  ref: string;
  displayName?: string;
}

/** A normalized inbound event a flow reacts to — channel details stripped out. */
export interface IncomingMessage {
  identity: ChannelIdentity;
  /** Free text, or the args after a command. */
  text?: string;
  /** Command name without the leading slash, e.g. "informes". */
  command?: string;
  /** Set when the user tapped a button / picked a list item; the button's `data`. */
  buttonData?: string;
  media?: IncomingMedia;
}

/**
 * What a flow can DO, regardless of channel. Adapters implement this; the
 * FakeChannel (channels/fake.ts) implements it in memory for tests and the
 * offline simulation harness.
 */
export interface ChannelContext {
  readonly identity: ChannelIdentity;
  readonly incoming: IncomingMessage;

  /** Plain text message. */
  reply(text: string): Promise<void>;

  /** Text plus action buttons (confirm/edit/cancel style). */
  replyWithButtons(text: string, buttons: ChannelButton[]): Promise<void>;

  /** Text plus a selectable list (menu, line-item picker, period chooser). */
  replyWithMenu(text: string, sections: ChannelMenuSection[]): Promise<void>;

  /** Send a document/photo. */
  sendFile(file: ChannelFile): Promise<void>;

  /**
   * Edit the previous bot message in place where the channel supports it
   * (Telegram review cards). Adapters that can't edit (WhatsApp) send a new
   * message instead — flows must not assume in-place editing happened.
   */
  editMessage(text: string, buttons?: ChannelButton[]): Promise<void>;

  /** Acknowledge a button tap (Telegram callback query). No-op where N/A. */
  ackButton(text?: string): Promise<void>;

  /** Typing / chat-action indicator. */
  typing(): Promise<void>;

  /** Resolve an incoming media ref to raw bytes (the channel downloads). */
  downloadMedia(media: IncomingMedia): Promise<Uint8Array>;
}
