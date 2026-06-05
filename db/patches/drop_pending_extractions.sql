-- Drop unused pending_extractions table.
-- Decision 2026-05-08: photo/ticket extraction sessions live in-memory (Map + TTL 10min).
-- Single-instance invariant: Cloud Run max=1. If autoscale needed in future, migrate Map → this table.
DROP TABLE IF EXISTS pending_extractions CASCADE;
