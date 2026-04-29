import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { Bot, InlineKeyboard } from "grammy";
import dotenv from "dotenv";

// Load env vars
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- SERVICES (We'll re-import or redefine for server-side) ---
// Note: In a real project we'd use shared modules, but for simplicity we'll adapt them
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from "@google/genai";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

// --- TELEGRAM BOT LOGIC ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = botToken ? new Bot(botToken) : null;

if (bot) {
  console.log("🤖 Configurando Bot de Telegram...");

  const mainKeyboard = new InlineKeyboard()
    .text("📋 Menú", "menu").row()
    .text("📊 Informe", "informe").text("🏢 Empresas", "empresas").row()
    .text("📁 Categorías", "categorias").text("🗑️ Borrar Último", "borrar_last").row()
    .url("🌐 Abrir Dashboard", "https://ais-dev-uhxsvvda4nn64bxwgwh6v6-116197749063.us-west2.run.app/");

  bot.command("start", (ctx) => 
    ctx.reply("¡Hola! Soy tu asistente financiero. 💸\n\nPodés escribirme frases como:\n- 'gasté 5000 en pan en Taller Central'\n- 'entró un pago de 100 lucas'\n- 'agregar empresa MiNegocio'\n\nUsá /menu para ver opciones.", {
      reply_markup: mainKeyboard
    })
  );

  bot.command("menu", (ctx) => ctx.reply("📋 *Menú Principal*", { 
    parse_mode: "Markdown",
    reply_markup: mainKeyboard 
  }));

  bot.command("informe", async (ctx) => {
    const { data: movs } = await supabase.from('movimientos').select('*').limit(50);
    if (!movs || movs.length === 0) return ctx.reply("No hay movimientos registrados.");
    
    const stats = movs.reduce((acc: any, m: any) => {
      const key = `${m.moneda}_${m.tipo}`;
      acc[key] = (acc[key] || 0) + Number(m.monto);
      return acc;
    }, {});

    let text = "📊 *Resumen de Movimientos (Últimos 50)*\n\n";
    if (stats.ARS_egreso) text += `🔴 Gastos ARS: $${stats.ARS_egreso.toLocaleString()}\n`;
    if (stats.ARS_ingreso) text += `🟢 Ingresos ARS: $${stats.ARS_ingreso.toLocaleString()}\n`;
    if (stats.USD_egreso) text += `🔴 Gastos USD: u$s${stats.USD_egreso.toLocaleString()}\n`;
    if (stats.USD_ingreso) text += `🟢 Ingresos USD: u$s${stats.USD_ingreso.toLocaleString()}\n`;

    ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.command("empresas", async (ctx) => {
    const { data: emps } = await supabase.from('empresas').select('nombre');
    const list = emps?.map(e => `• ${e.nombre}`).join('\n') || "Sin empresas.";
    ctx.reply(`🏢 *Empresas registradas:*\n\n${list}\n\nUsá /agregarempresa [nombre] para sumar una.`, { parse_mode: "Markdown" });
  });

  bot.command("categorias", async (ctx) => {
    const { data: cats } = await supabase.from('categorias').select('nombre');
    const list = cats?.map(c => `• ${c.nombre}`).join('\n') || "Sin categorías.";
    ctx.reply(`📁 *Categorías registradas:*\n\n${list}`, { parse_mode: "Markdown" });
  });

  bot.command("agregarempresa", async (ctx) => {
    const name = ctx.match;
    if (!name) return ctx.reply("Por favor indicá el nombre: `/agregarempresa Mi Negocio`", { parse_mode: "Markdown" });
    await supabase.from('empresas').insert([{ nombre: name }]);
    ctx.reply(`✅ Empresa *${name}* agregada.`, { parse_mode: "Markdown" });
  });

  bot.command("borrar", async (ctx) => {
    const { data: last } = await supabase.from('movimientos').select('id').order('created_at', { ascending: false }).limit(1).single();
    if (last) {
      await supabase.from('movimientos').delete().eq('id', last.id);
      ctx.reply("🗑️ Último movimiento eliminado.");
    } else {
      ctx.reply("No hay movimientos para borrar.");
    }
  });

  bot.command("dashboard", (ctx) => {
    ctx.reply("🔗 [Abrir Dashboard Web](https://ais-dev-uhxsvvda4nn64bxwgwh6v6-116197749063.us-west2.run.app/)", { parse_mode: "Markdown" });
  });

  // Handle Menu Callbacks
  bot.callbackQuery("menu", (ctx) => ctx.editMessageText("📋 *Menú Principal*", { parse_mode: "Markdown", reply_markup: mainKeyboard }));
  bot.callbackQuery("informe", async (ctx) => {
    // Reuse logic or refactor
    ctx.answerCallbackQuery();
    const { data: movs } = await supabase.from('movimientos').select('*').limit(20);
    let text = "📊 *Informe Rápido*\n\n";
    movs?.forEach(m => {
      const icon = m.tipo === 'ingreso' ? '🟢' : '🔴';
      text += `${icon} ${m.monto} ${m.moneda} - ${m.descripcion}\n`;
    });
    ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.callbackQuery("borrar_last", async (ctx) => {
    ctx.answerCallbackQuery("Borrando...");
    const { data: last } = await supabase.from('movimientos').select('id, descripcion').order('created_at', { ascending: false }).limit(1).single();
    if (last) {
      await supabase.from('movimientos').delete().eq('id', last.id);
      ctx.reply(`🗑️ Borrado: ${last.descripcion}`);
    }
  });

  bot.command("agregarcategoria", async (ctx) => {
    const name = ctx.match;
    if (!name) return ctx.reply("Por favor indicá el nombre: `/agregarcategoria Comida`", { parse_mode: "Markdown" });
    await supabase.from('categorias').insert([{ nombre: name }]);
    ctx.reply(`✅ Categoría *${name}* agregada.`, { parse_mode: "Markdown" });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return; // Ignore commands here

    const processingMsg = await ctx.reply("🤔 Procesando...");

    try {
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        systemInstruction: `Actuá como un extractor de datos financieros para el mercado argentino.
        ENTENDÉ JERGA: "lucas/k" (1000), "gamba" (100), "palo" (1.000.000), "pe" (pesos).
        OBTENÉ: items (monto, tipo: ingreso/egreso, moneda: ARS/USD, categoria, empresa, descripcion).
        Retorná JSON puro.`
      });

      const prompt = `Extraé los datos de este mensaje: "${text}"`;
      const result = await model.generateContent(prompt);
      const rawResponse = result.response.text().replace(/```json|```/g, "").trim();
      const extracted = JSON.parse(rawResponse);

      if (extracted.intent === "REGISTRAR" && extracted.items) {
        for (const item of extracted.items) {
          // If company is missing, we could ask, but for now we skip or mark as personal
          const { data, error } = await supabase
            .from('movimientos')
            .insert([{
              tipo: item.tipo,
              moneda: item.moneda,
              monto: item.monto,
              categoria: item.categoria,
              empresa_nombre: item.empresa || "Personal",
              descripcion: item.descripcion,
              original_text: text
            }]);

          if (error) throw error;

          const icon = item.tipo === "ingreso" ? "🟢" : "🔴";
          await ctx.reply(`${icon} *Registrado:* ${item.descripcion}\n💰 ${item.monto} ${item.moneda}\n🏢 Empresa: ${item.empresa || "Personal"}`, { parse_mode: "Markdown" });
        }
      } else if (extracted.intent === "GESTIONAR_EMPRESA" && extracted.action === "ADD") {
        await supabase.from('empresas').insert([{ nombre: extracted.companyName }]);
        await ctx.reply(`✅ Empresa *${extracted.companyName}* agregada con éxito.`, { parse_mode: "Markdown" });
      } else {
        await ctx.reply("⚠️ No pude entender bien ese movimiento. ¿Podrás ser más específico?");
      }
    } catch (err) {
      console.error(err);
      await ctx.reply("❌ Hubo un error procesando tu mensaje.");
    } finally {
      try { await ctx.api.deleteMessage(ctx.chat.id, processingMsg.message_id); } catch(e) {}
    }
  });

  bot.start();
} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN no configurado. El bot no se iniciará.");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", botActive: !!bot });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
