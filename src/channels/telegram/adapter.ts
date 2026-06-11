/**
 * telegram/adapter.ts — Telegram implementation of ChannelContext.
 *
 * Wraps a grammY Context and maps the channel-agnostic verbs to grammY calls,
 * preserving the bot's current behavior:
 *   replyWithButtons / replyWithMenu → inline keyboard (one row per item)
 *   editMessage   → editMessageText (in-place card edit)
 *   ackButton     → answerCallbackQuery
 *   typing        → replyWithChatAction("typing")
 *   sendFile      → replyWithDocument(InputFile)
 *   downloadMedia → api.getFile(file_id) → download from the Telegram file API
 *
 * Typed against a structural subset of grammY's Context (TelegramCtxLike) so the
 * real ctx satisfies it and tests can pass a fake. grammY's InputFile is the
 * only value import — fine, this module IS the Telegram adapter.
 */

import { InputFile } from "grammy";
import type {
  ChannelButton,
  ChannelContext,
  ChannelFile,
  ChannelIdentity,
  ChannelMenuSection,
  IncomingMedia,
  IncomingMessage,
} from "../contract.ts";

interface InlineButton {
  text: string;
  callback_data: string;
}

export interface TelegramCtxLike {
  chat?: { id: number };
  from?: { id: number; first_name?: string; last_name?: string; username?: string };
  message?: {
    text?: string;
    caption?: string;
    photo?: Array<{ file_id: string }>;
    document?: { file_id: string; mime_type?: string; file_name?: string };
    voice?: { file_id: string; mime_type?: string };
    audio?: { file_id: string; mime_type?: string; file_name?: string };
  };
  callbackQuery?: { data?: string };
  reply(text: string, opts?: unknown): Promise<unknown>;
  replyWithDocument(doc: unknown, opts?: unknown): Promise<unknown>;
  editMessageText(text: string, opts?: unknown): Promise<unknown>;
  answerCallbackQuery(opts?: unknown): Promise<unknown>;
  replyWithChatAction(action: string): Promise<unknown>;
  api: { getFile(fileId: string): Promise<{ file_path?: string }> };
}

function buttonsToMarkup(buttons: ChannelButton[]): { inline_keyboard: InlineButton[][] } {
  return { inline_keyboard: buttons.map((b) => [{ text: b.label, callback_data: b.data }]) };
}

function menuToMarkup(sections: ChannelMenuSection[]): { inline_keyboard: InlineButton[][] } {
  // Telegram has no native list message — flatten every item to its own row,
  // which is exactly how the current /menu inline keyboard renders.
  const rows: InlineButton[][] = [];
  for (const section of sections) {
    for (const item of section.items) {
      rows.push([{ text: item.label, callback_data: item.data }]);
    }
  }
  return { inline_keyboard: rows };
}

/** Build a normalized IncomingMessage from a grammY context. */
export function telegramIncoming(ctx: TelegramCtxLike): IncomingMessage {
  const identity: ChannelIdentity = {
    channel: "telegram",
    chatKey: `tg:${ctx.chat?.id ?? ""}`,
    userKey: String(ctx.from?.id ?? ""),
    displayName: ctx.from?.first_name,
  };

  if (ctx.callbackQuery?.data) {
    return { identity, buttonData: ctx.callbackQuery.data };
  }

  const media = extractIncomingMedia(ctx);
  const rawText = ctx.message?.text ?? ctx.message?.caption ?? "";
  if (rawText.startsWith("/")) {
    const [cmd, ...rest] = rawText.slice(1).split(/\s+/);
    return { identity, command: cmd.split("@")[0], text: rest.join(" "), media };
  }
  return { identity, text: rawText || undefined, media };
}

function extractIncomingMedia(ctx: TelegramCtxLike): IncomingMedia | undefined {
  const m = ctx.message;
  if (!m) return undefined;
  if (m.photo?.length) {
    return { kind: "photo", mimeType: "image/jpeg", ref: m.photo[m.photo.length - 1].file_id };
  }
  if (m.document) {
    return { kind: "document", mimeType: m.document.mime_type ?? null, ref: m.document.file_id, displayName: m.document.file_name };
  }
  if (m.voice) {
    return { kind: "voice", mimeType: m.voice.mime_type ?? null, ref: m.voice.file_id };
  }
  if (m.audio) {
    return { kind: "audio", mimeType: m.audio.mime_type ?? null, ref: m.audio.file_id, displayName: m.audio.file_name };
  }
  return undefined;
}

export interface TelegramChannelOptions {
  botToken: string;
  fetchImpl?: typeof fetch;
}

export class TelegramChannel implements ChannelContext {
  readonly identity: ChannelIdentity;
  readonly incoming: IncomingMessage;
  private readonly ctx: TelegramCtxLike;
  private readonly botToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(ctx: TelegramCtxLike, options: TelegramChannelOptions) {
    this.ctx = ctx;
    this.botToken = options.botToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.incoming = telegramIncoming(ctx);
    this.identity = this.incoming.identity;
  }

  async reply(text: string): Promise<void> {
    await this.ctx.reply(text);
  }

  async replyWithButtons(text: string, buttons: ChannelButton[]): Promise<void> {
    await this.ctx.reply(text, { reply_markup: buttonsToMarkup(buttons) });
  }

  async replyWithMenu(text: string, sections: ChannelMenuSection[]): Promise<void> {
    await this.ctx.reply(text, { reply_markup: menuToMarkup(sections) });
  }

  async sendFile(file: ChannelFile): Promise<void> {
    const doc = new InputFile(Buffer.from(file.bytes), file.filename);
    await this.ctx.replyWithDocument(doc, file.caption ? { caption: file.caption } : undefined);
  }

  async editMessage(text: string, buttons?: ChannelButton[]): Promise<void> {
    await this.ctx.editMessageText(
      text,
      buttons ? { reply_markup: buttonsToMarkup(buttons) } : undefined,
    );
  }

  async ackButton(text?: string): Promise<void> {
    await this.ctx.answerCallbackQuery(text ? { text } : undefined);
  }

  async typing(): Promise<void> {
    await this.ctx.replyWithChatAction("typing");
  }

  async downloadMedia(media: IncomingMedia): Promise<Uint8Array> {
    const file = await this.ctx.api.getFile(media.ref);
    if (!file.file_path) throw new Error("telegram_file_path_missing");
    const res = await this.fetchImpl(`https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`);
    if (!res.ok) throw new Error(`telegram_media_download_failed:${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
