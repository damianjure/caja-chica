import express from "express";
import { Bot, InlineKeyboard, Keyboard, InputFile } from "grammy";
import dotenv from "dotenv";
import cron from "node-cron";

dotenv.config();

// --- SERVICES ---
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from "@google/genai";

const supabaseUrl = process.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const dashboardUrl = process.env.DASHBOARD_URL || "https://balancediario.web.app";

// --- TELEGRAM BOT LOGIC ---
const botToken = process.env.TELEGRAM_BOT_TOKEN;
const bot = botToken ? new Bot(botToken) : null;

if (bot) {
  console.log("🤖 Configurando Bot de Telegram...");

  const mainKeyboard = new InlineKeyboard()
    .text("📋 Menú", "menu").row()
    .text("📊 Informe", "informe").text("🏢 Empresas", "empresas").row()
    .text("📁 Categorías", "categorias").text("💰 Saldos", "saldos").row()
    .text("🔍 Buscar", "buscar_mode").text("🗑️ Borrar", "borrar_last").row()
    .text("📤 Exportar CSV", "export_csv").row()
    .url("🌐 Abrir Dashboard", dashboardUrl);

  bot.command("start", async (ctx) => {
    const { error } = await supabase.from('usuarios').upsert({ 
      chat_id: ctx.chat.id, 
      username: ctx.from?.username || ctx.from?.first_name || "Usuario"
    }, { onConflict: 'chat_id' });

    ctx.reply("¡Hola! Soy tu asistente financiero. 💸\n\nPodés escribirme frases como:\n- 'gasté 5000 en pan en Taller Central'\n- 'entró un pago de 100 lucas'\n- 'agregar empresa MiNegocio'\n\nUsá /menu para ver más opciones.", {
      reply_markup: mainKeyboard
    });
  });

  bot.command("menu", (ctx) => ctx.reply("📋 *Menú Principal*", { 
    parse_mode: "Markdown",
    reply_markup: mainKeyboard 
  }));

  bot.command("informe", async (ctx) => {
    const parts = ctx.match?.split(" ") || [];
    let days = 30;
    if (parts[0] === "dia") days = 1;
    if (parts[0] === "semana") days = 7;
    
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - days);

    const { data: movs } = await supabase
      .from('movimientos')
      .select('*')
      .gte('created_at', dateLimit.toISOString());

    if (!movs || movs.length === 0) return ctx.reply(`No hay movimientos en los últimos ${days} días.`);
    
    const stats = movs.reduce((acc: any, m: any) => {
      const key = `${m.moneda}_${m.tipo}`;
      acc[key] = (acc[key] || 0) + Number(m.monto);
      return acc;
    }, {});

    let text = `📊 *Resumen (${days} días)*\n\n`;
    const rows = [
      { k: 'ARS_egreso', label: '🔴 Gastos ARS', sym: '$' },
      { k: 'ARS_ingreso', label: '🟢 Ingresos ARS', sym: '$' },
      { k: 'USD_egreso', label: '🔴 Gastos USD', sym: 'u$s' },
      { k: 'USD_ingreso', label: '🟢 Ingresos USD', sym: 'u$s' },
    ];
    
    rows.forEach(r => {
      if (stats[r.k]) text += `${r.label}: ${r.sym}${stats[r.k].toLocaleString()}\n`;
    });

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
    ctx.reply(`🔗 [Abrir Dashboard Web](${dashboardUrl})`, { parse_mode: "Markdown" });
  });

  bot.command("buscar", async (ctx) => {
    const query = ctx.match;
    if (!query) return ctx.reply("Indicá qué buscar. Ej: `/buscar pan`", { parse_mode: "Markdown" });
    
    const { data: results } = await supabase
      .from('movimientos')
      .select('*')
      .ilike('descripcion', `%${query}%`)
      .limit(10);

    if (!results || results.length === 0) return ctx.reply("No se encontraron movimientos.");

    let text = `🔍 *Resultados para "${query}":*\n\n`;
    results.forEach(m => {
      const icon = m.tipo === 'ingreso' ? '🟢' : '🔴';
      text += `${icon} ${m.monto} ${m.moneda} - ${m.descripcion} (${m.categoria})\n`;
    });
    ctx.reply(text, { parse_mode: "Markdown" });
  });

  async function getSaldosText() {
    const { data: emps } = await supabase.from('empresas').select('nombre');
    const { data: movs } = await supabase.from('movimientos').select('*');

    let text = "💰 *Saldos por Empresa:*\n\n";
    const companies = ["Personal", ...(emps?.map(e => e.nombre) || [])];
    
    companies.forEach(company => {
      const cMovs = movs?.filter(m => m.empresa_nombre === company) || [];
      const totalARS = cMovs.reduce((acc, m) => acc + (m.moneda === 'ARS' ? (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)) : 0), 0);
      const totalUSD = cMovs.reduce((acc, m) => acc + (m.moneda === 'USD' ? (m.tipo === 'ingreso' ? Number(m.monto) : -Number(m.monto)) : 0), 0);
      
      if (totalARS !== 0 || totalUSD !== 0) {
        text += `🏢 *${company}*\n`;
        text += `   🇦🇷 ARS: $${totalARS.toLocaleString()}\n`;
        text += `   🇺🇸 USD: u$s${totalUSD.toLocaleString()}\n\n`;
      }
    });
    return text;
  }

  bot.command("saldos", async (ctx) => {
    const text = await getSaldosText();
    ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.command("exportar", async (ctx) => {
    const { data: movs } = await supabase.from('movimientos').select('*').order('created_at', { ascending: false });
    if (!movs) return ctx.reply("No hay datos.");

    const csvRows = [
      ["Fecha", "Tipo", "Monto", "Moneda", "Categoria", "Empresa", "Descripcion"],
      ...movs.map(m => [
        new Date(m.created_at).toLocaleDateString(),
        m.tipo,
        m.monto,
        m.moneda,
        m.categoria,
        m.empresa_nombre,
        m.descripcion
      ])
    ];

    const csvString = csvRows.map(r => r.join(",")).join("\n");
    const buffer = Buffer.from(csvString, 'utf-8');
    
    await ctx.replyWithDocument(new InputFile(buffer, `movimientos_${new Date().toISOString().split('T')[0]}.csv`), {
      caption: "📂 Aquí tenés tu exportación de datos."
    });
  });

  bot.command("recurrente", async (ctx) => {
    const parts = ctx.match?.split(" ");
    if (!parts || parts.length < 4) {
      return ctx.reply("Uso: `/recurrente [monto] [ARS/USD] [diario/semanal/mensual] [descripcion]`", { parse_mode: "Markdown" });
    }
    
    const [monto, moneda, frecuencia, ...descParts] = parts;
    const { error } = await supabase.from('recurrentes').insert([{
      monto: Number(monto),
      moneda: moneda.toUpperCase(),
      frecuencia: frecuencia.toLowerCase(),
      descripcion: descParts.join(" "),
      tipo: Number(monto) > 0 ? 'ingreso' : 'egreso',
      chat_id: ctx.chat.id
    }]);

    if (error) return ctx.reply("❌ Error creando recurrente: " + error.message);
    ctx.reply(`✅ Recurrente guardado: ${monto} ${moneda} (${frecuencia})`);
  });

  // Handle Menu Callbacks
  bot.callbackQuery("menu", (ctx) => ctx.editMessageText("📋 *Menú Principal*", { parse_mode: "Markdown", reply_markup: mainKeyboard }));
  bot.callbackQuery("informe", async (ctx) => {
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

  bot.callbackQuery("export_csv", async (ctx) => {
    ctx.answerCallbackQuery();
    const { data: movs } = await supabase.from('movimientos').select('*');
    if (!movs) return;
    const csvString = "Fecha,Tipo,Monto,Moneda,Categoria,Empresa,Descripcion\n" + movs.map(m => `${m.created_at},${m.tipo},${m.monto},${m.moneda},${m.categoria},${m.empresa_nombre},${m.descripcion}`).join("\n");
    const buffer = Buffer.from(csvString, 'utf-8');
    await ctx.replyWithDocument(new InputFile(buffer, "movimientos.csv"));
  });

  bot.callbackQuery("saldos", async (ctx) => {
    ctx.answerCallbackQuery();
    const text = await getSaldosText();
    ctx.reply(text, { parse_mode: "Markdown" });
  });

  bot.callbackQuery("buscar_mode", (ctx) => {
    ctx.answerCallbackQuery();
    ctx.reply("🔍 Usá el comando /buscar [texto]. Ej: `/buscar pan`", { parse_mode: "Markdown" });
  });

  bot.callbackQuery(/^set_cat_([\w-]+)_(.+)$/, async (ctx) => {
    const movId = ctx.match[1];
    const category = ctx.match[2];
    await supabase.from('movimientos').update({ categoria: category }).eq('id', movId);
    ctx.answerCallbackQuery(`Categoría actualizada: ${category}`);
    ctx.editMessageText(`✅ Categoría actualizada a *${category}*`, { parse_mode: "Markdown" });
  });

  bot.command("agregarcategoria", async (ctx) => {
    const name = ctx.match;
    if (!name) return ctx.reply("Por favor indicá el nombre: `/agregarcategoria Comida`", { parse_mode: "Markdown" });
    await supabase.from('categorias').insert([{ nombre: name }]);
    ctx.reply(`✅ Categoría *${name}* agregada.`, { parse_mode: "Markdown" });
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    const processingMsg = await ctx.reply("🤔 Procesando...");

    try {
      const { data: currentCats } = await supabase.from('categorias').select('nombre');
      const catList = currentCats?.map(c => c.nombre).join(', ') || "Otros";

      const prompt = `Extraé los datos de este mensaje: "${text}"`;
      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `Actuá como un extractor de datos financieros para el mercado argentino.
        ENTENDÉ JERGA: "lucas/k" (1000), "gamba" (100), "palo" (1.000.000), "pe" (pesos).
        OBTENÉ: items (monto, tipo: ingreso/egreso, moneda: ARS/USD, categoria, empresa, descripcion).
        CATEGORIAS DISPONIBLES: ${catList}. Si no encaja en ninguna, inventá una coherente o usá "Otros".
        Retorná JSON puro.`
        },
      });
      const textResponse = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const rawResponse = textResponse.replace(/```json|```/g, "").trim();
      const extracted = JSON.parse(rawResponse);

      if (extracted.intent === "REGISTRAR" && extracted.items) {
        for (const item of extracted.items) {
          let finalCategory = item.categoria;
          if (!finalCategory || finalCategory === "Otros") {
            const desc = item.descripcion.toLowerCase();
            if (desc.includes("pan") || desc.includes("taller central") || desc.includes("comida")) finalCategory = "Alimentos";
            else if (desc.includes("nafta") || desc.includes("ypf") || desc.includes("estacion")) finalCategory = "Transporte";
            else if (desc.includes("luz") || desc.includes("gas") || desc.includes("internet")) finalCategory = "Servicios";
            else finalCategory = "Otros";
          }

          const { data, error } = await supabase
            .from('movimientos')
            .insert([{
              tipo: item.tipo,
              moneda: item.moneda,
              monto: Math.abs(item.monto || 0),
              categoria: finalCategory,
              empresa_nombre: item.empresa || "Personal",
              descripcion: item.descripcion,
              original_text: text
            }])
            .select();

          if (error) throw error;

          const icon = item.tipo === "ingreso" ? "🟢" : "🔴";
          const newId = data?.[0]?.id;
          await ctx.reply(`${icon} *Registrado:* ${item.descripcion}\n💰 ${item.monto} ${item.moneda}\n📁 Categoría: ${finalCategory}\n🏢 Empresa: ${item.empresa || "Personal"}`, { 
            parse_mode: "Markdown",
            reply_markup: newId ? new InlineKeyboard().text("✏️ Cambiar Categoría", `change_cat_${newId}`) : undefined
          });
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

  bot.callbackQuery(/^change_cat_([\w-]+)$/, async (ctx) => {
    const movId = ctx.match[1];
    const { data: cats } = await supabase.from('categorias').select('nombre');
    const kb = new InlineKeyboard();
    cats?.forEach((c, i) => {
      kb.text(c.nombre, `set_cat_${movId}_${c.nombre}`);
      if ((i + 1) % 3 === 0) kb.row();
    });
    ctx.editMessageText("Seleccioná la categoría correcta:", { reply_markup: kb });
  });

  bot.start().catch((err) => {
    console.error("⚠️ Bot start error:", err.message);
  });

  // --- CRON JOBS ---
  cron.schedule('0 21 * * *', async () => {
    const { data: users } = await supabase.from('usuarios').select('chat_id').eq('reminders_enabled', true);
    users?.forEach(u => {
      bot.api.sendMessage(u.chat_id, "🔔 *Recordatorio:* No te olvides de registrar tus gastos del día. 💸", { parse_mode: "Markdown" });
    });
  });

  cron.schedule('0 8 * * *', async () => {
    const today = new Date();
    const { data: recs } = await supabase.from('recurrentes').select('*');
    
    recs?.forEach(async (r) => {
      let shouldProcess = false;
      const last = r.last_processed ? new Date(r.last_processed) : null;
      
      if (!last) shouldProcess = true;
      else {
        const diff = today.getTime() - last.getTime();
        const days = diff / (1000 * 3600 * 24);
        if (r.frecuencia === 'diario' && days >= 1) shouldProcess = true;
        if (r.frecuencia === 'semanal' && days >= 7) shouldProcess = true;
        if (r.frecuencia === 'mensual' && days >= 30) shouldProcess = true;
      }

      if (shouldProcess) {
        await supabase.from('movimientos').insert([{
          monto: Math.abs(r.monto),
          tipo: r.tipo,
          moneda: r.moneda,
          categoria: r.categoria,
          empresa_nombre: r.empresa_nombre,
          descripcion: r.descripcion + " (Recurrente)",
          original_text: "System Generated"
        }]);
        await supabase.from('recurrentes').update({ last_processed: today.toISOString() }).eq('id', r.id);
        if (r.chat_id) {
          bot.api.sendMessage(r.chat_id, `🔄 *Recurrente Registrado:* ${r.descripcion}\n💰 ${r.monto} ${r.moneda}`, { parse_mode: "Markdown" });
        }
      }
    });
  });

} else {
  console.warn("⚠️ TELEGRAM_BOT_TOKEN no configurado. El bot no se iniciará.");
}

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://balancediario.web.app").split(",");

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", botActive: !!bot });
});

const SYSTEM_PROMPT = `Actuá como un extractor de datos financieros para el mercado argentino.
ENTENDÉ JERGA: "lucas/k" (1000), "gamba" (100), "palo" (1.000.000), "pe" (pesos).

INTENCIONES:
- "REGISTRAR": Para gastos o ingresos.
- "GESTIONAR_EMPRESA": Para crear empresas (ej: "agregar empresa X").
- "ELIMINAR_MOVIMIENTO": Para borrar el último registro.

Retorná SIEMPRE un objeto JSON con:
{ "intent": "REGISTRAR"|"GESTIONAR_EMPRESA"|"ELIMINAR_MOVIMIENTO", "items": [{monto, tipo: "ingreso"|"egreso", moneda: "ARS"|"USD", categoria, empresa, descripcion}], "action": "ADD", "companyName": "...", "target": "last" }`;

app.post("/api/extract", async (req, res) => {
  try {
    const { text, categories } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });

    const catList = categories?.map((c: any) => c.nombre).join(", ") || "Otros";
    const result = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: text,
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja en ninguna, inventá una coherente o usá "Otros".`,
      },
    });
    const textResponse = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const extracted = JSON.parse(textResponse.replace(/```json|```/g, "").trim());
    res.json(extracted);
  } catch (err) {
    console.error("Extract error:", err);
    res.status(500).json({ error: "failed_to_process" });
  }
});

app.post("/api/movimientos", async (req, res) => {
  try {
    const { items, originalText } = req.body;
    const saved: any[] = [];
    for (const item of items) {
      const { data, error } = await supabase
        .from("movimientos")
        .insert([{
          tipo: item.tipo,
          moneda: item.moneda,
          monto: Math.abs(item.monto || 0),
          categoria: item.categoria || "Otros",
          empresa_nombre: item.empresa || "Personal",
          descripcion: item.descripcion,
          original_text: originalText,
        }])
        .select();
      if (error) throw error;
      saved.push(data?.[0]);
    }
    res.json(saved);
  } catch (err) {
    console.error("Save error:", err);
    res.status(500).json({ error: "failed_to_save" });
  }
});

app.post("/api/empresas", async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre) return res.status(400).json({ error: "nombre is required" });
    const { data, error } = await supabase.from("empresas").insert([{ nombre }]).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error("Empresa error:", err);
    res.status(500).json({ error: "failed_to_save" });
  }
});

app.delete("/api/movimientos/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("movimientos").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "failed_to_delete" });
  }
});

app.delete("/api/movimientos/last", async (req, res) => {
  try {
    const { data: last } = await supabase.from("movimientos").select("id").order("created_at", { ascending: false }).limit(1).single();
    if (!last) return res.json({ ok: true, id: null });
    await supabase.from("movimientos").delete().eq("id", last.id);
    res.json({ ok: true, id: last.id });
  } catch (err) {
    res.status(500).json({ error: "failed_to_delete" });
  }
});

app.delete("/api/movimientos/all", async (req, res) => {
  try {
    await supabase.from("movimientos").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "failed_to_delete" });
  }
});

app.delete("/api/empresas/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("empresas").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "failed_to_delete" });
  }
});

app.delete("/api/categorias/:id", async (req, res) => {
  try {
    const { error } = await supabase.from("categorias").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "failed_to_delete" });
  }
});

app.get("/api/movimientos", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const { data, error } = await supabase.from("movimientos").select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "failed_to_fetch" });
  }
});

app.get("/api/empresas", async (req, res) => {
  try {
    const { data, error } = await supabase.from("empresas").select("*").order("nombre", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "failed_to_fetch" });
  }
});

app.get("/api/categorias", async (req, res) => {
  try {
    const { data, error } = await supabase.from("categorias").select("*").order("nombre", { ascending: true });
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "failed_to_fetch" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Bot server running on http://0.0.0.0:${PORT}`);
});
