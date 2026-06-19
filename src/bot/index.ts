import type { Bot } from "grammy";
import type { BotDeps } from "./deps.ts";
import { registerMenuHandlers, registerBotCommands } from "./menu.ts";
import { registerMovementHandlers } from "./commands/movements.ts";
import { registerMovementCallbacks } from "./commands/movements-callbacks.ts";
import { registerEntityHandlers } from "./commands/entities.ts";
import { registerReportHandlers } from "./commands/reports.ts";
import { registerRecurringHandlers } from "./commands/recurring.ts";
import { registerReminderHandlers } from "./commands/reminder.ts";
import { registerHelpHandlers } from "./commands/help.ts";
import { registerAskHandlers } from "./commands/ask.ts";
import { registerExtractionHandlers } from "./extraction.ts";
import { initSessions } from "./sessions.ts";
import { registerInlineModeHandlers } from "./inlineMode.ts";

export function registerBotHandlers(bot: Bot, deps: BotDeps) {
  initSessions();
  registerMenuHandlers(bot, deps);
  registerEntityHandlers(bot, deps);
  registerReportHandlers(bot, deps);
  registerRecurringHandlers(bot, deps);
  registerReminderHandlers(bot, deps);
  registerHelpHandlers(bot, deps);
  registerAskHandlers(bot, deps);
  registerExtractionHandlers(bot, deps);
  registerInlineModeHandlers(bot, deps);
  // movements last: contains the catch-all message:text handler
  registerMovementHandlers(bot, deps);
  registerMovementCallbacks(bot, deps);
}

export { registerBotCommands };
