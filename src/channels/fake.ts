/**
 * fake.ts — in-memory ChannelContext for tests and the offline simulation
 * harness. Records every outbound action so a flow can be exercised end-to-end
 * without Telegram, WhatsApp, or HTTP. This is the double the WhatsApp adapter
 * is validated against before any Meta plumbing exists.
 */

import type {
  ChannelButton,
  ChannelContext,
  ChannelFile,
  ChannelIdentity,
  ChannelMenuSection,
  IncomingMedia,
  IncomingMessage,
} from "./contract.ts";

export type RecordedOutbound =
  | { kind: "text"; text: string }
  | { kind: "buttons"; text: string; buttons: ChannelButton[] }
  | { kind: "menu"; text: string; sections: ChannelMenuSection[] }
  | { kind: "file"; file: ChannelFile }
  | { kind: "edit"; text: string; buttons?: ChannelButton[] }
  | { kind: "ack"; text?: string }
  | { kind: "typing" };

export interface FakeChannelOptions {
  /** Bytes returned by downloadMedia (defaults to empty). */
  mediaBytes?: Uint8Array;
}

export class FakeChannel implements ChannelContext {
  readonly identity: ChannelIdentity;
  readonly incoming: IncomingMessage;
  readonly outbound: RecordedOutbound[] = [];
  private readonly mediaBytes: Uint8Array;

  constructor(incoming: IncomingMessage, options: FakeChannelOptions = {}) {
    this.incoming = incoming;
    this.identity = incoming.identity;
    this.mediaBytes = options.mediaBytes ?? new Uint8Array();
  }

  async reply(text: string): Promise<void> {
    this.outbound.push({ kind: "text", text });
  }

  async replyWithButtons(text: string, buttons: ChannelButton[]): Promise<void> {
    this.outbound.push({ kind: "buttons", text, buttons });
  }

  async replyWithMenu(text: string, sections: ChannelMenuSection[]): Promise<void> {
    this.outbound.push({ kind: "menu", text, sections });
  }

  async sendFile(file: ChannelFile): Promise<void> {
    this.outbound.push({ kind: "file", file });
  }

  async editMessage(text: string, buttons?: ChannelButton[]): Promise<void> {
    this.outbound.push({ kind: "edit", text, buttons });
  }

  async ackButton(text?: string): Promise<void> {
    this.outbound.push({ kind: "ack", text });
  }

  async typing(): Promise<void> {
    this.outbound.push({ kind: "typing" });
  }

  async downloadMedia(_media: IncomingMedia): Promise<Uint8Array> {
    return this.mediaBytes;
  }

  /** Test helper: the last recorded outbound action. */
  last(): RecordedOutbound | undefined {
    return this.outbound[this.outbound.length - 1];
  }

  /** Test helper: outbound actions of a given kind. */
  ofKind<K extends RecordedOutbound["kind"]>(kind: K): Array<Extract<RecordedOutbound, { kind: K }>> {
    return this.outbound.filter((o): o is Extract<RecordedOutbound, { kind: K }> => o.kind === kind);
  }
}

/** Convenience builder for a plain text inbound message on a channel. */
export function fakeIncoming(
  partial: Partial<IncomingMessage> & { identity?: Partial<ChannelIdentity> } = {},
): IncomingMessage {
  const identity: ChannelIdentity = {
    channel: "whatsapp",
    chatKey: "wa:5493510000000",
    userKey: "5493510000000",
    ...partial.identity,
  };
  return {
    identity,
    text: partial.text,
    command: partial.command,
    buttonData: partial.buttonData,
    media: partial.media,
  };
}
