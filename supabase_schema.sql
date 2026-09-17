-- ==============================================================================
-- SISTEMA DE CONTROL DE CAJA Y VENTAS - JUNGLES & LA CHICHERA
-- Esquema Oficial de Base de Datos para Supabase (PostgreSQL)
-- ==============================================================================

-- 1. Tabla Principal: Cierres de Caja Diaria
CREATE TABLE IF NOT EXISTS public.cierres (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    venue TEXT NOT NULL,                -- 'jungles' | 'chichera'
    venue_name TEXT NOT NULL,           -- 'Jungles Bar' | 'La Chichera'
    efectivo NUMERIC(12, 2) DEFAULT 0,
    datafono1 NUMERIC(12, 2) DEFAULT 0,
    datafono2 NUMERIC(12, 2) DEFAULT 0,
    total_datafonos NUMERIC(12, 2) DEFAULT 0,
    total_sinpes NUMERIC(12, 2) DEFAULT 0,
    total_creditos NUMERIC(12, 2) DEFAULT 0,
    total_ventas NUMERIC(12, 2) DEFAULT 0,
    servicio_pct NUMERIC(5, 2) DEFAULT 10,
    servicio_monto NUMERIC(12, 2) DEFAULT 0,
    total_empleados NUMERIC(12, 2) DEFAULT 0,
    balance_neto NUMERIC(12, 2) DEFAULT 0,
    sinpes JSONB DEFAULT '[]'::jsonb,
    creditos JSONB DEFAULT '[]'::jsonb,
    empleados JSONB DEFAULT '[]'::jsonb,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Si la tabla ya existe, ejecutar esta migración en el SQL Editor de Supabase:
-- ALTER TABLE public.cierres ADD COLUMN IF NOT EXISTS total_sinpes NUMERIC(12, 2) DEFAULT 0;
-- ALTER TABLE public.cierres ADD COLUMN IF NOT EXISTS sinpes JSONB DEFAULT '[]'::jsonb;

-- Índices para consultas ultra-rápidas por fecha y sede
CREATE INDEX IF NOT EXISTS idx_cierres_date ON public.cierres(date DESC);
CREATE INDEX IF NOT EXISTS idx_cierres_venue ON public.cierres(venue);
CREATE INDEX IF NOT EXISTS idx_cierres_created_at ON public.cierres(created_at DESC);

-- 2. Habilitar Seguridad por Filas (Row Level Security - RLS)
ALTER TABLE public.cierres ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso para la aplicación con clave anónima (anon key)
DROP POLICY IF EXISTS "Lectura de cierres" ON public.cierres;
CREATE POLICY "Lectura de cierres" 
ON public.cierres FOR SELECT 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Inserción de cierres" ON public.cierres;
CREATE POLICY "Inserción de cierres" 
ON public.cierres FOR INSERT 
TO anon, authenticated 
WITH CHECK (true);

DROP POLICY IF EXISTS "Actualización de cierres" ON public.cierres;
CREATE POLICY "Actualización de cierres" 
ON public.cierres FOR UPDATE 
TO anon, authenticated 
USING (true);

DROP POLICY IF EXISTS "Eliminación de cierres" ON public.cierres;
CREATE POLICY "Eliminación de cierres" 
ON public.cierres FOR DELETE 
TO anon, authenticated 
USING (true);

-- 3. Habilitar Sincronización en Tiempo Real (Realtime)
-- Permite que cuando una sede o celular guarde un cierre, se actualice instantáneamente en los demás
ALTER PUBLICATION supabase_realtime ADD TABLE public.cierres;

-- 4. Comentarios informativos
COMMENT ON TABLE public.cierres IS 'Registros diarios de caja y ventas para Jungles Bar y La Chichera';
