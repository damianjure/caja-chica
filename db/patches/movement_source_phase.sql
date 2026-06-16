-- movement_source_phase.sql
-- Adds a `source` column to movimientos so the dashboard can show HOW each
-- movement was entered (web text, web/photo ticket, Telegram text/voice,
-- Telegram photo/pdf/statement, recurrente, demo). Until now the input method
-- was not persisted on the row (only a `[sourceType]` prefix inside
-- original_text for extraction paths), so it could not be queried or filtered.
--
-- Values written by the app code:
--   web | web_ticket | telegram | photo | handwritten | multi | pdf
--   | statement | recurrente | demo
-- Pre-existing rows are backfilled to 'legacy' so the column is never null in
-- practice, and the column stays nullable to avoid breaking any insert that
-- predates this patch.
--
-- STATUS: ✔ APPLIED in prod 2026-06-16 (project cajachica / dezgusgxotihxkfkxico).
-- Applied BEFORE the write-path code deploy so the additive nullable column is
-- invisible to the still-running code that never references `source`.
-- Backfill result: 169 legacy · 7 photo · 2 web_ticket (0 null).

alter table public.movimientos
  add column if not exists source text;

-- Backfill historical rows. Best-effort refinement from the original_text
-- prefix that extraction/ticket paths already wrote (e.g. "[statement] ...").
update public.movimientos
   set source = case
     when source is not null then source
     when original_text like '[statement]%'   then 'statement'
     when original_text like '[pdf]%'          then 'pdf'
     when original_text like '[handwritten]%'  then 'handwritten'
     when original_text like '[multi]%'        then 'multi'
     when original_text like '[photo]%'        then 'photo'
     when has_lineas is true                   then 'web_ticket'
     else 'legacy'
   end
 where source is null;

create index if not exists idx_movimientos_source
    on public.movimientos (source);

-- Refinement (applied 2026-06-16): the prefix/has_lineas heuristic above only
-- recovers tickets; plain text from web vs Telegram is indistinguishable in
-- original_text. The audit trail DOES record the channel, so reclassify the
-- `legacy` rows that have a create-audit entry. Rows older than the audit log
-- (no entry) stay `legacy`. Result on prod: 68 telegram, 11 web, 90 legacy.
update public.movimientos m
   set source = (
     select a.source from public.audit_logs a
     where a.entity_type='movimiento' and a.action='create' and a.entity_id=m.id
       and a.source in ('web','telegram')
     order by a.created_at asc limit 1
   )
 where m.source='legacy'
   and exists (
     select 1 from public.audit_logs a
     where a.entity_type='movimiento' and a.action='create' and a.entity_id=m.id
       and a.source in ('web','telegram')
   );
