import express from "express";

type QueryBuilderResult<T> = Promise<{ data: T; error: { message: string } | null }>;
type Frecuencia = any;
type AppUserStatus = "active" | "suspended" | "paused" | "blocked";

export function createMovimientosRouter(ctx: any) {
  const router = express.Router();
  const {
    supabase,
    genAI,
    botActive,
    webhookPath,
    webhookHandler,
    webhookSecret,
    adminApiToken,
    enableDangerousRoutes,
    publicAppUrl,
    telegramBotUsername,
    googleDriveClientId,
    googleDriveClientSecret,
    googleDriveRedirectUri,
    tokenEncryptionKey,
    bot,
    buildTelegramDeepLink,
    requireSession,
    requireAdmin,
    requireSuperadmin,
    getSession,
    resolveDataAccessScope,
    canWriteToScope,
    canManageDashboardMembers,
    applyDataScope,
    buildWriteOwnership,
    insertAuditLog,
    getScopeEntityById,
    fetchScopedMovimientos,
    insertReportExport,
    logEntityMutation,
    createEmpresaDeleteBackup,
    getBotConnectionRecord,
    upsertBotConnectionRecord,
    syncPendingDashboardInvitations,
    listDashboardMembers,
    pendingDriveOAuthStates,
    driveEnabled,
    canConnectDrive,
    canExportDrive,
    canExportLocal,
    canManageEmpresasOp,
    canManageCategoriasOp,
    canDeleteOthers,
    canEditOthers,
    resolveDriveOwnerUserId,
    parseExtractRequest,
    parseSaveMovimientosRequest,
    parseEmpresaRequest,
    parseUpdateEmpresaRequest,
    parseUpdateMovimientoRequest,
    parseReconciliationRequest,
    parseBudgetRequest,
    parsePaginationQuery,
    parseReportExportRequest,
    parseInvitationRequest,
    parseDashboardInvitationRequest,
    parseRecurrenteRequest,
    SYSTEM_PROMPT,
    parseGeminiJsonResponse,
    filterMovementsForReport,
    resolveReportDateRange,
    buildReportFile,
    getDriveAuthUrl,
    exchangeCodeForTokens,
    uploadFileToDrive,
    encryptToken,
    decryptToken,
    sendAppInvitationEmail,
    sendDashboardInvitationEmail,
    ensurePersonalDashboard,
    seedDemoData,
    purgeDemoData,
    getMaintenanceState,
    setMaintenanceStatus,
    notifyMaintenance,
    computeNextRun,
    relativeRunLabel,
    randomBytes,
    hasValidAdminToken,
    isMissingSchemaArtifactError,
    tierRead,
    tierWrite,
    tierStrict,
    tierResend,
  } = ctx;


  router.post("/api/extract", requireSession, tierStrict, async (req, res) => {
    try {
      const payload = parseExtractRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const catList =
        payload.categories.map((category) => category.nombre).join(", ") || "Otros";

      const result = await genAI.models.generateContent({
        model: "gemini-2.5-flash",
        contents: payload.text,
        config: {
          systemInstruction: `${SYSTEM_PROMPT}\nCATEGORIAS DISPONIBLES: ${catList}. Si no encaja en ninguna, inventá una coherente o usá "Otros".`,
        },
      });

      const textResponse =
        result.text || result.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const extracted = parseGeminiJsonResponse(textResponse);
      if (!extracted) {
        return res.status(422).json({ error: "invalid_extraction" });
      }
      res.json(extracted);
    } catch (err) {
      console.error("Extract error:", err);
      res.status(500).json({ error: "failed_to_process" });
    }
  });

  router.post("/api/movimientos", requireSession, async (req, res) => {
    try {
      const payload = parseSaveMovimientosRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      // Auto-register companies referenced by free text so they become
      // editable/deletable entities in the dashboard.
      const referencedCompanies = [
        ...new Set(
          payload.items
            .map((item) => (item.empresa || "Personal").trim())
            .filter((name) => name.length > 0 && name !== "Personal"),
        ),
      ];
      if (referencedCompanies.length > 0 && canManageEmpresasOp(scope)) {
        const { data: existing } = await applyDataScope(
          supabase.from("empresas").select("nombre").is("deleted_at", null),
          session,
          scope,
        );
        const existingNames = new Set((existing ?? []).map((e: any) => e.nombre));
        const empresaOwnership = scope.dashboardId
          ? { owner_user_id: session.userId, dashboard_id: scope.dashboardId }
          : { owner_user_id: session.userId };
        for (const nombre of referencedCompanies) {
          if (existingNames.has(nombre)) continue;
          const { data: empresa, error: empresaError } = await supabase
            .from("empresas")
            .insert([{ nombre, ...empresaOwnership }])
            .select()
            .single();
          if (empresaError) {
            console.error("Auto-register empresa error:", empresaError);
            continue;
          }
          if (empresa?.id) {
            await logEntityMutation({
              session,
              scope,
              source: "web",
              action: "create",
              entityType: "empresa",
              entityId: empresa.id,
              afterData: empresa,
            });
          }
        }
      }

      const saved: any[] = [];
      for (const item of payload.items) {
        const { data, error } = await supabase
          .from("movimientos")
          .insert([
            {
              ...buildWriteOwnership(session, scope),
              tipo: item.tipo,
              moneda: item.moneda,
              monto: Math.abs(item.monto || 0),
              categoria: item.categoria || "Otros",
              empresa_nombre: item.empresa || "Personal",
              descripcion: item.descripcion,
              original_text: payload.originalText,
              conciliado: true,
              conciliado_notas: null,
            },
          ])
          .select();
        if (error) throw error;
        const created = data?.[0];
        saved.push(created);
        if (created?.id) {
          await logEntityMutation({
            session,
            scope,
            source: "web",
            action: "create",
            entityType: "movimiento",
            entityId: created.id,
            afterData: created,
          });
        }
      }
      res.json(saved);
    } catch (err) {
      console.error("Save error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });


  router.delete("/api/movimientos/last", requireSession, async (_req, res) => {
    try {
      const session = getSession(_req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const query = applyDataScope(
        supabase
          .from("movimientos")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        session,
        scope,
      );
      const { data, error } = await query.limit(1);
      if (error) throw error;

      const last = data?.[0] ?? null;
      if (!last) return res.json({ ok: true, id: null });

      const beforeData = [last];

      await applyDataScope(
        supabase
          .from("movimientos")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by_user_id: session.userId,
          })
          .eq("id", last.id),
        session,
        scope,
      );

      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "delete",
        entityType: "movimiento",
        entityId: last.id,
        beforeData: beforeData?.[0] ?? null,
      });

      res.json({ ok: true, id: last.id });
    } catch (err) {
      console.error("Delete last movimiento error:", err);
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  router.delete("/api/movimientos/all", requireSession, requireAdmin, async (req, res) => {
    if (!enableDangerousRoutes || !hasValidAdminToken(req, adminApiToken)) {
      return res.status(403).json({ error: "forbidden" });
    }

    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      // CRITICAL-3: soft delete — never hard delete movimientos
      // CRITICAL: scope filter — only delete within the caller's dashboard/owner
      const bulkUpdate = applyDataScope(
        supabase
          .from("movimientos")
          .update({
            deleted_at: new Date().toISOString(),
            deleted_by_user_id: session.userId,
          })
          .is("deleted_at", null),
        session,
        scope,
      );
      const { error: bulkErr } = await bulkUpdate;
      if (bulkErr) throw bulkErr;
      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "delete",
        entityType: "movimientos_bulk",
        entityId: "00000000-0000-0000-0000-000000000000",
        beforeData: { note: "bulk soft-delete via dangerous route" },
      });
      res.json({ ok: true });
    } catch (_err) {
      console.error("[DELETE /api/movimientos/all]", _err);
      res.status(500).json({ error: "failed_to_delete" });
    }
  });

  router.delete("/api/movimientos/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const { data: existingRows, error: fetchErr } = await applyDataScope(
        supabase.from("movimientos").select("*").is("deleted_at", null),
        session,
        scope,
      ).eq("id", req.params.id).limit(1);
      if (fetchErr) throw fetchErr;
      const existing = existingRows?.[0];
      if (!existing) return res.status(404).json({ error: "not_found" });

      if (existing.owner_user_id !== session.userId && !canDeleteOthers(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const { error } = await supabase
        .from("movimientos")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: session.userId,
        })
        .eq("id", req.params.id);
      if (error) throw error;
      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "delete",
        entityType: "movimiento",
        entityId: req.params.id,
        beforeData: existing,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error("Movimiento delete error:", err);
      res.status(500).json({ error: "failed_to_delete" });
    }
  });


  router.post("/api/movimientos/:id/conciliar", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }
      const payload = parseReconciliationRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });

      const { data: existing, error: fetchError } = await applyDataScope(
        supabase.from("movimientos").select("id").is("deleted_at", null),
        session,
        scope,
      )
        .eq("id", req.params.id)
        .limit(1);
      if (fetchError) throw fetchError;
      if (!existing?.[0]) return res.status(404).json({ error: "not_found" });

      const { error } = await supabase
        .from("movimientos")
        .update({
          conciliado: payload.conciliado,
          conciliado_at: payload.conciliado ? new Date().toISOString() : null,
          conciliado_notas: payload.notas || null,
        })
        .eq("id", req.params.id);
      if (error) throw error;
      res.json({ ok: true });
    } catch (_err) {
      res.status(500).json({ error: "failed_to_save" });
    }
  });

  router.patch("/api/movimientos/:id", requireSession, async (req, res) => {
    try {
      const payload = parseUpdateMovimientoRequest(req.body);
      if (!payload) return res.status(400).json({ error: "invalid_request" });
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const { data: existingRows, error: fetchErr } = await applyDataScope(
        supabase.from("movimientos").select("*").is("deleted_at", null),
        session,
        scope,
      ).eq("id", req.params.id).limit(1);
      if (fetchErr) throw fetchErr;
      const existing = existingRows?.[0];
      if (!existing) return res.status(404).json({ error: "not_found" });

      if (existing.owner_user_id !== session.userId && !canEditOthers(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const updatePayload: Record<string, unknown> = {};
      if (payload.monto !== undefined) updatePayload.monto = payload.monto;
      if (payload.categoria !== undefined) updatePayload.categoria = payload.categoria;
      if (payload.empresa !== undefined) updatePayload.empresa_nombre = payload.empresa || "Personal";
      if (payload.descripcion !== undefined) updatePayload.descripcion = payload.descripcion;
      if (payload.tipo !== undefined) updatePayload.tipo = payload.tipo;
      if (payload.moneda !== undefined) updatePayload.moneda = payload.moneda;

      const { error } = await supabase
        .from("movimientos")
        .update(updatePayload)
        .eq("id", req.params.id);
      if (error) throw error;

      await logEntityMutation({
        session,
        scope,
        source: "web",
        action: "update",
        entityType: "movimiento",
        entityId: req.params.id,
        beforeData: existing,
        afterData: { ...(existing as any), ...updatePayload },
      });

      res.json({ ok: true });
    } catch (err) {
      console.error("Movimiento update error:", err);
      res.status(500).json({ error: "failed_to_save" });
    }
  });


  router.get("/api/movimientos", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);
      const { limit, before } = parsePaginationQuery(req.query);
      let query = applyDataScope(
        supabase
          .from("movimientos")
          .select("*")
          .is("deleted_at", null)
          .order("created_at", { ascending: false }),
        session,
        scope,
      );

      if (before) {
        query = query.lt("created_at", before);
      }

      const { data, error } = (await query.limit(limit)) as Awaited<
        QueryBuilderResult<any[]>
      >;
      if (error) throw error;

      const items = data ?? [];
      const nextCursor =
        items.length === limit && items.at(-1)?.created_at
          ? items.at(-1)?.created_at
          : null;

      res.json({ items, nextCursor });
    } catch (_err) {
      res.status(500).json({ error: "failed_to_fetch" });
    }
  });


  router.get("/api/recurrentes", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      let query = applyDataScope(
        supabase.from("recurrentes").select("*"),
        session,
        scope,
      ).is("deleted_at", null);

      // Optional ?active filter
      const activeParam = (req.query as Record<string, string>).active;
      if (activeParam === "true") query = (query as any).eq("is_active", true);
      if (activeParam === "false") query = (query as any).eq("is_active", false);

      const { data, error } = await (query as any);
      if (error) throw error;

      const now = new Date();
      const items = (data ?? []).map((r: any) => {
        const lastProcessed = r.last_processed ? new Date(r.last_processed) : null;
        const dayOfMonth = typeof r.day_of_month === "number" ? r.day_of_month : null;
        const nextRun = computeNextRun(r.frecuencia as Frecuencia, lastProcessed, dayOfMonth, now);
        return {
          ...r,
          next_run_at: nextRun ? nextRun.toISOString() : null,
          next_run_label: relativeRunLabel(nextRun, now),
        };
      });

      // Sort by next_run_at ascending (nulls first = "se activa esta noche")
      items.sort((a: any, b: any) => {
        if (!a.next_run_at) return -1;
        if (!b.next_run_at) return 1;
        return a.next_run_at < b.next_run_at ? -1 : 1;
      });

      return res.json(items);
    } catch (err) {
      console.error("GET /api/recurrentes:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.post("/api/recurrentes", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const parsed = parseRecurrenteRequest(req.body);
      if (!parsed) return res.status(400).json({ error: "invalid_body" });

      const ownership = buildWriteOwnership(session, scope);
      const { data, error } = await supabase
        .from("recurrentes")
        .insert([{
          ...ownership,
          monto: parsed.monto,
          tipo: parsed.tipo,
          moneda: parsed.moneda,
          frecuencia: parsed.frecuencia,
          categoria: parsed.categoria ?? null,
          empresa_nombre: parsed.empresa_nombre ?? "Personal",
          descripcion: parsed.descripcion ?? null,
          day_of_month: parsed.day_of_month ?? null,
          is_active: true,
          deleted_at: null,
          last_processed: null,
        }])
        .select()
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    } catch (err) {
      console.error("POST /api/recurrentes:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.patch("/api/recurrentes/:id/toggle", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const row = await getScopeEntityById("recurrentes", session, scope, req.params.id);
      if (!row) return res.status(404).json({ error: "not_found" });
      if (row.deleted_at) return res.status(404).json({ error: "not_found" });

      const { data, error } = await supabase
        .from("recurrentes")
        .update({ is_active: !row.is_active })
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;
      return res.json(data);
    } catch (err) {
      console.error("PATCH /api/recurrentes/:id/toggle:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.patch("/api/recurrentes/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const row = await getScopeEntityById("recurrentes", session, scope, req.params.id);
      if (!row) return res.status(404).json({ error: "not_found" });
      if (row.deleted_at) return res.status(404).json({ error: "not_found" });

      const p = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = {};

      if (p.monto !== undefined) {
        if (typeof p.monto !== "number" || p.monto <= 0) return res.status(400).json({ error: "invalid_monto" });
        updates.monto = p.monto;
      }
      if (p.tipo !== undefined) {
        if (p.tipo !== "egreso" && p.tipo !== "ingreso") return res.status(400).json({ error: "invalid_tipo" });
        updates.tipo = p.tipo;
      }
      if (p.moneda !== undefined) {
        if (p.moneda !== "ARS" && p.moneda !== "USD") return res.status(400).json({ error: "invalid_moneda" });
        updates.moneda = p.moneda;
      }
      if (p.frecuencia !== undefined) {
        const parsed = parseRecurrenteRequest({ monto: 1, tipo: "egreso", moneda: "ARS", frecuencia: p.frecuencia });
        if (!parsed) return res.status(400).json({ error: "invalid_frecuencia" });
        updates.frecuencia = p.frecuencia;
      }
      if (p.categoria !== undefined) {
        if (typeof p.categoria !== "string") return res.status(400).json({ error: "invalid_categoria" });
        updates.categoria = p.categoria.trim().slice(0, 100) || null;
      }
      if (p.empresa_nombre !== undefined) {
        if (typeof p.empresa_nombre !== "string") return res.status(400).json({ error: "invalid_empresa_nombre" });
        updates.empresa_nombre = p.empresa_nombre.trim().slice(0, 120) || null;
      }
      if (p.descripcion !== undefined) {
        if (typeof p.descripcion !== "string") return res.status(400).json({ error: "invalid_descripcion" });
        updates.descripcion = p.descripcion.trim().slice(0, 500) || null;
      }

      if (p.day_of_month !== undefined) {
        if (p.day_of_month === null) {
          updates.day_of_month = null;
        } else if (
          typeof p.day_of_month === "number" &&
          Number.isInteger(p.day_of_month) &&
          p.day_of_month >= 1 &&
          p.day_of_month <= 31
        ) {
          updates.day_of_month = p.day_of_month;
        } else {
          return res.status(400).json({ error: "invalid_day_of_month" });
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "no_fields" });
      }

      const { data, error } = await supabase
        .from("recurrentes")
        .update(updates)
        .eq("id", req.params.id)
        .select()
        .single();

      if (error) throw error;
      return res.json(data);
    } catch (err) {
      console.error("PATCH /api/recurrentes/:id:", err);
      return res.status(500).json({ error: "internal" });
    }
  });

  router.delete("/api/recurrentes/:id", requireSession, async (req, res) => {
    try {
      const session = getSession(req);
      const scope = await resolveDataAccessScope(session);

      if (!canWriteToScope(scope)) {
        return res.status(403).json({ error: "forbidden" });
      }

      const row = await getScopeEntityById("recurrentes", session, scope, req.params.id);
      if (!row) return res.status(404).json({ error: "not_found" });
      if (row.deleted_at) return res.status(404).json({ error: "not_found" });

      const { error } = await supabase
        .from("recurrentes")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", req.params.id);

      if (error) throw error;
      return res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/recurrentes/:id:", err);
      return res.status(500).json({ error: "internal" });
    }
  });


  return router;
}
