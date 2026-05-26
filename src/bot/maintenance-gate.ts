import { type Context } from "grammy";
import { isWriteBlocked } from "../server/maintenance.ts";

export async function assertBotWritable(ctx: Context): Promise<boolean> {
  if (isWriteBlocked()) {
    await ctx.reply("⚠️ El sistema está en mantenimiento. Intentá de nuevo en unos minutos.");
    return false;
  }
  return true;
}
