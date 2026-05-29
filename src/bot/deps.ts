import type { Bot } from "grammy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GoogleGenAI } from "@google/genai";

export interface BotDeps {
  supabase: SupabaseClient;
  bot: Bot;
  dashboardUrl: string;
  genAI: GoogleGenAI;
  genAI2: GoogleGenAI | null;
  botToken: string;
}
