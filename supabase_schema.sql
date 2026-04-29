-- SQL for Supabase Editor

-- 1. Companies Table
CREATE TABLE IF NOT EXISTS public.empresas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    nombre TEXT NOT NULL UNIQUE,
    tenant_id TEXT DEFAULT 'default'
);

-- 2. Transactions Table
CREATE TABLE IF NOT EXISTS public.movimientos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    tipo TEXT NOT NULL CHECK (tipo IN ('ingreso', 'egreso')),
    moneda TEXT NOT NULL CHECK (moneda IN ('ARS', 'USD')),
    monto NUMERIC,
    categoria TEXT,
    empresa_nombre TEXT, -- Storing name for easier fuzzy matching logic
    descripcion TEXT,
    original_text TEXT,
    tenant_id TEXT DEFAULT 'default'
);

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS public.categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),
    nombre TEXT NOT NULL UNIQUE,
    tenant_id TEXT DEFAULT 'default'
);

-- Enable Realtime
alter publication supabase_realtime add table public.movimientos;
alter publication supabase_realtime add table public.empresas;
alter publication supabase_realtime add table public.categorias;
